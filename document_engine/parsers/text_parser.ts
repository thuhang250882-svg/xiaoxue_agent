import { createParsedDocument, detectDocumentType, normalizeTextContent, parseDelimitedTable } from "../types"
import type { DocumentParser } from "../types"

export const parseTextDocument: DocumentParser = async (input) => {
  const rawText = normalizeTextContent(input.content)
  const fileType = detectDocumentType(input.fileName, input.mimeType)
  return createParsedDocument({
    fileId: input.fileId,
    fileName: input.fileName,
    fileType: fileType === "unknown" ? "txt" : fileType,
    rawText,
    tables: parseDelimitedTable(rawText),
    metadata: { ...input.metadata, parser: "text_parser" },
  })
}
