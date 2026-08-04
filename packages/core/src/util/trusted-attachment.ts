// 可信本地附件登记机制的核心类型与校验逻辑（浏览器安全：不依赖 node API）。
// node 侧的登记表、文件存储与 id 生成见 ./trusted-attachment-registry。
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

export type TrustedAttachmentRegistrationInput = {
  absolutePath: string
  fileName?: string
  mime?: string
  sha256?: string
}
