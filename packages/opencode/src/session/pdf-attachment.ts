import { execFile } from "node:child_process"
import { existsSync, statSync } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const PDF_ATTACHMENT_FILE_LIMIT = 100 * 1024 * 1024
const PDF_ATTACHMENT_OUTPUT_LIMIT = 32_000
const PDF_RESULT_PREFIX = "XIAOXUE_PDF_RESULT:"

export function isPdfAttachmentMime(mime: string) {
  return mime.toLowerCase() === "application/pdf"
}

export async function extractPdfDataAttachment(input: { filename?: string; url: string }) {
  const comma = input.url.indexOf(",")
  if (comma === -1) throw new Error("PDF attachment data URL is invalid")
  const header = input.url.slice(0, comma)
  const payload = input.url.slice(comma + 1)
  const data = header.includes(";base64") ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload))
  if (data.byteLength > PDF_ATTACHMENT_FILE_LIMIT) throw new Error("PDF attachment exceeds the 100 MB limit")

  const directory = await mkdtemp(path.join(tmpdir(), "xiaoxue-pdf-"))
  const filepath = path.join(directory, "attachment.pdf")
  await writeFile(filepath, data)
  return extractPdfFileAttachment({ filename: input.filename, filepath }).finally(() =>
    rm(directory, { recursive: true, force: true }),
  )
}

export async function extractPdfFileAttachment(input: { filename?: string; filepath: string }) {
  if (!existsSync(input.filepath)) throw new Error("The original PDF was moved or deleted")
  const stat = statSync(input.filepath)
  if (!stat.isFile()) throw new Error("The PDF attachment path is not a regular file")
  if (stat.size > PDF_ATTACHMENT_FILE_LIMIT) throw new Error("PDF attachment exceeds the 100 MB limit")

  const result = await execFileAsync(
    process.env.XIAOXUE_PYTHON?.trim() || "python",
    [pdfExtractor(), input.filepath, PDF_ATTACHMENT_OUTPUT_LIMIT.toString()],
    {
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
    maxBuffer: 512 * 1024,
    timeout: 180_000,
    windowsHide: true,
    },
  )
  const line = result.stdout
    .split(/\r?\n/)
    .findLast((item) => item.startsWith(PDF_RESULT_PREFIX))
  if (!line) throw new Error("The local PDF extractor returned an invalid response")
  const parsed = JSON.parse(line.slice(PDF_RESULT_PREFIX.length)) as {
    pages: number
    text: string
    ocrPages: number[]
    ocrError?: string
    truncated: boolean
  }
  const text = parsed.text.trim()
  if (!text) {
    const reason = parsed.ocrError ? ` Offline OCR failed: ${parsed.ocrError}` : ""
    throw new Error(`PDF contains no extractable text.${reason}`)
  }
  const mode = parsed.ocrPages.length ? `native text + offline OCR on pages ${parsed.ocrPages.join(", ")}` : "native text"
  const suffix = parsed.truncated
    ? `\n\n[Content was condensed across all pages to the ${PDF_ATTACHMENT_OUTPUT_LIMIT}-character model-input limit. Split the PDF into sections when unabridged wording is required.]`
    : ""
  return `[Extracted PDF document: ${input.filename ?? path.basename(input.filepath)}; ${parsed.pages} pages; ${mode}]\n${text}${suffix}`
}

function pdfExtractor() {
  const configured = process.env.XIAOXUE_PDF_EXTRACTOR?.trim()
  if (configured && path.isAbsolute(configured) && existsSync(configured)) return configured
  const bundled = process.env.XIAOXUE_PYTHON_HOME?.trim()
  if (bundled) {
    const filepath = path.join(bundled, "pdf_extract.py")
    if (existsSync(filepath)) return filepath
  }
  const repository = path.resolve(import.meta.dir, "../../../desktop/python/pdf_extract.py")
  if (existsSync(repository)) return repository
  throw new Error("The local PDF extractor is unavailable; repair or reinstall Xiaoxue")
}
