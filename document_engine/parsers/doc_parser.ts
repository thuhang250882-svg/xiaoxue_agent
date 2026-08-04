import WordExtractor from "word-extractor"
import { createParsedDocument, normalizeBinaryContent } from "../types"
import type { DocumentParagraph, DocumentParser, DocumentTable } from "../types"
import { DocumentParseError } from "../../domains/shared"

export const parseDocDocument: DocumentParser = async (input) => {
  if (typeof input.content === "string") {
    const rawText = normalizeLegacyText(input.content)
    return createParsedDocument({
      fileId: input.fileId,
      fileName: input.fileName,
      fileType: "doc",
      rawText,
      paragraphs: extractParagraphs(rawText),
      tables: extractTables(rawText),
      metadata: { ...input.metadata, parser: "doc_parser", mode: "extracted_text" },
    })
  }

  const bytes = normalizeBinaryContent(input.content)
  if (!isOleDocument(bytes)) {
    throw new DocumentParseError(`无法解析“${input.fileName}”：文件不是有效的 Word 97-2003 DOC 二进制内容。`, {
      fileName: input.fileName,
      parser: "doc_parser",
    })
  }

  try {
    const document = await new WordExtractor().extract(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))
    const body = normalizeLegacyText(document.getBody())
    if (!body) {
      throw new DocumentParseError(`无法解析“${input.fileName}”：DOC 文档正文为空。`, {
        fileName: input.fileName,
        parser: "doc_parser",
      })
    }

    const supplementary = [
      ["页眉", document.getHeaders({ includeFooters: false })],
      ["页脚", document.getFooters()],
      ["脚注", document.getFootnotes()],
      ["尾注", document.getEndnotes()],
      ["批注", document.getAnnotations()],
      ["文本框", document.getTextboxes({ includeHeadersAndFooters: false })],
    ]
      .map(([label, value]) => [label, uniqueLines(normalizeLegacyText(value))] as const)
      .filter(([, value]) => value)

    return createParsedDocument({
      fileId: input.fileId,
      fileName: input.fileName,
      fileType: "doc",
      rawText: [body, ...supplementary.map(([label, value]) => `[${label}]\n${value}`)].join("\n\n"),
      paragraphs: extractParagraphs(body),
      tables: extractTables(body),
      metadata: {
        ...input.metadata,
        parser: "doc_parser",
        mode: "word-extractor",
        supplementarySections: supplementary.map(([label]) => label),
        warnings: ["传统 DOC 可提取正文和表格分隔符，但原始分页、图片位置和精确版式需以源文件为准。"],
      },
    })
  } catch (error) {
    if (error instanceof DocumentParseError) throw error
    throw new DocumentParseError(
      `无法解析“${input.fileName}”：传统 DOC 结构不兼容或文件损坏（${error instanceof Error ? error.message : String(error)}）。`,
      { fileName: input.fileName, parser: "doc_parser" },
    )
  }
}

function isOleDocument(bytes: Uint8Array) {
  const signature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
  return bytes.length > signature.length && signature.every((byte, index) => bytes[index] === byte)
}

function normalizeLegacyText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[ \u3000]+(?=\n)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function uniqueLines(value: string) {
  return [...new Set(value.split("\n").map((line) => line.trim()).filter(Boolean))].join("\n")
}

function extractParagraphs(value: string): DocumentParagraph[] {
  return value
    .split(/\n+/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, index) => ({ index: index + 1, text, location: `DOC 正文第 ${index + 1} 段` }))
}

function extractTables(value: string): DocumentTable[] {
  const groups: string[][][] = []
  let rows: string[][] = []
  const flush = () => {
    if (rows.length > 0) groups.push(rows)
    rows = []
  }

  value.split("\n").forEach((line) => {
    if (!line.includes("\t")) {
      flush()
      return
    }
    const cells = line.split("\t").map((cell) => cell.trim())
    if (cells.filter(Boolean).length < 2) {
      flush()
      return
    }
    rows.push(cells)
  })
  flush()

  return groups.map((tableRows, index) => ({
    index: index + 1,
    rows: tableRows,
    location: `DOC 表格区域 ${index + 1}`,
    sourcePath: `DOC/表格区域 ${index + 1}`,
  }))
}
