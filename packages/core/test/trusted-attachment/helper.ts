import { mkdir, mkdtemp, open, readFile, realpath, rm, stat, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import os from "node:os"
import path from "node:path"
import {
  createTrustedAttachmentFileStore,
  createTrustedAttachmentRegistry,
  type TrustedAttachmentFs,
  type TrustedAttachmentStore,
} from "@opencode-ai/core/util/trusted-attachment-registry"

// 真实 node fs 适配：登记表与测试文件都落在临时目录，测试间互不影响
export const nodeFs: TrustedAttachmentFs = {
  async stat(target) {
    const info = await stat(target)
    return { size: info.size, modifiedAt: info.mtimeMs, isDirectory: info.isDirectory() }
  },
  realpath: (target) => realpath(target),
  sha256: async (target) =>
    createHash("sha256")
      .update(await readFile(target))
      .digest("hex"),
  async readHeader(target, length) {
    const file = await open(target, "r")
    try {
      const buffer = Buffer.alloc(length)
      const result = await file.read(buffer, 0, length, 0)
      return new Uint8Array(buffer.buffer, 0, result.bytesRead)
    } catch {
      return undefined
    } finally {
      await file.close()
    }
  },
}

export type TestHarness = {
  registry: ReturnType<typeof createTrustedAttachmentRegistry>
  store: TrustedAttachmentStore
  registryDir: string
  dataDir: string
  setNow: (value: number) => void
  cleanup: () => Promise<void>
}

export async function createHarness(options?: {
  now?: () => number
  ttlMs?: number
  retryWindowMs?: number
  maxBytes?: number
  fs?: TrustedAttachmentFs
}): Promise<TestHarness> {
  const root = await mkdtemp(path.join(os.tmpdir(), "xiaoxue-ta-"))
  const registryDir = path.join(root, "registry")
  const dataDir = path.join(root, "data")
  await mkdir(dataDir, { recursive: true })
  let clock = options?.now?.() ?? Date.now()
  const store = createTrustedAttachmentFileStore(registryDir)
  const registry = createTrustedAttachmentRegistry({
    store,
    fs: options?.fs ?? nodeFs,
    now: () => clock,
    ttlMs: options?.ttlMs,
    retryWindowMs: options?.retryWindowMs,
    maxBytes: options?.maxBytes,
  })
  return {
    registry,
    store,
    registryDir,
    dataDir,
    setNow: (value) => {
      clock = value
    },
    cleanup: () => rm(root, { recursive: true, force: true }),
  }
}

export async function createFile(dir: string, name: string, content: string) {
  const target = path.join(dir, name)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, content, "utf8")
  return target
}
