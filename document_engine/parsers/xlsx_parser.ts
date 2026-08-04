import { createParsedDocument, detectDocumentType, parseDelimitedTable } from "../types"
import type { DocumentParser } from "../types"
import { DocumentParseError } from "../../domains/shared"

export const parseXlsxDocument: DocumentParser = async (input) => {
  const fileType = detectDocumentType(input.fileName, input.mimeType, input.extension) === "xls" ? "xls" : "xlsx"
  if (typeof input.content === "string") {
    const rawText = input.content.replace(/\r\n/g, "\n").trim()
    return createParsedDocument({
      fileId: input.fileId,
      fileName: input.fileName,
      fileType,
      rawText,
      tables: parseDelimitedTable(rawText),
      metadata: {
        ...input.metadata,
        parser: "xlsx_parser",
        mode: "extracted_text",
      },
    })
  }

  try {
    const { read, utils } = await import("xlsx")
    const workbook = read(input.content, { type: "array", cellDates: true, dense: true })
    const tables = workbook.SheetNames.map((sheetName, index) => {
      const sheet = workbook.Sheets[sheetName]
      const rows = utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: "",
        raw: false,
        dateNF: "yyyy-mm-dd",
        blankrows: true,
      })
      return {
        index: index + 1,
        sheetName,
        rows: rows.map((row) => row.map(formatCell)),
        location: `工作表“${sheetName}”`,
        sourcePath: `工作表/${sheetName}`,
      }
    })
    const rawText = tables
      .map((table) => [`[工作表：${table.sheetName}]`, ...table.rows.map((row) => row.join("\t"))].join("\n"))
      .join("\n\n")
      .trim()

    if (!rawText) {
      throw new DocumentParseError(`无法解析“${input.fileName}”：XLSX 工作簿没有可读取内容。`, {
        fileName: input.fileName,
        parser: "xlsx_parser",
      })
    }

    return createParsedDocument({
      fileId: input.fileId,
      fileName: input.fileName,
      fileType,
      rawText,
      tables,
      metadata: {
        ...input.metadata,
        parser: "xlsx_parser",
        mode: fileType,
        sheetNames: workbook.SheetNames,
      },
    })
  } catch (error) {
    if (error instanceof DocumentParseError) throw error
    throw new DocumentParseError(`无法解析“${input.fileName}”：${error instanceof Error ? error.message : String(error)}`, {
      fileName: input.fileName,
      parser: "xlsx_parser",
    })
  }
}

function formatCell(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value ?? "")
}
