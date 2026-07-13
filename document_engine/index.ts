export type {
  DocumentContent,
  DocumentInput,
  DocumentParagraph,
  DocumentParseInput,
  DocumentParser,
  DocumentTable,
  ParsedDocument,
  SupportedDocumentType,
} from "./types"
export {
  createParsedDocument,
  detectDocumentType,
  normalizeBinaryContent,
  normalizeTextContent,
  parseDelimitedTable,
  splitParagraphs,
} from "./types"
export type { ReviewIssue, ReviewResult, ReviewSeverity, ReviewSummary } from "./review_result"
export { createReviewResult, summarizeIssues } from "./review_result"
export { parseDocxDocument } from "./parsers/docx_parser"
export { parsePdfDocument } from "./parsers/pdf_parser"
export { parseTextDocument } from "./parsers/text_parser"
export { parseXlsxDocument } from "./parsers/xlsx_parser"
export {
  exportBusinessReviewToDocx,
  exportOfficeMaterialToDocx,
  exportReviewResultToDocx,
  packReviewResultToDocxBlob,
  exportReviewResultToHtml,
} from "./exporters"
export type { BusinessReviewDocument } from "./exporters"
export type {
  DocxExportOptions,
  DocxExportResult,
  ExportedOfficeMaterialFile,
  ExportedReviewFile,
  OfficeMaterialDocument,
  OfficeMaterialExportOptions,
  ReviewExportOptions,
  ReviewHtmlExportOptions,
  ReviewHtmlExportResult,
} from "./exporters"
export {
  COMPANY_REPORTING_FORMAT,
  companyBodyParagraph,
  companyBulletParagraph,
  companyHeading,
  companyLabelParagraph,
  companyNumberedParagraph,
  companyRightAlignedParagraph,
  companyTableParagraph,
  companyTitle,
  createCompanyReportingDocument,
} from "./templates"
export type { CompanyReportingDocumentInput } from "./templates"
export { extractWellBasicInfo, formatWellInfo } from "./extractors"
export type { WellBasicInfo } from "./extractors"

import { detectDocumentType } from "./types"
import type { DocumentInput, DocumentParseInput } from "./types"
import { parseDocxDocument } from "./parsers/docx_parser"
import { parsePdfDocument } from "./parsers/pdf_parser"
import { parseTextDocument } from "./parsers/text_parser"
import { parseXlsxDocument } from "./parsers/xlsx_parser"

export async function parseDocument(input: DocumentParseInput | DocumentInput) {
  const normalizedInput = "content" in input ? input : { ...input, content: input.data }
  const fileType = detectDocumentType(normalizedInput.fileName, normalizedInput.mimeType, normalizedInput.extension)
  if (fileType === "docx") return parseDocxDocument(normalizedInput)
  if (fileType === "xlsx") return parseXlsxDocument(normalizedInput)
  if (fileType === "pdf") return parsePdfDocument(normalizedInput)
  return parseTextDocument(normalizedInput)
}
