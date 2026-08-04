export type SupportedDocumentType = "doc" | "docx" | "xls" | "xlsx" | "pdf" | "txt" | "csv" | "unknown"

export type DocumentContent = string | ArrayBuffer | Uint8Array

export type DocumentParagraph = {
  index: number
  text: string
  location?: string
  headingLevel?: number
  section?: string
  sourcePath?: string
}

export type DocumentTable = {
  index: number
  rows: string[][]
  location?: string
  caption?: string
  sheetName?: string
  page?: number
  sourcePath?: string
}

export type ParsedDocument = {
  fileId: string
  fileName: string
  fileType: SupportedDocumentType
  rawText: string
  paragraphs: DocumentParagraph[]
  tables: DocumentTable[]
  metadata: Record<string, unknown>
}

export type DocumentInput = {
  fileId?: string
  fileName: string
  mimeType?: string
  extension?: string
  data: DocumentContent
  metadata?: Record<string, unknown>
}

export type DocumentParseInput = {
  fileId?: string
  fileName: string
  content: DocumentContent
  mimeType?: string
  extension?: string
  metadata?: Record<string, unknown>
}

export type DocumentParser = (input: DocumentParseInput) => Promise<ParsedDocument>

export function detectDocumentType(fileName: string, mimeType?: string, extension?: string): SupportedDocumentType {
  const lowerName = fileName.toLowerCase()
  const lowerExtension = extension?.toLowerCase().replace(/^\./, "")
  if (mimeType === "application/msword" || lowerExtension === "doc" || lowerName.endsWith(".doc")) return "doc"
  if (mimeType?.includes("wordprocessingml") || lowerExtension === "docx" || lowerName.endsWith(".docx")) return "docx"
  if (mimeType === "application/vnd.ms-excel" || lowerExtension === "xls" || lowerName.endsWith(".xls")) return "xls"
  if (mimeType?.includes("spreadsheetml") || lowerExtension === "xlsx" || lowerName.endsWith(".xlsx")) return "xlsx"
  if (mimeType?.includes("pdf") || lowerExtension === "pdf" || lowerName.endsWith(".pdf")) return "pdf"
  if (mimeType?.includes("csv") || lowerExtension === "csv" || lowerName.endsWith(".csv")) return "csv"
  if (mimeType?.includes("text") || lowerExtension === "txt" || lowerName.endsWith(".txt") || lowerName.endsWith(".md")) return "txt"
  return "unknown"
}

export function normalizeTextContent(content: DocumentContent) {
  const raw =
    typeof content === "string"
      ? content
      : new TextDecoder("utf-8", { fatal: false }).decode(content instanceof Uint8Array ? content : new Uint8Array(content))
  return raw.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim()
}

export function normalizeBinaryContent(content: DocumentContent) {
  if (typeof content === "string") return new TextEncoder().encode(content)
  return content instanceof Uint8Array ? content : new Uint8Array(content)
}

export function splitParagraphs(rawText: string): DocumentParagraph[] {
  return rawText
    .split(/\n{2,}|(?<=。)\s*(?=[\u4e00-\u9fa5A-Za-z0-9])|(?<=；)\s*(?=[\u4e00-\u9fa5A-Za-z0-9])/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, index) => ({ index: index + 1, text, location: `正文第 ${index + 1} 段` }))
}

export function parseDelimitedTable(rawText: string): DocumentTable[] {
  const rows = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.includes(",") || line.includes("\t") || line.includes("|"))
    .map((line) =>
      line
        .split(line.includes("\t") ? "\t" : line.includes("|") ? "|" : ",")
        .map((cell) => cell.trim())
        .filter(Boolean),
    )
    .filter((row) => row.length > 1)

  if (rows.length === 0) return []
  return [{ index: 1, rows, location: "表格 1", sourcePath: "表格 1" }]
}

export function createParsedDocument(input: {
  fileId?: string
  fileName: string
  fileType: SupportedDocumentType
  rawText: string
  paragraphs?: DocumentParagraph[]
  tables?: DocumentTable[]
  metadata?: Record<string, unknown>
}): ParsedDocument {
  return {
    fileId: input.fileId ?? `${input.fileName}-${Date.now()}`,
    fileName: input.fileName,
    fileType: input.fileType,
    rawText: input.rawText,
    paragraphs: input.paragraphs ?? splitParagraphs(input.rawText),
    tables: input.tables ?? [],
    metadata: input.metadata ?? {},
  }
}
