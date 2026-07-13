import { convertToHtml, extractRawText } from "mammoth"
import { createParsedDocument, normalizeBinaryContent } from "../types"
import type { DocumentParagraph, DocumentParser, DocumentTable } from "../types"
import { DocumentParseError } from "../../domains/shared"

export const parseDocxDocument: DocumentParser = async (input) => {
  if (typeof input.content === "string") {
    return createParsedDocument({
      fileId: input.fileId,
      fileName: input.fileName,
      fileType: "docx",
      rawText: normalizeExtractedText(input.content),
      metadata: {
        ...input.metadata,
        parser: "docx_parser",
        mode: "extracted_text",
      },
    })
  }

  const buffer = normalizeBinaryContent(input.content)
  if (!isDocxZip(buffer)) {
    throw new DocumentParseError(`无法解析“${input.fileName}”：文件不是有效的 DOCX/ZIP 二进制内容。`, {
      fileName: input.fileName,
      parser: "docx_parser",
    })
  }

  try {
    const mammothInput = { buffer: buffer as unknown as Buffer }
    const rawTextResult = await extractRawText(mammothInput)
    const htmlResult = await convertToHtml(mammothInput)
    const paragraphs = extractParagraphsFromHtml(htmlResult.value)
    const tables = extractTablesFromHtml(htmlResult.value)
    const rawText = normalizeExtractedText(rawTextResult.value || htmlToText(htmlResult.value))

    if (!rawText) {
      throw new DocumentParseError(`无法解析“${input.fileName}”：DOCX 文档内容为空。`, {
        fileName: input.fileName,
        parser: "docx_parser",
      })
    }

    return createParsedDocument({
      fileId: input.fileId,
      fileName: input.fileName,
      fileType: "docx",
      rawText,
      paragraphs: paragraphs.length > 0 ? paragraphs : undefined,
      tables,
      metadata: {
        ...input.metadata,
        parser: "docx_parser",
        mode: "mammoth",
        warnings: [...rawTextResult.messages, ...htmlResult.messages].map((message) => message.message),
      },
    })
  } catch (error) {
    if (error instanceof DocumentParseError) throw error
    throw new DocumentParseError(`无法解析“${input.fileName}”：${error instanceof Error ? error.message : String(error)}`, {
      fileName: input.fileName,
      parser: "docx_parser",
    })
  }
}

function isDocxZip(buffer: Uint8Array) {
  return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b
}

function extractParagraphsFromHtml(html: string): DocumentParagraph[] {
  const blocks = [...html.matchAll(/<(h[1-6]|p)[^>]*>([\s\S]*?)<\/\1>/gi)]
  const paragraphs: DocumentParagraph[] = []
  let section: string | undefined

  for (const match of blocks) {
    const tag = match[1].toLowerCase()
    const text = decodeHtml(stripTags(match[2])).trim()
    if (!text) continue

    const headingLevel = tag.startsWith("h") ? Number(tag.slice(1)) : undefined
    if (headingLevel) section = text

    paragraphs.push({
      index: paragraphs.length + 1,
      text,
      headingLevel,
      section,
      location: section && !headingLevel ? `${section} 章节第 ${paragraphs.length + 1} 段` : `正文第 ${paragraphs.length + 1} 段`,
      sourcePath: section ? `${section}/段落 ${paragraphs.length + 1}` : `段落 ${paragraphs.length + 1}`,
    })
  }

  return paragraphs
}

function extractTablesFromHtml(html: string): DocumentTable[] {
  return [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)]
    .map((tableMatch, tableIndex) => {
      const rows = [...tableMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
        .map((rowMatch) =>
          [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
            .map((cellMatch) => decodeHtml(stripTags(cellMatch[1])).trim()),
        )
        .filter((row) => row.some(Boolean))

      return {
        index: tableIndex + 1,
        rows,
        location: `表格 ${tableIndex + 1}`,
        sourcePath: `表格 ${tableIndex + 1}`,
      }
    })
    .filter((table) => table.rows.length > 0)
}

function htmlToText(html: string) {
  return decodeHtml(
    html
      .replace(/<\/(p|h[1-6]|tr|table)>/gi, "\n")
      .replace(/<\/(td|th)>/gi, "\t")
      .replace(/<[^>]+>/g, ""),
  )
}

function normalizeExtractedText(text: string) {
  return decodeHtml(text).replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, "")
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}