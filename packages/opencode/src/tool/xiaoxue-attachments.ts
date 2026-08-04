import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { parseDocument } from "../../../../document_engine"
import type { ParsedDocument } from "../../../../document_engine"

export type XiaoxueAttachment = {
  filename: string
  mime: string
  url: string
  sourcePath?: string
}

export function latestUserAttachments(messages: SessionV1.WithParts[]): XiaoxueAttachment[] {
  const message = [...messages].reverse().find((item) => item.info.role === "user")
  if (!message) return []
  return message.parts
    .filter((part): part is SessionV1.FilePart => part.type === "file")
    .map((part) => ({
      filename: part.filename ?? "未命名附件",
      mime: part.mime,
      url: part.url,
      sourcePath: part.source?.type === "file" ? part.source.path : undefined,
    }))
}

export async function parseAttachments(
  attachments: XiaoxueAttachment[],
  supported = [".doc", ".docx", ".xls", ".xlsx", ".txt", ".csv", ".md"],
): Promise<ParsedDocument[]> {
  const selected = attachments.filter((attachment) =>
    supported.some((extension) => attachment.filename.toLowerCase().endsWith(extension)),
  )
  if (!selected.length) throw new Error(`当前会话没有可读取的附件，支持：${supported.join("、")}。`)
  return Promise.all(
    selected.map(async (attachment, index) =>
      parseDocument({
        fileId: `attachment-${Date.now()}-${index + 1}`,
        fileName: attachment.filename,
        mimeType: attachment.mime,
        data: await readAttachment(attachment),
        metadata: { source: "session_attachment" },
      }),
    ),
  )
}

export async function readAttachment(attachment: XiaoxueAttachment) {
  if (attachment.url.startsWith("data:")) return decodeDataUrl(attachment.url)
  if (attachment.url.startsWith("file:")) return new Uint8Array(readFileSync(fileURLToPath(attachment.url)))
  if (attachment.sourcePath) return new Uint8Array(readFileSync(attachment.sourcePath))
  throw new Error(`无法读取附件“${attachment.filename}”：没有可用的数据地址。`)
}

function decodeDataUrl(url: string) {
  const comma = url.indexOf(",")
  if (comma < 0) throw new Error("附件 data URL 格式无效。")
  const header = url.slice(0, comma)
  const payload = url.slice(comma + 1)
  if (header.includes(";base64")) return new Uint8Array(Buffer.from(payload, "base64"))
  return new TextEncoder().encode(decodeURIComponent(payload))
}
