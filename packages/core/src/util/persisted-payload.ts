import { requiresInlineAttachment } from "./attachment"

// 持久化状态（prompt-history / draft / workspace 草稿 / followup 队列）里附件
// dataUrl 的预算。实测 24MB 附件的 base64 重复进历史曾把 opencode.global.dat
// 撑到 165MB，渲染进程在加载时 OOM，因此持久化路径必须裁剪大载荷：
// - 有本地路径或按 file:// 引用发送的附件（Office/文本）直接丢弃内容；
// - 需要内联的类型（图片/PDF）仅在超过单条上限时丢弃，恢复后可按引用重发。
export const PERSISTED_INLINE_DATA_LIMIT = 512 * 1024
// 单条历史记录 / 单个草稿 prompt 的持久化字节上限，超出则清空其中全部 dataUrl
export const PERSISTED_ENTRY_BYTE_LIMIT = 1024 * 1024
// prompt-history 整体的持久化字节上限，超出则从最旧条目开始丢弃
export const PERSISTED_HISTORY_TOTAL_LIMIT = 4 * 1024 * 1024

export type AttachmentPayload = {
  type: string
  mime?: string
  sourcePath?: string
  filename?: string
  dataUrl?: string
}

export function isAttachmentPayload(value: unknown): value is AttachmentPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return record.type === "image" && typeof record.dataUrl === "string"
}

// 单个附件载荷的持久化裁剪。返回原对象表示无需修改。
export function sanitizeAttachmentPayload<T extends AttachmentPayload>(part: T): T {
  if (!part.dataUrl || part.dataUrl.length <= PERSISTED_INLINE_DATA_LIMIT) return part
  if (part.sourcePath || !requiresInlineAttachment(part.mime ?? "")) return { ...part, dataUrl: "" }
  return part
}

// 裁剪 prompt 数组中的附件载荷，保留文件卡片等其余元数据
export function sanitizePersistedPromptParts<T extends AttachmentPayload>(prompt: T[]): T[] {
  let changed = false
  const next = prompt.map((part) => {
    if (!isAttachmentPayload(part)) return part
    const sanitized = sanitizeAttachmentPayload(part)
    if (sanitized !== part) changed = true
    return sanitized
  })
  return changed ? next : prompt
}

// 深度清洗任意嵌套的持久化值（draft store、workspace store、followup 队列等），
// 只动超限的附件载荷，未变化时返回原引用便于调用方判断是否需要回写。
export function sanitizePersistedValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const sanitized = sanitizePersistedValue(item)
      if (sanitized !== item) changed = true
      return sanitized
    })
    return changed ? next : value
  }
  if (typeof value === "object" && value !== null) {
    if (isAttachmentPayload(value)) return sanitizeAttachmentPayload(value)
    let changed = false
    const next: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      const sanitized = sanitizePersistedValue(item)
      if (sanitized !== item) changed = true
      next[key] = sanitized
    }
    return changed ? next : value
  }
  return value
}

// 以序列化后的字符数近似持久化体积（dataUrl 为 ASCII base64，长度约等于字节数）
export function persistedByteLength(value: unknown) {
  return JSON.stringify(value)?.length ?? 0
}

// 清空一个 prompt 数组中全部附件 dataUrl（单条预算超限时的兜底）
export function stripPromptDataUrls<T extends AttachmentPayload>(prompt: T[]): T[] {
  let changed = false
  const next = prompt.map((part) => {
    if (!isAttachmentPayload(part) || !part.dataUrl) return part
    changed = true
    return { ...part, dataUrl: "" }
  })
  return changed ? next : prompt
}

// 恢复后的附件是否因持久化裁剪而失去可发送载荷：dataUrl 已清空、没有本地路径、
// 且属于必须内联的类型（图片/PDF）。这类附件不能静默提交，必须提示用户重新选择原文件。
export function isStrippedInlineAttachment(part: AttachmentPayload): boolean {
  if (!isAttachmentPayload(part)) return false
  if (part.dataUrl || part.sourcePath) return false
  return requiresInlineAttachment(part.mime ?? "")
}

// 历史条目集合的总字节预算：超限时从最旧条目开始丢弃（条目数限制管不住单条超大记录）
export function trimHistoryToByteBudget<T>(entries: T[], limit = PERSISTED_HISTORY_TOTAL_LIMIT): T[] {
  let next = entries
  while (next.length > 1 && persistedByteLength(next) > limit) {
    next = next.slice(0, next.length - 1)
  }
  return next.length === entries.length ? entries : next
}
