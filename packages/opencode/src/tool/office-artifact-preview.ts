import path from "node:path"
import { readFile, stat } from "node:fs/promises"
import { createHash } from "node:crypto"
import { Effect, Schema } from "effect"
import JSZip from "jszip"
import { parseDocument } from "../../../../document_engine"
import { Tool } from "./tool"

const Parameters = Schema.Struct({
  path: Schema.String,
})

export type OfficeArtifactPreviewResult = {
  type: "office_artifact_result"
  filePath: string
  fileName: string
  fileType: "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "pdf" | "mdb" | "md"
  size: number
  modifiedAt: number
  sha256?: string
  metadata: Record<string, unknown>
  paragraphs: Array<{ location: string; text: string; headingLevel?: number }>
  tables: Array<{ location: string; rows: string[][] }>
  annotations: Array<{ id: string; author: string; anchor: string; comment: string; date?: string }>
  truncated: boolean
}

export const OfficeArtifactPreviewTool = Tool.define(
  "office_artifact_preview",
  Effect.succeed({
    description:
      "登记已经生成的 DOC、DOCX、XLS、XLSX、PPT、PPTX、PDF、MDB 或 MD 文件，并尽可能生成结构化内容快照。旧版 PPT 和 MDB 仅登记文件信息；MDB 数据审核请使用地质录井专用技能。文件修改后重新调用，必须传绝对路径。",
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        if (!path.isAbsolute(params.path)) return yield* Effect.fail(new Error("产物预览必须使用绝对路径。"))
        const fileType = extension(params.path)
        if (!fileType) return yield* Effect.fail(new Error("产物预览不支持此文件格式。"))
        yield* ctx.ask({
          permission: "read",
          patterns: [params.path],
          always: [params.path],
          metadata: { purpose: "读取刚生成的 Office 产物并在本地生成结构化预览" },
        })
        const result = yield* Effect.tryPromise({
          try: () => previewOfficeArtifact(params.path, fileType),
          catch: (error) => (error instanceof Error ? error : new Error(String(error))),
        })
        return {
          title: `预览 ${result.fileName}`,
          output: JSON.stringify(result),
          metadata: { type: result.type, filePath: result.filePath, fileType: result.fileType },
        }
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed({
            title: "Office 产物预览失败",
            output: JSON.stringify({
              type: "office_artifact_error",
              error: error instanceof Error ? error.message : String(error),
            }),
            metadata: { type: "office_artifact_error" },
          }),
        ),
      ),
  }),
)

export async function previewOfficeArtifact(filePath: string, knownType = extension(filePath)) {
  if (!path.isAbsolute(filePath)) throw new Error("产物预览必须使用绝对路径。")
  if (!knownType) throw new Error("产物预览不支持此文件格式。")
  const info = await stat(filePath).catch(() => undefined)
  if (!info?.isFile()) throw new Error(`产物不存在：${filePath}`)
  const metadataOnly = knownType === "ppt" || knownType === "mdb"
  if (!metadataOnly && info.size > 50 * 1024 * 1024) throw new Error("文件超过内嵌预览上限。")
  const data = metadataOnly ? undefined : new Uint8Array(await readFile(filePath))
  const parsed = !data ? undefined : await parseDocument({
    fileName: path.basename(filePath),
    extension: knownType,
    data,
    metadata: { source: "generated_office_artifact" },
  })
  const paragraphs = (parsed?.paragraphs ?? []).slice(0, 240).map((paragraph) => ({
    location: paragraph.location ?? paragraph.section ?? `段落 ${paragraph.index}`,
    text: paragraph.text.slice(0, 2000),
    headingLevel: paragraph.headingLevel,
  }))
  const tables = (parsed?.tables ?? []).slice(0, 40).map((table) => ({
    location: table.location ?? table.sheetName ?? `表格 ${table.index}`,
    rows: table.rows.slice(0, 80).map((row) => row.slice(0, 30).map((cell) => cell.slice(0, 1000))),
  }))
  const annotations = knownType === "docx" && data ? await extractDocxAnnotations(data) : []
  return {
    type: "office_artifact_result",
    filePath,
    fileName: path.basename(filePath),
    fileType: knownType,
    size: info.size,
    modifiedAt: info.mtimeMs,
    sha256: data ? createHash("sha256").update(data).digest("hex") : undefined,
    metadata: parsed?.metadata ?? { preview: "metadata_only", reason: "legacy_binary_format" },
    paragraphs,
    tables,
    annotations: annotations.slice(0, 500),
    truncated:
      paragraphs.length < (parsed?.paragraphs.length ?? 0) ||
      tables.length < (parsed?.tables.length ?? 0) ||
      annotations.length > 500,
  } satisfies OfficeArtifactPreviewResult
}

async function extractDocxAnnotations(data: Uint8Array) {
  const zip = await JSZip.loadAsync(data)
  const comments = zip.file("word/comments.xml")
  if (!comments) return []
  const document = await zip.file("word/document.xml")?.async("string")
  const anchors = new Map<string, string>()
  if (document) {
    for (const match of document.matchAll(
      /<w:commentRangeStart\b[^>]*w:id="([^"]+)"[^>]*\/>[\s\S]*?<w:commentRangeEnd\b[^>]*w:id="\1"[^>]*\/>/g,
    )) {
      anchors.set(match[1], wordText(match[0]))
    }
  }
  const xml = await comments.async("string")
  return [...xml.matchAll(/<w:comment\b([^>]*)>([\s\S]*?)<\/w:comment>/g)].map((match) => {
    const attributes = match[1]
    const id = xmlAttribute(attributes, "id") ?? ""
    return {
      id,
      author: xmlAttribute(attributes, "author") ?? "",
      anchor: anchors.get(id) ?? "",
      comment: wordText(match[2]),
      date: xmlAttribute(attributes, "date"),
    }
  })
}

function xmlAttribute(attributes: string, name: string) {
  return attributes.match(new RegExp(`(?:\\w+:)?${name}="([^"]*)"`))?.[1]
}

function wordText(xml: string) {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g)]
    .map((match) => (match[1] === undefined ? "\n" : decodeXml(match[1])))
    .join("")
    .trim()
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
}

function extension(filePath: string): OfficeArtifactPreviewResult["fileType"] | undefined {
  const value = path.extname(filePath).toLowerCase().slice(1)
  if (value === "doc" || value === "docx" || value === "xls" || value === "xlsx" || value === "ppt" || value === "pptx" || value === "pdf" || value === "mdb" || value === "md") return value
}
