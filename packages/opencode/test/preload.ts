// IMPORTANT: Set env vars BEFORE any imports from src/ directory
// xdg-basedir reads env vars at import time, so we must set these first
import os from "os"
import path from "path"
import fs from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import { afterAll } from "bun:test"

// Set XDG env vars FIRST, before any src/ imports
const dir = path.join(os.tmpdir(), "opencode-test-data-" + process.pid)
await fs.mkdir(dir, { recursive: true })

process.env["XDG_DATA_HOME"] = path.join(dir, "share")
process.env["XDG_CACHE_HOME"] = path.join(dir, "cache")
process.env["XDG_CONFIG_HOME"] = path.join(dir, "config")
process.env["XDG_STATE_HOME"] = path.join(dir, "state")
process.env["OPENCODE_MODELS_PATH"] = path.join(import.meta.dir, "tool", "fixtures", "models-api.json")
process.env["OPENCODE_EXPERIMENTAL_EVENT_SYSTEM"] = "true"
process.env["OPENCODE_EXPERIMENTAL_WORKSPACES"] = "true"
process.env["XIAOXUE_CREDENTIAL_ENCRYPTION_KEY"] = Buffer.alloc(32, 7).toString("base64")
if (process.platform === "win32" && !process.env.WINDIR) process.env.WINDIR = process.env.SystemRoot ?? "C:\\Windows"

// Set test home directory to isolate tests from user's actual home directory
// This prevents tests from picking up real user configs/skills from ~/.claude/skills
const testHome = path.join(dir, "home")
await fs.mkdir(testHome, { recursive: true })
process.env["OPENCODE_TEST_HOME"] = testHome

// Set test managed config directory to isolate tests from system managed settings
const testManagedConfigDir = path.join(dir, "managed")
process.env["OPENCODE_TEST_MANAGED_CONFIG_DIR"] = testManagedConfigDir

// Write the cache version file to prevent global/index.ts from clearing the cache
const cacheDir = path.join(dir, "cache", "opencode")
await fs.mkdir(cacheDir, { recursive: true })
await fs.writeFile(path.join(cacheDir, "version"), "14")

// Clear provider and server auth env vars to ensure clean test state
delete process.env["ANTHROPIC_API_KEY"]
delete process.env["OPENAI_API_KEY"]
delete process.env["GOOGLE_API_KEY"]
delete process.env["GOOGLE_GENERATIVE_AI_API_KEY"]
delete process.env["AZURE_OPENAI_API_KEY"]
delete process.env["AWS_ACCESS_KEY_ID"]
delete process.env["AWS_PROFILE"]
delete process.env["AWS_REGION"]
delete process.env["AWS_BEARER_TOKEN_BEDROCK"]
delete process.env["OPENROUTER_API_KEY"]
delete process.env["LLM_GATEWAY_API_KEY"]
delete process.env["GROQ_API_KEY"]
delete process.env["MISTRAL_API_KEY"]
delete process.env["PERPLEXITY_API_KEY"]
delete process.env["TOGETHER_API_KEY"]
delete process.env["XAI_API_KEY"]
delete process.env["DEEPSEEK_API_KEY"]
delete process.env["FIREWORKS_API_KEY"]
delete process.env["CEREBRAS_API_KEY"]
delete process.env["SAMBANOVA_API_KEY"]
delete process.env["OPENCODE_SERVER_PASSWORD"]
delete process.env["OPENCODE_SERVER_USERNAME"]
delete process.env["OPENCODE_EXPERIMENTAL"]
delete process.env["OPENCODE_ENABLE_EXPERIMENTAL_MODELS"]
delete process.env["OTEL_EXPORTER_OTLP_ENDPOINT"]
delete process.env["OTEL_EXPORTER_OTLP_HEADERS"]
delete process.env["OTEL_RESOURCE_ATTRIBUTES"]

// Use in-memory sqlite
process.env["OPENCODE_DB"] = ":memory:"

// Now safe to import from src/
const { initProjectors } = await import("../src/server/projectors")

initProjectors()

afterAll(async () => {
  const { InstanceRuntime } = await import("../src/project/instance-runtime")
  const warning = setTimeout(() => console.error("instance cleanup is still running after 4 seconds"), 4_000)
  await InstanceRuntime.disposeAllInstances().finally(() => clearTimeout(warning))
})

afterAll(async () => {
  const { AppRuntime } = await import("../src/effect/app-runtime")
  const warning = setTimeout(() => console.error("runtime cleanup is still running after 4 seconds"), 4_000)
  await AppRuntime.dispose().finally(() => clearTimeout(warning))
})

// Instance disposal, runtime shutdown, and Windows filesystem cleanup are
// separate lifecycle phases; all retain Bun's default hook deadline.
afterAll(async () => {
  const warning = setTimeout(() => console.error("filesystem cleanup is still running after 4 seconds"), 4_000)
  await (async () => {
    const busy = (error: unknown) =>
      typeof error === "object" && error !== null && "code" in error && error.code === "EBUSY"
    const rm = async (left: number): Promise<void> => {
      Bun.gc(true)
      await sleep(100)
      return fs.rm(dir, { recursive: true, force: true }).catch((error) => {
        if (!busy(error)) throw error
        if (left <= 1 && process.platform !== "win32") throw error
        if (left <= 1) return
        return rm(left - 1)
      })
    }

    // Snapshot tests create many independent Git object directories. Removing
    // those bounded batches first avoids one long recursive Windows traversal.
    const snapshot = path.join(dir, "share", "opencode", "snapshot")
    const projects = await fs.readdir(snapshot, { withFileTypes: true }).catch(() => [])
    for (let offset = 0; offset < projects.length; offset += 8) {
      await Promise.all(
        projects.slice(offset, offset + 8).map((entry) =>
          fs.rm(path.join(snapshot, entry.name), { recursive: true, force: true }).catch((error) => {
            if (!busy(error)) throw error
          }),
        ),
      )
    }

    // Windows can keep SQLite WAL handles alive until GC finalizers run, so we
    // force GC and retry teardown to avoid flaky EBUSY in test cleanup.
    await rm(30)
  })().finally(() => clearTimeout(warning))
})
