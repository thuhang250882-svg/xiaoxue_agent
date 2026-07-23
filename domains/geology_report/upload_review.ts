import { parseDocument } from "../../document_engine"
import type { ParsedDocument, ReviewResult } from "../../document_engine"
import type { ReportAgentState } from "./types"
import { reviewGeologyReportBundle } from "./bundle"
import type { ReviewBundle } from "./bundle"
import path from "node:path"

export type ReviewAttachmentInput = {
  filename?: string
  mime: string
  url: string
  sourcePath?: string
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
}

export async function reviewUploadedAttachments(input: {
  sessionId: string
  attachments: ReviewAttachmentInput[]
  filenames?: string[]
  primaryReport?: string
  taskId?: string
  onState?: (event: XiaoxueRuntimeStateEvent) => void | Promise<void>
}): Promise<GeologyReportReviewEnvelope> {
  const taskId = input.taskId ?? `review-${Date.now()}`

  try {
    await emit(input, taskId, "reading", "正在读取报告正文、表格和井基础信息...")
    const attachments = selectAttachments(input.attachments, input.filenames)
    if (attachments.length === 0) throw new Error("当前会话中没有可审核的 DOCX、XLSX、TXT 或 CSV 附件。")

    const documents = await Promise.all(
      attachments.map(async (attachment, index) =>
        parseDocument({
          fileId: `${taskId}-${index + 1}`,
          fileName: attachmentName(attachment, index),
          mimeType: attachment.mime,
          data: await readAttachment(attachment),
          metadata: { source: "session_attachment", sessionId: input.sessionId },
        }),
      ),
    )
    const bundle = createBundle(documents, input.primaryReport)

    await emit(input, taskId, "reviewing", "正在检查报告结构、井号、层位、术语和多资料一致性...")
    const result = await reviewGeologyReportBundle({ bundle, taskId })
    await emit(input, taskId, "thinking", "正在汇总问题等级、依据和修改建议...")
    await emit(input, taskId, "success", `审核完成，共发现 ${result.summary.totalIssues} 项问题。`)
    return { type: "geology_report_review_result", taskId, result }
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
    documents.find((document) => document.fileType === "docx") ??
    documents[0]
  if (!primaryReportDocument) throw new Error("没有找到可作为主报告的文件。")
  return {
    primaryReport: primaryReportDocument,
    attachments: documents.filter((document) => document !== primaryReportDocument),
  }
}

/** 允许读取文件的安全根目录（工作目录及其子目录） */
const ALLOWED_ROOT = path.resolve(process.cwd())

/** 校验文件路径在允许的安全根目录内，防止路径遍历攻击 */
function assertSafePath(filePath: string): string {
  const resolved = path.resolve(filePath)
  const relative = path.relative(ALLOWED_ROOT, resolved)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`安全限制：拒绝访问工作目录之外的文件 "${filePath}"`)
  }
  return resolved
}

async function readAttachment(attachment: ReviewAttachmentInput) {
  if (attachment.url.startsWith("data:")) return decodeDataUrl(attachment.url)
  if (attachment.url.startsWith("file:")) {
    const { fileURLToPath } = await import("url")
    const filePath = assertSafePath(fileURLToPath(attachment.url))
    return new Uint8Array(await Bun.file(filePath).arrayBuffer())
  }
  if (attachment.sourcePath) {
    const filePath = assertSafePath(attachment.sourcePath)
    return new Uint8Array(await Bun.file(filePath).arrayBuffer())
  }
  throw new Error(`无法读取附件"${attachmentName(attachment)}"：附件没有可用的数据地址。`)
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
  return [".docx", ".xlsx", ".txt", ".csv", ".pdf"].some((extension) => fileName.toLowerCase().endsWith(extension))
}

async function emit(
  input: { sessionId: string; onState?: (event: XiaoxueRuntimeStateEvent) => void | Promise<void> },
  taskId: string,
  state: ReportAgentState,
  message: string,
) {
  await input.onState?.({ type: "xiaoxue.agent.state", taskId, sessionId: input.sessionId, state, message })
}