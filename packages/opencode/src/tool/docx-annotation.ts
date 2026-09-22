import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

export type DocxAnnotation = {
  id: string
  matchText: string
  comment: string
}

export type AnnotatedDocx = {
  fileName: string
  filePath: string
  format: "docx"
  size: number
  annotations: { added: number; unmatched: number }
}

export function docxAnnotationAvailable() {
  const python = process.env.XIAOXUE_PYTHON
  return Boolean(python && path.isAbsolute(python) && existsSync(python) && existsSync(annotatorScript()))
}

export async function exportAnnotatedDocx(input: {
  data: Uint8Array
  fileName: string
  outputPath: string
  annotations: DocxAnnotation[]
  signal?: AbortSignal
}): Promise<AnnotatedDocx> {
  if (!input.fileName.toLowerCase().endsWith(".docx")) throw new Error("原文批注仅支持 DOCX 文件。")
  const python = process.env.XIAOXUE_PYTHON
  if (!python || !docxAnnotationAvailable())
    throw new Error("DOCX_ANNOTATION_RUNTIME_MISSING: 未配置内置 Python 或批注脚本。")

  await mkdir(input.outputPath, { recursive: true })
  const work = await mkdtemp(path.join(tmpdir(), "xiaoxue-docx-annotation-"))
  const source = path.join(work, "source.docx")
  const decisions = path.join(work, "annotations.json")
  const fileName = `${path.basename(input.fileName, path.extname(input.fileName))}_批注版_${Date.now()}.docx`
  const output = path.join(input.outputPath, fileName)
  const occurrences = new Map<string, number>()

  try {
    await writeFile(source, input.data)
    await writeFile(
      decisions,
      JSON.stringify(
        input.annotations.map((item) => {
          const occurrence = (occurrences.get(item.matchText) ?? 0) + 1
          occurrences.set(item.matchText, occurrence)
          return {
            match_text: item.matchText,
            occurrence,
            comment: `[${item.id}] ${item.comment}`,
            author: "AI审核",
            initials: "AI",
          }
        }),
        undefined,
        2,
      ),
      "utf8",
    )
    const result = await runAnnotator(python, annotatorScript(), source, decisions, output, input.signal)
    const saved = await stat(output)
    return {
      fileName,
      filePath: output,
      format: "docx",
      size: saved.size,
      annotations: { added: result.added.length, unmatched: result.unmatched.length },
    }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

function annotatorScript() {
  const skills =
    process.env.XIAOXUE_BUNDLED_SKILLS_DIR ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../.opencode/skills")
  return path.join(skills, "document-review-tracked", "scripts", "annotate_docx.py")
}

async function runAnnotator(
  python: string,
  script: string,
  source: string,
  decisions: string,
  output: string,
  signal?: AbortSignal,
) {
  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn(python, ["-s", "-B", script, source, decisions, "--out", output], {
      env: { ...process.env, PYTHONNOUSERSITE: "1", PYTHONUTF8: "1" },
      signal,
      timeout: 120000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let out = ""
    let error = ""
    child.stdout.on("data", (chunk: Buffer) => {
      out = (out + chunk.toString()).slice(-65536)
    })
    child.stderr.on("data", (chunk: Buffer) => {
      error = (error + chunk.toString()).slice(-8192)
    })
    child.once("error", reject)
    child.once("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`DOCX_ANNOTATION_FAILED (${code}): ${error}`)),
    )
  })
  const parsed: unknown = JSON.parse(stdout)
  if (!isAnnotationResult(parsed)) throw new Error("DOCX_ANNOTATION_INVALID_RESULT: 批注器返回格式无效。")
  return parsed
}

function isAnnotationResult(value: unknown): value is { added: unknown[]; unmatched: unknown[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const result = value as Record<string, unknown>
  return Array.isArray(result.added) && Array.isArray(result.unmatched)
}
