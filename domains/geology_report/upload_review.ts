import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { parseDocument } from "../../document_engine"
import type { ParsedDocument, ReviewResult } from "../../document_engine"
import type { ReportAgentState } from "./types"
import { reviewGeologyReportBundle } from "./bundle"
import type { ReviewBundle } from "./bundle"

export type ReviewAttachmentInput = {
  filename?: string
  mime: string
  url: string
  sourcePath?: string
}

// 可信附件解析器由宿主（opencode 服务端）注入：
// - consumeUrl 消费 xiaoxue-attachment:<id> 凭证
// - consumeByPath 仅在登记表存在有效条目时放行历史 file:///sourcePath 引用
export type ReviewTrustedAttachmentResolver = {
  consumeUrl(url: string): Promise<{ canonicalPath: string; fileName: string }>
  consumeByPath(path: string): Promise<{ canonicalPath: string; fileName: string }>
}

export type ResolvedReviewSource = {
  fileName: string
  size: number
  sha256: string
  // 脱敏显示：只保留文件名，不向业务历史泄露完整本地路径
  displayPath: string
}

export type XiaoxueRuntimeStateEvent = {
  type: "xiaoxue.agent.state"
  taskId: string
  sessionId: string
  state: ReportAgentState
  message: string
}

export type GeologyReportReviewEnvelope = {
  type: "geology_report_review_result"
  taskId: string
  result: ReviewResult
  resolvedSources?: ResolvedReviewSource[]
}

export async function reviewUploadedAttachments(input: {
  sessionId: string
  attachments: ReviewAttachmentInput[]
  filenames?: string[]
  primaryReport?: string
  taskId?: string
  trustedAttachments?: ReviewTrustedAttachmentResolver
  onState?: (event: XiaoxueRuntimeStateEvent) => void | Promise<void>
}): Promise<GeologyReportReviewEnvelope> {
  const taskId = input.taskId ?? `review-${Date.now()}`

  try {
    await emit(input, taskId, "reading", "正在读取报告正文、表格和井基础信息...")
    const attachments = selectAttachments(input.attachments, input.filenames)
    if (attachments.length === 0) throw new Error("当前会话中没有可审核的 DOC、DOCX、XLS、XLSX、PDF、TXT 或 CSV 附件。")

    const resolvedSources: ResolvedReviewSource[] = []
    const documents = await Promise.all(
      attachments.map(async (attachment, index) => {
        const data = await readAttachment(attachment, input.trustedAttachments)
        resolvedSources.push({
          fileName: attachmentName(attachment, index),
          size: data.byteLength,
          sha256: createHash("sha256").update(data).digest("hex"),
          displayPath: attachmentName(attachment, index),
        })
        return parseDocument({
          fileId: `${taskId}-${index + 1}`,
          fileName: attachmentName(attachment, index),
          mimeType: attachment.mime,
          data,
          metadata: { source: "session_attachment", sessionId: input.sessionId },
        })
      }),
    )
    const bundle = createBundle(documents, input.primaryReport)

    await emit(input, taskId, "reviewing", "正在检查报告结构、井号、层位、术语和多资料一致性...")
    const result = await reviewGeologyReportBundle({ bundle, taskId })
    await emit(input, taskId, "thinking", "正在汇总问题等级、依据和修改建议...")
    await emit(input, taskId, "success", `审核完成，共发现 ${result.summary.totalIssues} 项问题。`)
    return { type: "geology_report_review_result", taskId, result, resolvedSources }
  } catch (error) {
    await emit(input, taskId, "error", error instanceof Error ? error.message : "报告审核失败。")
    throw error
  }
}

function selectAttachments(attachments: ReviewAttachmentInput[], filenames?: string[]) {
  const supported = attachments.filter((attachment) => isSupported(attachmentName(attachment)))
  if (!filenames?.length) return supported
  const selected = new Set(filenames.map(normalizeName))
  return supported.filter((attachment) => selected.has(normalizeName(attachmentName(attachment))))
}

function createBundle(documents: ParsedDocument[], primaryReport?: string): ReviewBundle {
  const requested = primaryReport ? normalizeName(primaryReport) : undefined
  const primaryReportDocument =
    documents.find((document) => requested && normalizeName(document.fileName) === requested) ??
    documents.find((document) => document.fileType === "doc" || document.fileType === "docx") ??
    documents[0]
  if (!primaryReportDocument) throw new Error("没有找到可作为主报告的文件。")
  return {
    primaryReport: primaryReportDocument,
    attachments: documents.filter((document) => document !== primaryReportDocument),
  }
}

// 附件读取安全模型：
// - data: URL 直接解码（历史内联载荷）
// - xiaoxue-attachment:<id> 凭证由宿主解析器消费登记表
// - file:// / sourcePath 历史引用不再以 process.cwd() 为安全根，而是要求
//   登记表中存在该路径的有效条目（即用户已用原生选择器重新选择过该文件）；
//   未登记路径一律拒绝，不静默信任任何历史路径
async function readAttachment(attachment: ReviewAttachmentInput, resolver?: ReviewTrustedAttachmentResolver) {
  if (attachment.url.startsWith("data:")) return decodeDataUrl(attachment.url)
  if (attachment.url.startsWith("xiaoxue-attachment:")) {
    if (!resolver) throw new Error("附件凭证无法解析：当前宿主没有提供可信附件登记表。")
    const resolved = await resolver.consumeUrl(attachment.url)
    return readAttachmentFile(resolved.canonicalPath, attachment)
  }
  if (attachment.url.startsWith("file:") || attachment.sourcePath) {
    const rawPath = attachment.sourcePath ?? fileUrlToPath(attachment.url)
    if (!resolver)
      throw new Error(`附件"${attachmentName(attachment)}"未通过可信附件登记，请使用文件选择器重新选择该文件后再试。`)
    const resolved = await resolver.consumeByPath(rawPath)
    return readAttachmentFile(resolved.canonicalPath, attachment)
  }
  throw new Error(`无法读取附件"${attachmentName(attachment)}"：附件没有可用的数据地址。`)
}

async function readAttachmentFile(filePath: string, attachment: ReviewAttachmentInput) {
  try {
    return new Uint8Array(await readFile(filePath))
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code === "ENOENT" || code === "ENOTDIR")
      throw new Error(`附件"${attachmentName(attachment)}"已被移动或删除，请使用文件选择器重新选择该文件。`)
    if (code === "EACCES" || code === "EPERM")
      throw new Error(`没有权限读取附件"${attachmentName(attachment)}"，请检查文件访问权限。`)
    throw error
  }
}

function fileUrlToPath(url: string) {
  try {
    return fileURLToPath(url)
  } catch {
    // 历史 file:// 引用可能包含未编码的中文或空格，退回手工剥离 scheme
    const body = url.slice("file:".length).replace(/^\/\//, "").split(/[?#]/)[0]
    const decoded = decodeURIComponentSafe(body)
    if (/^\/[a-zA-Z]:/.test(decoded)) return decoded.slice(1)
    return decoded
  }
}

function decodeURIComponentSafe(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function decodeDataUrl(url: string) {
  const comma = url.indexOf(",")
  if (comma < 0) throw new Error("附件 data URL 格式无效。")
  const header = url.slice(0, comma)
  const payload = url.slice(comma + 1)
  if (header.includes(";base64")) return new Uint8Array(Buffer.from(payload, "base64"))
  return new TextEncoder().encode(decodeURIComponent(payload))
}

function attachmentName(attachment: ReviewAttachmentInput, index = 0) {
  const value = attachment.filename ?? attachment.sourcePath ?? `附件-${index + 1}`
  return value.replaceAll("\\", "/").split("/").at(-1) ?? value
}

function normalizeName(value: string) {
  return value.replaceAll("\\", "/").split("/").at(-1)?.toLowerCase() ?? value.toLowerCase()
}

function isSupported(fileName: string) {
  return [".doc", ".docx", ".xls", ".xlsx", ".txt", ".csv", ".pdf"].some((extension) =>
    fileName.toLowerCase().endsWith(extension),
  )
}

async function emit(
  input: { sessionId: string; onState?: (event: XiaoxueRuntimeStateEvent) => void | Promise<void> },
  taskId: string,
  state: ReportAgentState,
  message: string,
) {
  await input.onState?.({ type: "xiaoxue.agent.state", taskId, sessionId: input.sessionId, state, message })
}
