import { createParsedDocument, normalizeBinaryContent, splitParagraphs } from "../types"
import type { DocumentParagraph, DocumentParser } from "../types"
import { DocumentParseError } from "../../domains/shared"

export const parsePdfDocument: DocumentParser = async (input) => {
  if (typeof input.content === "string") {
    const rawText = input.content.replace(/\r\n/g, "\n").trim()
    if (!rawText) throw pdfError("PDF_NO_EXTRACTABLE_TEXT", input.fileName, "PDF 文本内容为空。")
    return createParsedDocument({
      fileId: input.fileId,
      fileName: input.fileName,
      fileType: "pdf",
      rawText,
      metadata: { ...input.metadata, parser: "pdf_parser", extractionMode: "provided_text" },
    })
  }

  const bytes = normalizeBinaryContent(input.content)
  if (bytes.byteLength === 0) throw pdfError("EMPTY_PDF", input.fileName, "PDF 文件为空。")
  if (bytes.byteLength < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    throw pdfError("INVALID_PDF", input.fileName, "文件头不是有效的 %PDF-。")
  }

  if (/\/Encrypt\b/.test(new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.byteLength, 16_384))))) {
    throw pdfError("ENCRYPTED_PDF", input.fileName, "PDF 已加密，无法读取。")
  }

  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const loading = getDocument({ data: bytes, useWorkerFetch: false, useSystemFonts: true })

  try {
    const pdf = await loading.promise
    const pageCount = pdf.numPages
    const pages: string[] = []
    const paragraphs: DocumentParagraph[] = []
    let paragraphIndex = 1

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const pageText = content.items
        .flatMap((item) => typeof item === "object" && item !== null && "str" in item && typeof item.str === "string" ? [item.str] : [])
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
      if (!pageText) continue
      pages.push(pageText)
      for (const paragraph of splitParagraphs(pageText)) {
        paragraphs.push({
          ...paragraph,
          index: paragraphIndex++,
          location: `第 ${pageNumber} 页，第 ${paragraph.index} 段`,
          sourcePath: input.metadata?.sourcePath as string | undefined,
        })
      }
    }
    const rawText = pages.join("\n\n").trim()
    if (!rawText) {
      throw pdfError(
        "PDF_NO_EXTRACTABLE_TEXT",
        input.fileName,
        "当前 PDF 未检测到可提取文本，暂不支持扫描件 OCR，请上传 DOCX、XLSX 或可复制文字的 PDF。",
      )
    }

    return createParsedDocument({
      fileId: input.fileId,
      fileName: input.fileName,
      fileType: "pdf",
      rawText,
      paragraphs,
      metadata: {
        ...input.metadata,
        parser: "pdf_parser",
        extractionMode: "native_text",
        pageCount,
        sourcePath: input.metadata?.sourcePath,
      },
    })
  } catch (error) {
    if (error instanceof DocumentParseError) throw error
    const message = error instanceof Error ? error.message : String(error)
    if (/password|encrypted/i.test(message)) throw pdfError("ENCRYPTED_PDF", input.fileName, "PDF 已加密，无法读取。", error)
    throw pdfError("PDF_PARSE_FAILED", input.fileName, `PDF 解析失败：${message}`, error)
  } finally {
    await loading.destroy().catch(() => undefined)
  }
}

function pdfError(code: "INVALID_PDF" | "ENCRYPTED_PDF" | "EMPTY_PDF" | "PDF_PARSE_FAILED" | "PDF_NO_EXTRACTABLE_TEXT", fileName: string, message: string, cause?: unknown) {
  return new DocumentParseError(message, { fileName, parser: "pdf_parser", pdfCode: code, cause }, code)
}