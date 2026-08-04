import { existsSync, readFileSync, statSync } from "node:fs"
import { parseDocument } from "../../../../document_engine"

const OFFICE_ATTACHMENT_TEXT_LIMIT = 32_000
const OFFICE_ATTACHMENT_OUTPUT_LIMIT = 8_000
// 超过该大小的 Office 文件不再尝试整体解析，避免服务端内存被单文件占满
const OFFICE_ATTACHMENT_FILE_LIMIT = 100 * 1024 * 1024

export const OFFICE_ATTACHMENT_MIMES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
])

export function isOfficeAttachmentMime(mime: string) {
  return OFFICE_ATTACHMENT_MIMES.has(mime.toLowerCase())
}

export async function extractOfficeDataAttachment(input: { filename?: string; mime: string; url: string }) {
  const comma = input.url.indexOf(",")
  if (comma === -1) throw new Error("Office attachment data URL is invalid")

  const header = input.url.slice(0, comma)
  const payload = input.url.slice(comma + 1)
  const data = header.includes(";base64")
    ? new Uint8Array(Buffer.from(payload, "base64"))
    : new TextEncoder().encode(decodeURIComponent(payload))
  return extractOfficeDocument(input.filename ?? "attachment", input.mime, data)
}

// 大附件以 file:// 引用进入会话，服务端直接从磁盘读取解析，字节不再经过会话历史
export async function extractOfficeFileAttachment(input: { filename?: string; mime: string; filepath: string }) {
  // 原始文件可能已被移动或删除：历史审核结果仍可查看，但无法重新解析
  if (!existsSync(input.filepath)) throw new Error("原始附件已移动或删除，无法重新解析该文件")
  const stat = statSync(input.filepath)
  if (!stat.isFile()) throw new Error("附件路径不是普通文件，无法解析")
  if (stat.size > OFFICE_ATTACHMENT_FILE_LIMIT)
    throw new Error(`Office 附件超过 ${OFFICE_ATTACHMENT_FILE_LIMIT / 1024 / 1024} MB 上限，请拆分后重试`)
  const data = new Uint8Array(readFileSync(input.filepath))
  return extractOfficeDocument(input.filename ?? "attachment", input.mime, data)
}

async function extractOfficeDocument(filename: string, mime: string, data: Uint8Array) {
  const document = await parseDocument({
    fileId: `prompt-${Date.now()}`,
    fileName: filename,
    mimeType: mime,
    data,
    metadata: { source: "prompt_attachment" },
  })
  const structured = renderDocumentMarkdown(document)
  const truncated = structured.slice(0, OFFICE_ATTACHMENT_OUTPUT_LIMIT)
  const suffix = structured.length > truncated.length
    ? `\n\n[内容已在 ${OFFICE_ATTACHMENT_OUTPUT_LIMIT} 字符处截断；完整内容共 ${structured.length} 字符，可通过文档工具分段读取。]`
    : ""
  return `[Extracted Office document: ${filename}]\n${truncated}${suffix}`
}

// 将解析结果渲染为 Markdown 结构化文本（标题、段落、表格），而非纯 TXT
export function renderDocumentMarkdown(document: Awaited<ReturnType<typeof parseDocument>>): string {
  const sections: string[] = []

  if (document.paragraphs.length > 0) {
    const bodyText = document.paragraphs
      .map((p) => {
        if (p.headingLevel) return `${"#".repeat(Math.min(p.headingLevel, 6))} ${p.text}`
        return p.text
      })
      .join("\n\n")
    if (bodyText.trim()) sections.push(bodyText)
  }

  if (document.tables.length > 0) {
    for (const table of document.tables) {
      const caption = table.caption ?? table.sheetName ?? `表格 ${table.index}`
      const rows = table.rows.filter((row) => row.some((cell) => cell.trim()))
      if (rows.length === 0) continue
      const markdownTable = [
        `**${caption}**`,
        "",
        `| ${rows[0].join(" | ")} |`,
        `| ${rows[0].map(() => "---").join(" | ")} |`,
        ...rows.slice(1).map((row) => `| ${row.join(" | ")} |`),
      ].join("\n")
      sections.push(markdownTable)
    }
  }

  if (sections.length === 0) return document.rawText
  return sections.join("\n\n")
}
