export * as XiaoxueTrustedAttachments from "./trusted-attachments"

import {
  createTrustedAttachmentFileStore,
  createTrustedAttachmentRegistry,
  parseTrustedAttachmentUrl,
  TrustedAttachmentError,
  type TrustedAttachment,
  type TrustedAttachmentFs,
} from "@opencode-ai/core/util/trusted-attachment"
import { open, realpath, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

// 服务端可信附件解析器：登记表由桌面主进程在原生文件选择器确认后写入，
// 服务端只消费登记条目，绝不根据调用方提交的任意 file:// 路径直接读盘。

export type { TrustedAttachment }

// 桌面端通过 sidecar 环境变量显式指定登记表目录；CLI/开发模式退回
// ~/.local/share/opencode/trusted-attachments（与 opencode-dev.db 同根）
export function dir() {
  return process.env.XIAOXUE_TRUSTED_ATTACHMENTS_DIR ?? path.join(os.homedir(), ".local", "share", "opencode", "trusted-attachments")
}

const nodeFs: TrustedAttachmentFs = {
  async stat(target) {
    const info = await stat(target)
    return { size: info.size, modifiedAt: info.mtimeMs, isDirectory: info.isDirectory() }
  },
  realpath: (target) => realpath(target),
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

function registry() {
  return createTrustedAttachmentRegistry({ store: createTrustedAttachmentFileStore(dir()), fs: nodeFs })
}

// 消费 xiaoxue-attachment:<id> 形式的附件凭证，返回登记条目（含 canonicalPath）
export async function consumeUrl(url: string): Promise<TrustedAttachment> {
  const id = parseTrustedAttachmentUrl(url)
  if (!id) throw new TrustedAttachmentError("ATTACHMENT_NOT_TRUSTED", "附件凭证格式无效。")
  return registry().consume(id)
}

// 兼容模式：历史 file:// 引用只有在用户重新选择过同一文件（登记表存在有效条目）
// 时才允许读取；未登记路径一律拒绝
export async function consumeByPath(canonicalPath: string): Promise<TrustedAttachment> {
  const current = registry()
  const entry = await current.findByCanonicalPath(canonicalPath)
  if (!entry)
    throw new TrustedAttachmentError(
      "ATTACHMENT_NOT_TRUSTED",
      "该路径没有可信附件登记。请使用文件选择器重新选择该文件后再试。",
    )
  return current.consume(entry.id)
}

export async function findByCanonicalPath(canonicalPath: string) {
  return registry().findByCanonicalPath(canonicalPath)
}

// 消费凭证并读取文件字节；大小在登记与复核时已受 100MB 上限约束
export async function readUrl(url: string): Promise<{ entry: TrustedAttachment; bytes: Uint8Array }> {
  const entry = await consumeUrl(url)
  return { entry, bytes: await readEntry(entry) }
}

export async function readPath(canonicalPath: string): Promise<{ entry: TrustedAttachment; bytes: Uint8Array }> {
  const entry = await consumeByPath(canonicalPath)
  return { entry, bytes: await readEntry(entry) }
}

async function readEntry(entry: TrustedAttachment) {
  return new Uint8Array(await (await Bun.file(entry.canonicalPath).arrayBuffer()))
}
