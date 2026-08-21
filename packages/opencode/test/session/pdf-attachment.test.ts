import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { extractPdfFileAttachment, isPdfAttachmentMime } from "@/session/pdf-attachment"

const original = {
  python: process.env.XIAOXUE_PYTHON,
  extractor: process.env.XIAOXUE_PDF_EXTRACTOR,
}
let directory = ""

afterEach(async () => {
  if (original.python === undefined) delete process.env.XIAOXUE_PYTHON
  if (original.python !== undefined) process.env.XIAOXUE_PYTHON = original.python
  if (original.extractor === undefined) delete process.env.XIAOXUE_PDF_EXTRACTOR
  if (original.extractor !== undefined) process.env.XIAOXUE_PDF_EXTRACTOR = original.extractor
  if (directory) await rm(directory, { recursive: true, force: true })
  directory = ""
})

describe("PDF attachment extraction", () => {
  test("recognizes PDF MIME types case-insensitively", () => {
    expect(isPdfAttachmentMime("application/pdf")).toBeTrue()
    expect(isPdfAttachmentMime("APPLICATION/PDF")).toBeTrue()
    expect(isPdfAttachmentMime("image/pdf")).toBeFalse()
  })

  test("parses the bounded local extractor result and reports OCR and truncation", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "xiaoxue-pdf-test-"))
    const extractor = path.join(directory, "extract.py")
    const pdf = path.join(directory, "report.pdf")
    await writeFile(pdf, "%PDF-1.7\n")
    await writeFile(
      extractor,
      [
        "import json",
        "print('OCR diagnostic')",
        "print('XIAOXUE_PDF_RESULT:' + json.dumps({'pages': 12, 'text': '## Page 1\\n井深 3200 米', 'ocrPages': [1], 'ocrError': None, 'truncated': True}, ensure_ascii=False))",
      ].join("\n"),
    )
    process.env.XIAOXUE_PYTHON = "python"
    process.env.XIAOXUE_PDF_EXTRACTOR = extractor

    const result = await extractPdfFileAttachment({ filename: "录井报告.pdf", filepath: pdf })

    expect(result).toContain("录井报告.pdf; 12 pages; native text + offline OCR on pages 1")
    expect(result).toContain("井深 3200 米")
    expect(result).toContain("condensed across all pages to the 32000-character model-input limit")
  })
})
