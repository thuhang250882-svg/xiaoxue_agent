import { randomBytes } from "node:crypto"
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

// 可信本地附件登记机制的核心类型与校验逻辑。
// 登记表由桌面主进程在原生文件选择器确认后写入，服务端只能通过高熵
// attachmentId 消费登记条目；任何未经登记的 file:// 路径一律拒绝。

export type TrustedAttachmentSource = "native-picker" | "trusted-drop"

export type TrustedAttachment = {
  id: string
  absolutePath: string
  canonicalPath: string
  fileName: string
  size: number
  mime: string
  extension: string
  modifiedAt: number
  sha256?: string
  source: TrustedAttachmentSource
  senderWebContentsId: number
  createdAt: number
  expiresAt: number
  consumed: boolean
  consumedAt?: number
}

export const TRUSTED_ATTACHMENT_CODES = [
  "ATTACHMENT_NOT_TRUSTED",
  "ATTACHMENT_TOKEN_EXPIRED",
  "ATTACHMENT_NOT_FOUND",
  "ATTACHMENT_PERMISSION_DENIED",
  "ATTACHMENT_TOO_LARGE",
  "ATTACHMENT_TYPE_MISMATCH",
  "ATTACHMENT_PATH_CHANGED",
] as const

export type TrustedAttachmentCode = (typeof TRUSTED_ATTACHMENT_CODES)[number]

export class TrustedAttachmentError extends Error {
  code: TrustedAttachmentCode

  constructor(code: TrustedAttachmentCode, message: string) {
    super(message)
    this.name = "TrustedAttachmentError"
    this.code = code
  }
}

export const TRUSTED_ATTACHMENT_URL_SCHEME = "xiaoxue-attachment:"
// 登记条目默认 24 小时过期；应用退出时登记表整体清空
export const TRUSTED_ATTACHMENT_TTL_MS = 24 * 60 * 60 * 1000
// 消费后允许在窗口内重复消费：覆盖同一轮提交失败重试与审核工具的二次读取
export const TRUSTED_ATTACHMENT_RETRY_WINDOW_MS = 30 * 60 * 1000
// Office/文本附件单文件上限
export const TRUSTED_ATTACHMENT_MAX_BYTES = 100 * 1024 * 1024
// 192bit 高熵随机值，禁止可枚举或可预测的 token
export const TRUSTED_ATTACHMENT_ID_BYTES = 24
// mtime 比较容差（部分文件系统时间戳精度为秒级）
const MODIFIED_AT_TOLERANCE_MS = 1500

export function createTrustedAttachmentId() {
  return randomBytes(TRUSTED_ATTACHMENT_ID_BYTES).toString("base64url")
}

export function trustedAttachmentUrl(id: string) {
  return `${TRUSTED_ATTACHMENT_URL_SCHEME}${id}`
}

export function parseTrustedAttachmentUrl(url: string): string | undefined {
  if (!url.startsWith(TRUSTED_ATTACHMENT_URL_SCHEME)) return undefined
  const id = url.slice(TRUSTED_ATTACHMENT_URL_SCHEME.length)
  return /^[A-Za-z0-9_-]{32}$/.test(id) ? id : undefined
}

// Windows 保留设备名（CON/PRN/AUX/NUL/COMx/LPTx），作为文件名主干时禁止登记
const WINDOWS_RESERVED_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`),
])

export function isWindowsDevicePath(input: string) {
  const normalized = input.replaceAll("/", "\\")
  // \\.\ 设备命名空间与 \\?\ 原始路径前缀都会绕过常规路径规范化
  if (normalized.startsWith("\\\\.\\") || normalized.startsWith("\\\\?\\")) return true
  const segments = normalized.split("\\").filter(Boolean)
  const last = segments.at(-1) ?? ""
  // 备用数据流（file.txt:hidden）同样拒绝
  if (last.includes(":")) return true
  const stem = last.split(".")[0]?.toUpperCase() ?? ""
  return WINDOWS_RESERVED_NAMES.has(stem)
}

// 常见 Office/PDF 文件头魔数；扩展名与文件头明显不符时拒绝登记
const FILE_HEADER_MAGIC: Record<string, number[]> = {
  ".docx": [0x50, 0x4b, 0x03, 0x04],
  ".xlsx": [0x50, 0x4b, 0x03, 0x04],
  ".doc": [0xd0, 0xcf, 0x11, 0xe0],
  ".xls": [0xd0, 0xcf, 0x11, 0xe0],
  ".pdf": [0x25, 0x50, 0x44, 0x46],
}

// true=匹配 false=明显不匹配 undefined=该扩展名没有可用的魔数校验
export function fileHeaderMatchesExtension(header: Uint8Array, extension: string): boolean | undefined {
  const magic = FILE_HEADER_MAGIC[extension.toLowerCase()]
  if (!magic) return undefined
  return magic.every((byte, index) => header[index] === byte)
}

export function extensionOf(fileName: string) {
  const index = fileName.lastIndexOf(".")
  return index === -1 ? "" : fileName.slice(index).toLowerCase()
}

function samePath(left: string, right: string) {
  if (process.platform === "win32") return left.toLowerCase() === right.toLowerCase()
  return left === right
}

export type TrustedAttachmentStat = { size: number; modifiedAt: number; isDirectory: boolean }

export type TrustedAttachmentFs = {
  stat(path: string): Promise<TrustedAttachmentStat>
  realpath(path: string): Promise<string>
  readHeader?(path: string, length: number): Promise<Uint8Array | undefined>
}

export type TrustedAttachmentStore = {
  save(entry: TrustedAttachment): Promise<void>
  load(id: string): Promise<TrustedAttachment | undefined>
  list(): Promise<TrustedAttachment[]>
  remove(id: string): Promise<void>
  clear(): Promise<void>
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

export type TrustedAttachmentRegistrationInput = {
  absolutePath: string
  fileName?: string
  mime?: string
  sha256?: string
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
    if (now() > entry.expiresAt) throw new TrustedAttachmentError("ATTACHMENT_TOKEN_EXPIRED", "附件凭证已过期，请重新选择文件。")
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
    const info = await statFile(entry.canonicalPath, { missing: "ATTACHMENT_NOT_FOUND" as const })
    if (info.isDirectory)
      throw new TrustedAttachmentError("ATTACHMENT_TYPE_MISMATCH", "附件路径当前指向目录。")
    if (info.size !== entry.size)
      throw new TrustedAttachmentError("ATTACHMENT_PATH_CHANGED", "附件大小与登记时不一致，文件可能已被替换。")
    if (Math.abs(info.modifiedAt - entry.modifiedAt) > MODIFIED_AT_TOLERANCE_MS)
      throw new TrustedAttachmentError("ATTACHMENT_PATH_CHANGED", "附件修改时间与登记时不一致，文件可能已被替换。")
    const current = await realpathOf(entry.canonicalPath, { missing: "ATTACHMENT_NOT_FOUND" as const })
    if (!samePath(current, entry.canonicalPath))
      throw new TrustedAttachmentError("ATTACHMENT_PATH_CHANGED", "附件链接目标已变化，指向了未登记的文件。")
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
    if (code === "ENOENT" || code === "ENOTDIR") return new TrustedAttachmentError(missingCode, "附件文件不存在或已被移动。")
    if (code === "EACCES" || code === "EPERM" || code === "EBUSY")
      return new TrustedAttachmentError("ATTACHMENT_PERMISSION_DENIED", "没有权限读取该附件，请检查文件或磁盘访问权限。")
    if (code === "ENAMETOOLONG" || code === "EINVAL")
      return new TrustedAttachmentError("ATTACHMENT_NOT_TRUSTED", "附件路径无效。")
    return new TrustedAttachmentError("ATTACHMENT_NOT_TRUSTED", error instanceof Error ? error.message : "附件读取失败。")
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

function basenameOf(path: string) {
  const normalized = path.replaceAll("\\", "/")
  return normalized.split("/").at(-1) ?? path
}

// 供测试与诊断使用：统计当前目录中的登记条目数量（不输出任何本地路径）
export async function countTrustedAttachments(store: TrustedAttachmentStore) {
  return (await store.list()).length
}
