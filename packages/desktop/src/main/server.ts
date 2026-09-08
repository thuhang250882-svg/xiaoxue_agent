import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { app, utilityProcess } from "electron"
import type { Details } from "electron"
import { getLogger } from "./logging"
import { credentialEncryptionKey } from "./credential-key"
import { getUserShell, loadShellEnv } from "./shell-env"
import { bundledSkillsDir, managedSkillsDir } from "./skills"
import { withBundledSkills } from "./skills-config"
import { ensureDefaultObsidianVault } from "./obsidian-plugin"
import { enterprisePolicy, enterprisePolicyPath } from "./enterprise-policy"
import { applyOfflineSidecarPolicy } from "./sidecar-environment"
import { governanceDatabasePath } from "./governance-database"
import { getStore } from "./store"
import { DEFAULT_SERVER_URL_KEY } from "./store-keys"
import { trustedAttachmentDir } from "./trusted-attachments"

export type HealthCheck = { wait: Promise<void> }

type SidecarMessage =
  | { type: "ready" }
  | { type: "stopped" }
  | { type: "error"; error: { message: string; stack?: string } }

export type SidecarListener = { stop: () => Promise<void> }

const SIDECAR_SERVICE_NAME = "opencode server"
const SIDECAR_START_STALL_TIMEOUT = 60_000
const SIDECAR_STOP_TIMEOUT = 6_000

type SpawnLocalServerOptions = {
  userDataPath: string
  onStdout?: (message: string) => void
  onStderr?: (message: string) => void
  onExit?: (code: number) => void
}

export function getDefaultServerUrl(): string | null {
  const value = getStore().get(DEFAULT_SERVER_URL_KEY)
  return typeof value === "string" ? value : null
}

export function setDefaultServerUrl(url: string | null) {
  if (url) {
    getStore().set(DEFAULT_SERVER_URL_KEY, url)
    return
  }

  getStore().delete(DEFAULT_SERVER_URL_KEY)
}

export function preferAppEnv(userDataPath: string) {
  const shell = process.platform === "win32" ? null : getUserShell()
  const shellEnv = shell ? loadShellEnv(shell, getLogger()) : null
  Object.assign(process.env, {
    ...shellEnv,
    OPENCODE_EXPERIMENTAL_ICON_DISCOVERY: "true",
    OPENCODE_EXPERIMENTAL_FILEWATCHER: "true",
    OPENCODE_CLIENT: "desktop",
    XDG_STATE_HOME: process.env.XDG_STATE_HOME ?? userDataPath,
  })
  return shellEnv
}

export async function spawnLocalServer(
  hostname: string,
  port: number,
  password: string,
  options: SpawnLocalServerOptions,
) {
  const sidecar = join(dirname(fileURLToPath(import.meta.url)), "sidecar.js")
  const child = utilityProcess.fork(sidecar, [], {
    cwd: process.cwd(),
    env: await createSidecarEnv(),
    serviceName: SIDECAR_SERVICE_NAME,
    stdio: "pipe",
  })
  let exited = false
  const exit = defer<number>()

  const onProcessGone = (_event: unknown, details: Details) => {
    if (details.type !== "Utility" || details.name !== SIDECAR_SERVICE_NAME) return
    options.onStderr?.(`utility process gone reason=${details.reason} exitCode=${details.exitCode}`)
  }

  app.on("child-process-gone", onProcessGone)
  child.once("exit", (code) => {
    exited = true
    app.off("child-process-gone", onProcessGone)
    options.onExit?.(code)
    exit.resolve(code)
  })
  child.on("error", (error) => options.onStderr?.(`utility process error: ${serializeError(error).message}`))

  child.stdout?.on("data", (chunk: Buffer) => options.onStdout?.(chunk.toString("utf8").trimEnd()))
  child.stderr?.on("data", (chunk: Buffer) => options.onStderr?.(chunk.toString("utf8").trimEnd()))

  await new Promise<void>((resolve, reject) => {
    let done = false
    let timeout: NodeJS.Timeout

    const fail = (error: Error) => {
      if (done) return
      done = true
      cleanup()
      reject(error)
    }

    const refreshTimeout = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        fail(new Error(`Sidecar did not become ready within ${SIDECAR_START_STALL_TIMEOUT}ms: ${sidecar}`))
      }, SIDECAR_START_STALL_TIMEOUT)
    }

    const onMessage = (message: SidecarMessage) => {
      if (message.type === "ready") {
        if (done) return
        done = true
        cleanup()
        resolve()
        return
      }
      if (message.type === "error") {
        fail(Object.assign(new Error(message.error.message), { stack: message.error.stack }))
      }
    }
    const onExit = (code: number) => {
      fail(new Error(`Sidecar exited before ready with code ${code}`))
    }
    const cleanup = () => {
      clearTimeout(timeout)
      child.off("message", onMessage)
      child.off("exit", onExit)
    }

    child.on("message", onMessage)
    child.on("exit", onExit)
    refreshTimeout()
    child.postMessage({
      type: "start",
      hostname,
      port,
      password,
      userDataPath: options.userDataPath,
    })
  }).catch((error) => {
    if (!exited) child.kill()
    throw error
  })

  const wait = (async () => {
    const url = `http://${hostname}:${port}`
    let healthy = false
    const gone = exit.promise.then((code) => {
      if (healthy) return
      throw new Error(`Sidecar exited before health check passed with code ${code}`)
    })

    const ready = async () => {
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        if (await checkHealth(url, password)) {
          healthy = true
          return
        }
      }
    }

    await Promise.race([ready(), gone])
  })()

  let stopping: Promise<void> | undefined

  return {
    listener: {
      stop: () => {
        if (stopping) return stopping
        if (exited) return Promise.resolve()
        child.postMessage({ type: "stop" })
        stopping = Promise.race([
          exit.promise.then(() => undefined),
          delay(SIDECAR_STOP_TIMEOUT).then(() => {
            if (!exited) child.kill()
          }),
        ])
        return stopping
      },
    },
    health: { wait },
  }
}

export async function checkHealth(url: string, password?: string | null): Promise<boolean> {
  let healthUrls: URL[]
  try {
    healthUrls = [new URL("/api/health", url), new URL("/global/health", url)]
  } catch {
    return false
  }

  const headers = new Headers()
  if (password) {
    const auth = Buffer.from(`opencode:${password}`).toString("base64")
    headers.set("authorization", `Basic ${auth}`)
  }

  for (const healthUrl of healthUrls) {
    try {
      const res = await fetch(healthUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(3000),
      })
      if (res.ok) return true
    } catch {}
  }
  return false
}

async function createSidecarEnv(): Promise<Record<string, string>> {
  const env = Object.fromEntries(
    Object.entries(process.env).flatMap(([key, value]) => (value === undefined ? [] : [[key, value]])),
  )
  delete env.DEBUG
  if (process.platform === "linux") delete env.LD_PRELOAD
  if (!app.isPackaged) env.OPENCODE_DISABLE_CHANNEL_DB = "1"
  env.XIAOXUE_CREDENTIAL_ENCRYPTION_KEY = credentialEncryptionKey()
  const policy = enterprisePolicy()
  const policyPath = enterprisePolicyPath()
  const policyExists = existsSync(policyPath)
  if (policyExists) env.XIAOXUE_ENTERPRISE_POLICY_PATH = policyPath
  if (!policyExists && !env.XIAOXUE_ENTERPRISE_POLICY_CONTENT) {
    env.XIAOXUE_ENTERPRISE_POLICY_CONTENT = JSON.stringify(policy)
  }
  applyOfflineSidecarPolicy(env, policy)
  env.XIAOXUE_GOVERNANCE_DB = governanceDatabasePath()
  // 可信附件登记表目录：主进程写入、sidecar 服务端按凭证消费
  env.XIAOXUE_TRUSTED_ATTACHMENTS_DIR = trustedAttachmentDir()
  // Register the bundled preset skills for every project the server opens
  // while preserving user-provided inline config and additional skill paths.
  const bundledSkills = bundledSkillsDir()
  const skills = managedSkillsDir(bundledSkills)
  if (bundledSkills && skills) {
    // Keep the immutable packaged catalog and the writable unified catalog as
    // separate sources. Managed policy may allow bundled skills while still
    // rejecting user-created skills from the writable catalog.
    env.OPENCODE_CONFIG_CONTENT = withBundledSkills(
      withBundledSkills(env.OPENCODE_CONFIG_CONTENT, skills),
      bundledSkills,
    )
    env.XIAOXUE_BUNDLED_SKILLS_DIR = bundledSkills
  }
  const skillCatalog = join(process.resourcesPath, "catalog", "skill-catalog.json")
  if (existsSync(skillCatalog)) env.XIAOXUE_SKILL_CATALOG_PATH = skillCatalog
  env.XIAOXUE_OBSIDIAN_VAULT = await ensureDefaultObsidianVault(env.XIAOXUE_OBSIDIAN_VAULT)
  return env
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function serializeError(error: unknown) {
  if (error instanceof Error) return { message: error.message, stack: error.stack }
  return { message: String(error) }
}

function defer<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
