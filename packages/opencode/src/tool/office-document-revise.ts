import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Global } from "@opencode-ai/core/global"
import { Effect, Schema } from "effect"
import { previewOfficeArtifact } from "./office-artifact-preview"
import { latestUserAttachments, readAttachment } from "./xiaoxue-attachments"
import { Tool } from "./tool"

const Edit = Schema.Struct({
  id: Schema.String,
  matchText: Schema.String,
  replacement: Schema.String,
  comment: Schema.optional(Schema.String),
  occurrence: Schema.optional(Schema.Number),
})

const Parameters = Schema.Struct({
  fileName: Schema.optional(Schema.String),
  path: Schema.optional(Schema.String),
  edits: Schema.Array(Edit),
})

export type OfficeRevisionEdit = {
  id: string
  matchText: string
  replacement: string
  comment?: string
  occurrence?: number
}

type RevisionScriptResult = {
  annotated: { applied: unknown[]; unmatched: unknown[] }
  final: { applied: unknown[]; unmatched: unknown[] }
}

export const OfficeDocumentReviseTool = Tool.define(
  "office_document_revise",
  Effect.succeed({
    description:
      "基于当前附件或用户明确提供的绝对路径修改 DOCX、XLSX、PPTX 或 PDF，并同时生成同类型标注版和最终修改版。每条 edit 必须提供可精确定位的 matchText、最终 replacement 和审核说明；原文件不会被覆盖。",
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        if (!params.edits.length) return yield* Effect.fail(new Error("至少需要一条明确修改。"))
        const source = params.path
          ? yield* loadPathSource(params.path, ctx)
          : yield* Effect.tryPromise({
              try: () => loadAttachmentSource(ctx.messages, params.fileName),
              catch: toError,
            })
        const result = yield* Effect.tryPromise({
          try: () =>
            exportOfficeRevisionSet({
              data: source.data,
              fileName: source.fileName,
              outputPath: path.join(Global.Path.data, "exports", "office-revisions"),
              edits: params.edits,
              signal: ctx.abort,
            }),
          catch: toError,
        })
        const [annotated, final] = yield* Effect.promise(() =>
          Promise.all([previewRevisionArtifact(result.annotated), previewRevisionArtifact(result.final)]),
        )
        return {
          title: `已生成 ${source.fileName} 的标注版和最终修改版`,
          output: JSON.stringify({
            type: "office_revision_result",
            sourceFileName: source.fileName,
            format: result.format,
            changes: result.changes,
            annotated: { ...annotated, variant: "annotated" },
            final: { ...final, variant: "final" },
          }),
          metadata: {
            type: "office_revision_result",
            sourceFileName: source.fileName,
            annotatedPath: result.annotated.filePath,
            finalPath: result.final.filePath,
          },
        }
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed({
            title: "办公文档修改失败",
            output: JSON.stringify({ type: "office_revision_error", error: toError(error).message }),
            metadata: { type: "office_revision_error" },
          }),
        ),
      ),
  }),
)

export async function exportOfficeRevisionSet(input: {
  data: Uint8Array
  fileName: string
  outputPath: string
  edits: readonly OfficeRevisionEdit[]
  signal?: AbortSignal
}) {
  const format = extension(input.fileName)
  if (!format) throw new Error("自动修改仅支持 DOCX、XLSX、PPTX 和 PDF。")
  const python = process.env.XIAOXUE_PYTHON
  if (!python || !revisionAvailable())
    throw new Error("OFFICE_REVISION_RUNTIME_MISSING: 未配置内置 Python 或办公文档修改脚本。")

  await mkdir(input.outputPath, { recursive: true })
  const work = await mkdtemp(path.join(tmpdir(), "xiaoxue-office-revision-"))
  const source = path.join(work, `source.${format}`)
  const decisions = path.join(work, "decisions.json")
  const stamp = Date.now()
  const base = path.basename(input.fileName, path.extname(input.fileName))
  const annotatedPath = path.join(input.outputPath, `${base}_标注版_${stamp}.${format}`)
  const finalPath = path.join(input.outputPath, `${base}_最终修改版_${stamp}.${format}`)

  try {
    await writeFile(source, input.data)
    await writeFile(
      decisions,
      JSON.stringify(
        input.edits.map((item) => ({
          id: item.id,
          match_text: item.matchText,
          replacement: item.replacement,
          comment: item.comment ?? "",
          occurrence: item.occurrence ?? 1,
          author: "AI审核",
          initials: "AI",
        })),
        undefined,
        2,
      ),
      "utf8",
    )
    const changes = await runRevision(python, revisionScript(), source, decisions, annotatedPath, finalPath, input.signal)
    const unmatched = [...changes.annotated.unmatched, ...changes.final.unmatched]
    if (unmatched.length) {
      await Promise.all([rm(annotatedPath, { force: true }), rm(finalPath, { force: true })])
      throw new Error(
        `OFFICE_REVISION_UNMATCHED: ${JSON.stringify(unmatched).slice(0, 4000)}`,
      )
    }
    const [annotatedStat, finalStat] = await Promise.all([stat(annotatedPath), stat(finalPath)])
    return {
      format,
      annotated: {
        fileName: path.basename(annotatedPath),
        filePath: annotatedPath,
        format,
        size: annotatedStat.size,
      },
      final: {
        fileName: path.basename(finalPath),
        filePath: finalPath,
        format,
        size: finalStat.size,
      },
      changes: {
        annotated: { applied: changes.annotated.applied.length, unmatched: changes.annotated.unmatched.length },
        final: { applied: changes.final.applied.length, unmatched: changes.final.unmatched.length },
      },
    }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

function revisionAvailable() {
  const python = process.env.XIAOXUE_PYTHON
  return Boolean(python && path.isAbsolute(python) && existsSync(python) && existsSync(revisionScript()))
}

function revisionScript() {
  const skills =
    process.env.XIAOXUE_BUNDLED_SKILLS_DIR ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../.opencode/skills")
  return path.join(skills, "office-document-revision", "scripts", "revise_office.py")
}

function loadPathSource(sourcePath: string, ctx: Tool.Context) {
  if (!path.isAbsolute(sourcePath)) return Effect.fail(new Error("文件路径必须是绝对路径。"))
  if (!extension(sourcePath)) return Effect.fail(new Error("自动修改仅支持 DOCX、XLSX、PPTX 和 PDF。"))
  return Effect.gen(function* () {
    yield* ctx.ask({
      permission: "read",
      patterns: [sourcePath],
      always: [sourcePath],
      metadata: { purpose: "读取用户指定的办公文档并生成标注版和最终修改版" },
    })
    if (!existsSync(sourcePath)) return yield* Effect.fail(new Error(`文件不存在：${sourcePath}`))
    return { fileName: path.basename(sourcePath), data: new Uint8Array(yield* Effect.promise(() => readFile(sourcePath))) }
  })
}

async function loadAttachmentSource(messages: Tool.Context["messages"], requested?: string) {
  const attachments = latestUserAttachments(messages).filter((item) => Boolean(extension(item.filename)))
  if (!attachments.length) throw new Error("当前消息没有可修改的 DOCX、XLSX、PPTX 或 PDF 附件。")
  const selected = requested
    ? attachments.find((item) => item.filename.toLowerCase() === requested.toLowerCase())
    : attachments[0]
  if (!selected) throw new Error(`没有找到指定附件“${requested}”。`)
  return { fileName: selected.filename, data: await readAttachment(selected) }
}

async function runRevision(
  python: string,
  script: string,
  source: string,
  decisions: string,
  annotated: string,
  final: string,
  signal?: AbortSignal,
) {
  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn(
      python,
      ["-s", "-B", script, source, decisions, "--annotated", annotated, "--final", final],
      {
        env: { ...process.env, PYTHONNOUSERSITE: "1", PYTHONUTF8: "1" },
        signal,
        timeout: 120000,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    )
    let output = ""
    let error = ""
    child.stdout.on("data", (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-65536)
    })
    child.stderr.on("data", (chunk: Buffer) => {
      error = (error + chunk.toString()).slice(-8192)
    })
    child.once("error", reject)
    child.once("close", (code) =>
      code === 0 ? resolve(output) : reject(new Error(`OFFICE_REVISION_FAILED (${code}): ${error}`)),
    )
  })
  const parsed: unknown = JSON.parse(stdout)
  if (!isRevisionResult(parsed)) throw new Error("OFFICE_REVISION_INVALID_RESULT: 修改器返回格式无效。")
  return parsed
}

function isRevisionResult(value: unknown): value is RevisionScriptResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const result = value as Record<string, unknown>
  return isRevisionSide(result.annotated) && isRevisionSide(result.final)
}

function isRevisionSide(value: unknown): value is { applied: unknown[]; unmatched: unknown[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const side = value as Record<string, unknown>
  return Array.isArray(side.applied) && Array.isArray(side.unmatched)
}

function extension(fileName: string): "docx" | "xlsx" | "pptx" | "pdf" | undefined {
  const value = path.extname(fileName).toLowerCase().slice(1)
  if (value === "docx" || value === "xlsx" || value === "pptx" || value === "pdf") return value
}

async function previewRevisionArtifact(file: {
  fileName: string
  filePath: string
  format: "docx" | "xlsx" | "pptx" | "pdf"
  size: number
}) {
  try {
    return await previewOfficeArtifact(file.filePath, file.format)
  } catch (error) {
    return {
      type: "office_artifact_result" as const,
      filePath: file.filePath,
      fileName: file.fileName,
      fileType: file.format,
      size: file.size,
      modifiedAt: 0,
      sha256: "",
      metadata: { previewError: toError(error).message },
      paragraphs: [],
      tables: [],
      annotations: [],
      truncated: false,
    }
  }
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error))
}
