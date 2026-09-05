export * from "./trusted-attachment"

import { randomBytes } from "node:crypto"
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  TrustedAttachmentError,
  TRUSTED_ATTACHMENT_ID_BYTES,
  TRUSTED_ATTACHMENT_MAX_BYTES,
  TRUSTED_ATTACHMENT_RETRY_WINDOW_MS,
  TRUSTED_ATTACHMENT_TTL_MS,
  type TrustedAttachment,
  type TrustedAttachmentCode,
  type TrustedAttachmentFs,
  type TrustedAttachmentRegistrationInput,
  type TrustedAttachmentSource,
  type TrustedAttachmentStore,
  extensionOf,
  fileHeaderMatchesExtension,
  isWindowsDevicePath,
} from "./trusted-attachment"

// 可信附件登记表的 node 侧实现：高熵 id 生成、文件存储与消费/复核逻辑。
// 类型、错误码与纯校验函数在 ./trusted-attachment（浏览器安全）。

// mtime 比较容差（部分文件系统时间戳精度为秒级）
const MODIFIED_AT_TOLERANCE_MS = 1500

export function createTrustedAttachmentId() {
  return randomBytes(TRUSTED_ATTACHMENT_ID_BYTES).toString("base64url")
}

// 每条登记一个 JSON 文件，写入走临时文件 + rename，避免半写状态被服务端读到
export function createTrustedAttachmentFileStore(dir: string): TrustedAttachmentStore {
  const fileOf = (id: string) => join(dir, `${id}.json`)
  return {
    async save(entry) {
      await mkdir(dir, { recursive: true })
      const target = fileOf(entry.id)
      const tmp = `${target}.${createTrustedAttachmentId().slice(0, 8)}.tmp`
      await writeFile(tmp, JSON.stringify(entry), "utf8")
      await rename(tmp, target)
    },
    async load(id) {
      if (!/^[A-Za-z0-9_-]{32}$/.test(id)) return undefined
      try {
        return JSON.parse(await readFile(fileOf(id), "utf8")) as TrustedAttachment
      } catch {
        return undefined
      }
    },
    async list() {
      let names: string[]
      try {
        names = await readdir(dir)
      } catch {
        return []
      }
      const entries = await Promise.all(
        names
          .filter((name) => name.endsWith(".json"))
          .map(async (name) => {
            try {
              return JSON.parse(await readFile(join(dir, name), "utf8")) as TrustedAttachment
            } catch {
              return undefined
            }
          }),
      )
      return entries.filter((entry): entry is TrustedAttachment => !!entry && typeof entry.id === "string")
    },
    async remove(id) {
      await rm(fileOf(id), { force: true })
    },
    async clear() {
      await rm(dir, { recursive: true, force: true })
    },
  }
}

export function createTrustedAttachmentRegistry(input: {
  store: TrustedAttachmentStore
  fs: TrustedAttachmentFs
  now?: () => number
  ttlMs?: number
  retryWindowMs?: number
  maxBytes?: number
}) {
  const now = () => (input.now ?? Date.now)()
  const ttlMs = input.ttlMs ?? TRUSTED_ATTACHMENT_TTL_MS
  const retryWindowMs = input.retryWindowMs ?? TRUSTED_ATTACHMENT_RETRY_WINDOW_MS
  const maxBytes = input.maxBytes ?? TRUSTED_ATTACHMENT_MAX_BYTES

  async function register(
    senderWebContentsId: number,
    source: TrustedAttachmentSource,
    files: TrustedAttachmentRegistrationInput[],
  ) {
    const registered: TrustedAttachment[] = []
    for (const file of files) {
      const entry = await registerOne(senderWebContentsId, source, file)
      await input.store.save(entry)
      registered.push(entry)
    }
    return registered
  }

  async function registerOne(
    senderWebContentsId: number,
    source: TrustedAttachmentSource,
    file: TrustedAttachmentRegistrationInput,
  ): Promise<TrustedAttachment> {
    if (isWindowsDevicePath(file.absolutePath))
      throw new TrustedAttachmentError("ATTACHMENT_NOT_TRUSTED", "拒绝登记 Windows 设备文件路径。")
    const info = await statFile(file.absolutePath)
    if (info.isDirectory)
      throw new TrustedAttachmentError("ATTACHMENT_TYPE_MISMATCH", "附件必须是普通文件，不能是目录。")
    if (info.size > maxBytes)
      throw new TrustedAttachmentError("ATTACHMENT_TOO_LARGE", "附件超过 100MB 上限，请拆分或压缩后再试。")
    const fileName = file.fileName ?? basenameOf(file.absolutePath)
    const extension = extensionOf(fileName)
    if (input.fs.readHeader) {
      const header = await input.fs.readHeader(file.absolutePath, 8)
      if (header && fileHeaderMatchesExtension(header, extension) === false)
        throw new TrustedAttachmentError("ATTACHMENT_TYPE_MISMATCH", "文件扩展名与文件头不匹配，疑似伪造扩展名。")
    }
    const canonicalPath = await realpathOf(file.absolutePath)
    const createdAt = now()
    return {
      id: createTrustedAttachmentId(),
      absolutePath: file.absolutePath,
      canonicalPath,
      fileName,
      size: info.size,
      mime: file.mime ?? "",
      extension,
      modifiedAt: info.modifiedAt,
      sha256: file.sha256,
      source,
      senderWebContentsId,
      createdAt,
      expiresAt: createdAt + ttlMs,
      consumed: false,
    }
  }

  async function consume(id: string, opts?: { webContentsId?: number }) {
    const entry = await input.store.load(id)
    if (!entry) throw new TrustedAttachmentError("ATTACHMENT_NOT_FOUND", "附件凭证不存在或已被清理。")
    if (opts?.webContentsId !== undefined && entry.senderWebContentsId !== opts.webContentsId)
      throw new TrustedAttachmentError("ATTACHMENT_NOT_TRUSTED", "附件凭证不属于当前窗口。")
    if (now() > entry.expiresAt)
      throw new TrustedAttachmentError("ATTACHMENT_TOKEN_EXPIRED", "附件凭证已过期，请重新选择文件。")
    if (entry.consumed && entry.consumedAt !== undefined && now() - entry.consumedAt > retryWindowMs)
      throw new TrustedAttachmentError("ATTACHMENT_NOT_TRUSTED", "附件凭证已被消费，请重新选择文件。")
    await revalidate(entry)
    const consumed = { ...entry, consumed: true, consumedAt: now() }
    await input.store.save(consumed)
    return consumed
  }

  // 消费前复核磁盘状态：文件仍存在、大小与修改时间一致、符号链接/Junction
  // 没有被重新指向未登记的目标
  async function revalidate(entry: TrustedAttachment) {
    const current = await realpathOf(entry.absolutePath, { missing: "ATTACHMENT_NOT_FOUND" as const })
    if (!samePath(current, entry.canonicalPath))
      throw new TrustedAttachmentError("ATTACHMENT_PATH_CHANGED", "附件链接目标已变化，指向了未登记的文件。")
    const info = await statFile(entry.canonicalPath, { missing: "ATTACHMENT_NOT_FOUND" as const })
    if (info.isDirectory) throw new TrustedAttachmentError("ATTACHMENT_TYPE_MISMATCH", "附件路径当前指向目录。")
    if (info.size !== entry.size)
      throw new TrustedAttachmentError("ATTACHMENT_PATH_CHANGED", "附件大小与登记时不一致，文件可能已被替换。")
    if (Math.abs(info.modifiedAt - entry.modifiedAt) > MODIFIED_AT_TOLERANCE_MS)
      throw new TrustedAttachmentError("ATTACHMENT_PATH_CHANGED", "附件修改时间与登记时不一致，文件可能已被替换。")
    if (entry.sha256) {
      if (!input.fs.sha256)
        throw new TrustedAttachmentError("ATTACHMENT_NOT_TRUSTED", "当前运行时无法复核附件内容完整性。")
      const digest = await input.fs.sha256(entry.canonicalPath).catch((error) => {
        throw mapFsError(error, "ATTACHMENT_NOT_FOUND")
      })
      if (digest !== entry.sha256)
        throw new TrustedAttachmentError("ATTACHMENT_PATH_CHANGED", "附件内容与登记时不一致，文件可能已被替换。")
    }
  }

  async function statFile(path: string, opts?: { missing: TrustedAttachmentCode }) {
    try {
      return await input.fs.stat(path)
    } catch (error) {
      throw mapFsError(error, opts?.missing ?? "ATTACHMENT_NOT_FOUND")
    }
  }

  async function realpathOf(path: string, opts?: { missing: TrustedAttachmentCode }) {
    try {
      return await input.fs.realpath(path)
    } catch (error) {
      throw mapFsError(error, opts?.missing ?? "ATTACHMENT_NOT_FOUND")
    }
  }

  function mapFsError(error: unknown, missingCode: TrustedAttachmentCode): TrustedAttachmentError {
    if (error instanceof TrustedAttachmentError) return error
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code === "ENOENT" || code === "ENOTDIR")
      return new TrustedAttachmentError(missingCode, "附件文件不存在或已被移动。")
    if (code === "EACCES" || code === "EPERM" || code === "EBUSY")
      return new TrustedAttachmentError(
        "ATTACHMENT_PERMISSION_DENIED",
        "没有权限读取该附件，请检查文件或磁盘访问权限。",
      )
    if (code === "ENAMETOOLONG" || code === "EINVAL")
      return new TrustedAttachmentError("ATTACHMENT_NOT_TRUSTED", "附件路径无效。")
    return new TrustedAttachmentError(
      "ATTACHMENT_NOT_TRUSTED",
      error instanceof Error ? error.message : "附件读取失败。",
    )
  }

  // 兼容模式：按规范路径查找仍然有效的登记条目（用户重新选择同一文件后，
  // 历史 file:// 引用凭此恢复读取资格）
  async function findByCanonicalPath(canonicalPath: string) {
    const entries = await input.store.list()
    const timestamp = now()
    return entries.find((entry) => {
      if (!samePath(entry.canonicalPath, canonicalPath)) return false
      if (timestamp > entry.expiresAt) return false
      if (entry.consumed && entry.consumedAt !== undefined && timestamp - entry.consumedAt > retryWindowMs) return false
      return true
    })
  }

  async function purgeExpired() {
    const timestamp = now()
    for (const entry of await input.store.list()) {
      if (timestamp > entry.expiresAt) await input.store.remove(entry.id)
    }
  }

  return { register, consume, findByCanonicalPath, purgeExpired, clear: () => input.store.clear() }
}

export type TrustedAttachmentRegistry = ReturnType<typeof createTrustedAttachmentRegistry>

function samePath(left: string, right: string) {
  if (process.platform === "win32") return left.toLowerCase() === right.toLowerCase()
  return left === right
}

function basenameOf(path: string) {
  const normalized = path.replaceAll("\\", "/")
  return normalized.split("/").at(-1) ?? path
}

// 供测试与诊断使用：统计当前目录中的登记条目数量（不输出任何本地路径）
export async function countTrustedAttachments(store: TrustedAttachmentStore) {
  return (await store.list()).length
}
