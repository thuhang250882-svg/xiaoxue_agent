import { app } from "electron"
import { createHash } from "node:crypto"
import { rmSync } from "node:fs"
import { open, realpath, stat } from "node:fs/promises"
import { join } from "node:path"
import {
  createTrustedAttachmentFileStore,
  createTrustedAttachmentRegistry,
  type TrustedAttachment,
  type TrustedAttachmentFs,
  type TrustedAttachmentSource,
} from "@opencode-ai/core/util/trusted-attachment-registry"

// 桌面主进程可信附件登记：只有原生文件选择器确认过的文件才会进入登记表，
// 渲染进程不能自行登记任意路径。登记表目录通过 sidecar 环境变量传给
// opencode 服务端（见 server.ts），应用退出时整体清空。

export function trustedAttachmentDir() {
  return join(app.getPath("userData"), "xiaoxue", "trusted-attachments")
}

const nodeFs: TrustedAttachmentFs = {
  async stat(path) {
    const info = await stat(path)
    return { size: info.size, modifiedAt: info.mtimeMs, isDirectory: info.isDirectory() }
  },
  realpath: (path) => realpath(path),
  async readHeader(path, length) {
    const file = await open(path, "r")
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

let cached: ReturnType<typeof createTrustedAttachmentRegistry> | undefined

export function trustedAttachments() {
  cached ??= createTrustedAttachmentRegistry({
    store: createTrustedAttachmentFileStore(trustedAttachmentDir()),
    fs: nodeFs,
  })
  return cached
}

export type TrustedAttachmentFileInput = {
  absolutePath: string
  fileName: string
  mime: string
}

// 登记选择器确认的文件并为每个文件计算 SHA-256，供重新授权时比对文件是否变化
export async function registerTrustedFiles(
  senderWebContentsId: number,
  source: TrustedAttachmentSource,
  files: TrustedAttachmentFileInput[],
): Promise<TrustedAttachment[]> {
  const withHash = await Promise.all(
    files.map(async (file) => ({ ...file, sha256: await sha256OfFile(file.absolutePath) })),
  )
  return trustedAttachments().register(senderWebContentsId, source, withHash)
}

async function sha256OfFile(path: string) {
  const file = await open(path, "r")
  try {
    const hash = createHash("sha256")
    const buffer = Buffer.allocUnsafe(1024 * 1024)
    let offset = 0
    while (true) {
      const result = await file.read(buffer, 0, buffer.length, offset)
      if (result.bytesRead === 0) break
      hash.update(buffer.subarray(0, result.bytesRead))
      offset += result.bytesRead
    }
    return hash.digest("hex")
  } finally {
    await file.close()
  }
}

// 应用退出后登记表失效：直接删除整个目录（will-quit 阶段必须同步完成）
export function clearTrustedAttachmentsOnQuit(dir = trustedAttachmentDir()) {
  rmSync(dir, { recursive: true, force: true })
}
