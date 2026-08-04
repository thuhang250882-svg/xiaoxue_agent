import { fileURLToPath } from "node:url"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { parseDocument } from "../../../../document_engine"
import type { ParsedDocument } from "../../../../document_engine"
import { XiaoxueTrustedAttachments } from "../xiaoxue/trusted-attachments"

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

// 附件读取必须经过可信附件登记表：
// - data: URL 直接解码
// - xiaoxue-attachment:<id> 消费一次性凭证
// - file:// / sourcePath 历史引用仅在登记表存在有效条目时放行（用户已重新选择）
export async function readAttachment(attachment: XiaoxueAttachment) {
  if (attachment.url.startsWith("data:")) return decodeDataUrl(attachment.url)
  if (attachment.url.startsWith("xiaoxue-attachment:")) {
    const { bytes } = await XiaoxueTrustedAttachments.readUrl(attachment.url)
    return bytes
  }
  if (attachment.url.startsWith("file:")) {
    const { bytes } = await XiaoxueTrustedAttachments.readPath(fileURLToPath(attachment.url))
    return bytes
  }
  if (attachment.sourcePath) {
    const { bytes } = await XiaoxueTrustedAttachments.readPath(attachment.sourcePath)
    return bytes
  }
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
