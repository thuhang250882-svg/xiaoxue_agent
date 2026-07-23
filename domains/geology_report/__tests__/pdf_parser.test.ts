import { expect, test } from "bun:test"
import { parseDocument } from "../../../document_engine"
import { DocumentParseError } from "../../shared"

function createPdf(text: string) {
  const stream = text ? `BT /F1 12 Tf 72 720 Td (${text.replace(/[()\\]/g, "\\$&")}) Tj ET` : "BT ET"
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]
  let output = "%PDF-1.4\n"
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(output.length)
    output += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = output.length
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  output += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new TextEncoder().encode(output)
}

test("native text PDF extracts page text and location", async () => {
  const parsed = await parseDocument({ fileName: "XX1-report.pdf", content: createPdf("XX1 Well Report 3500m") })

  expect(parsed.fileType).toBe("pdf")
  expect(parsed.rawText).toContain("XX1 Well Report")
  expect(parsed.metadata.pageCount).toBe(1)
  expect(parsed.paragraphs[0]?.location).toBe("第 1 页，第 1 段")
})

test("PDF parser rejects invalid headers with a stable error code", async () => {
  try {
    await parseDocument({ fileName: "broken.pdf", content: new Uint8Array([1, 2, 3]) })
    throw new Error("expected parser rejection")
  } catch (error) {
    expect(error).toBeInstanceOf(DocumentParseError)
    expect((error as DocumentParseError).code).toBe("INVALID_PDF")
  }
})

test("PDF without extractable text reports OCR boundary", async () => {
  try {
    await parseDocument({ fileName: "scan.pdf", content: createPdf("") })
    throw new Error("expected parser rejection")
  } catch (error) {
    expect(error).toBeInstanceOf(DocumentParseError)
    expect((error as DocumentParseError).code).toBe("PDF_NO_EXTRACTABLE_TEXT")
    expect((error as Error).message).toContain("OCR")
  }
})
test("encrypted PDF reports a stable error code", async () => {
  const bytes = new TextEncoder().encode("%PDF-1.4\n1 0 obj << /Encrypt 2 0 R >> endobj\n%%EOF")
  try {
    await parseDocument({ fileName: "encrypted.pdf", content: bytes })
    throw new Error("expected parser rejection")
  } catch (error) {
    expect(error).toBeInstanceOf(DocumentParseError)
    expect((error as DocumentParseError).code).toBe("ENCRYPTED_PDF")
  }
})

test("corrupted PDF body reports parse failure", async () => {
  const bytes = new TextEncoder().encode("%PDF-1.4\nthis is not a valid PDF body")
  try {
    await parseDocument({ fileName: "corrupted.pdf", content: bytes })
    throw new Error("expected parser rejection")
  } catch (error) {
    expect(error).toBeInstanceOf(DocumentParseError)
    expect((error as DocumentParseError).code).toBe("PDF_PARSE_FAILED")
  }
})