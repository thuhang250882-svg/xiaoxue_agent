import path from "node:path"
import { readFile, readdir, stat } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { Global } from "@opencode-ai/core/global"
import { Effect, Schema } from "effect"
import { parseDocument } from "../../../../document_engine"
import type { ParsedDocument } from "../../../../document_engine"
import { Tool } from "./tool"

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const searchableExtensions = new Set([".md", ".txt", ".csv", ".docx", ".xlsx"])

const Category = Schema.Literals([
  "standard",
  "company_rule",
  "template",
  "excellent_report",
  "expert_experience",
  "tender_case",
  "contract_case",
])

const Parameters = Schema.Struct({
  query: Schema.String,
  categories: Schema.optional(Schema.Array(Category)),
  limit: Schema.optional(Schema.Number),
})

export type KnowledgeCategory = Schema.Schema.Type<typeof Category>

export type KnowledgeSearchHit = {
  sourceId: string
  title: string
  documentNumber: string
  version: number
  category: KnowledgeCategory
  filePath: string
  location: string
  section?: string
  page?: number
  excerpt: string
  archived: boolean
  updatedAt: string
  score: number
}

export type KnowledgeSearchResult = {
  type: "knowledge_search_result"
  query: string
  hits: KnowledgeSearchHit[]
  searchedFiles: number
  warnings: string[]
  unsupportedNotice?: string
}

export const KnowledgeSearchTool = Tool.define(
  "knowledge_search",
  Effect.succeed({
    description:
      "检索本地 knowledge 目录中的真实标准、制度、模板、优秀报告和专家经验，返回文件路径、段落位置和原文摘录；没有命中时明确返回空结果。",
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
      Effect.tryPromise({
        try: async () => {
          const taskId = `knowledge-${Date.now()}`
          await Effect.runPromise(
            ctx.metadata({
              title: "企业知识查询",
              metadata: state(ctx.sessionID, taskId, "searching", "正在检索本地标准、制度、模板和案例..."),
            }),
          )
          const loaded = await loadKnowledgeDocuments()
          const result = searchKnowledgeDocuments(params.query, loaded.documents, {
            categories: params.categories ? [...params.categories] : undefined,
            limit: params.limit,
            warnings: loaded.warnings,
          })
          await Effect.runPromise(
            ctx.metadata({
              title: "企业知识查询",
              metadata: state(
                ctx.sessionID,
                taskId,
                "success",
                result.hits.length ? `找到 ${result.hits.length} 条可定位来源。` : "未找到可靠的本地来源。",
              ),
            }),
          )
          return {
            title: "企业知识查询",
            output: JSON.stringify(result),
            metadata: { ...state(ctx.sessionID, taskId, "success", "知识查询完成。"), result },
          }
        },
        catch: toError,
      }).pipe(
        Effect.catch((error) => {
          const taskId = `knowledge-${Date.now()}`
          return ctx
            .metadata({ title: "企业知识查询失败", metadata: state(ctx.sessionID, taskId, "error", error.message) })
            .pipe(
              Effect.as({
                title: "企业知识查询失败",
                output: JSON.stringify({ type: "knowledge_search_error", error: error.message }),
                metadata: state(ctx.sessionID, taskId, "error", error.message),
              }),
            )
        }),
      ),
  }),
)

export function searchKnowledgeDocuments(
  query: string,
  documents: ParsedDocument[],
  options: { categories?: KnowledgeCategory[]; limit?: number; warnings?: string[] } = {},
): KnowledgeSearchResult {
  const terms = queryTerms(query)
  const hits = documents
    .flatMap((document) => {
      const category = categoryFromPath(String(document.metadata.sourcePath ?? ""))
      if (document.metadata.active === false) return []
      if (options.categories?.length && !options.categories.includes(category)) return []
      return document.paragraphs.flatMap((paragraph) => {
        const value = `${document.fileName}\n${paragraph.text}`.toLowerCase()
        const score = terms.reduce(
          (total, term) => total + occurrences(value, term) * (document.fileName.toLowerCase().includes(term) ? 3 : 1),
          0,
        )
        if (!score) return []
        return [
          {
            sourceId: String(document.metadata.sourceId ?? document.fileId),
            title: String(document.metadata.title ?? document.fileName),
            documentNumber: String(document.metadata.sourceId ?? document.fileId),
            version: Number(document.metadata.version ?? 1),
            category,
            filePath: String(document.metadata.sourcePath ?? document.fileName),
            location: paragraph.location ?? `正文第 ${paragraph.index} 段`,
            section: paragraph.section,
            page: pageFromLocation(paragraph.location),
            excerpt: paragraph.text.slice(0, 360),
            archived: false,
            updatedAt: String(document.metadata.updatedAt ?? document.metadata.importedAt ?? ""),
            score,
          } satisfies KnowledgeSearchHit,
        ]
      })
    })
    .toSorted((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(options.limit ?? 8, 20)))
  return {
    type: "knowledge_search_result",
    query,
    hits,
    searchedFiles: documents.length,
    warnings: options.warnings ?? [],
    unsupportedNotice: hits.length
      ? undefined
      : "当前企业知识库中未检索到能够直接支持该结论的依据，以下内容仅作为一般性分析，需人工复核。",
  }
}

export async function loadKnowledgeDocuments(rootsOverride?: string[]) {
  const candidates = rootsOverride ?? [
    path.join(Global.Path.data, "knowledge"),
    path.resolve(process.cwd(), "knowledge"),
    path.resolve(moduleDir, "../../../../knowledge"),
  ]
  const roots = [
    ...new Set(
      (
        await Promise.all(
          candidates.map(async (root) => ((await stat(root).catch(() => undefined))?.isDirectory() ? root : undefined)),
        )
      ).filter((root): root is string => Boolean(root)),
    ),
  ]
  const files = [...new Set((await Promise.all(roots.map(scanKnowledgeRoot))).flat())]
  const parsed = await Promise.allSettled(
    files.map(async (filePath) =>
      parseDocument({
        fileName: path.basename(filePath),
        data: new Uint8Array(await readFile(filePath)),
        metadata: { sourcePath: filePath, ...(await metadataForFile(filePath, roots)) },
      }),
    ),
  )
  return {
    documents: parsed.flatMap((item) => (item.status === "fulfilled" ? [item.value] : [])),
    warnings: parsed.flatMap((item, index) =>
      item.status === "rejected" ? [`${path.basename(files[index])}：${toError(item.reason).message}`] : [],
    ),
  }
}

async function metadataForFile(filePath: string, roots: string[]) {
  const root = roots.find((candidate) => {
    const relative = path.relative(path.resolve(candidate), path.resolve(filePath))
    return !relative.startsWith("..") && !path.isAbsolute(relative)
  })
  if (!root) return {}
  const value = await readJson(path.join(root, "index.json"))
  if (value === undefined) return {}
  if (!Array.isArray(value)) return {}
  const record = value.find(
    (item) => isManagedIndexRecord(item) && path.resolve(item.filePath) === path.resolve(filePath),
  )
  if (!record || !isManagedIndexRecord(record)) return {}
  return {
    sourceId: record.id,
    title: record.title,
    version: record.version ?? 1,
    active: record.active ?? true,
    importedAt: record.importedAt,
    updatedAt: record.updatedAt ?? record.importedAt,
  }
}

function pageFromLocation(location?: string) {
  const value = location?.match(/第\s*(\d+)\s*页/)
  return value ? Number(value[1]) : undefined
}
async function scanKnowledgeRoot(root: string) {
  const value = await readJson(path.join(root, "index.json"))
  if (value !== undefined) {
    if (!Array.isArray(value)) throw new Error("知识库索引格式无效。")
    const resolvedRoot = path.resolve(root)
    const candidates = value.flatMap((item) => {
      if (!isManagedIndexRecord(item) || item.active === false) return []
      const filePath = path.resolve(item.filePath)
      const relative = path.relative(resolvedRoot, filePath)
      if (relative.startsWith("..") || path.isAbsolute(relative)) return []
      return [filePath]
    })
    const existing = await Promise.all(
      candidates.map(async (filePath) => ((await exists(filePath)) ? filePath : undefined)),
    )
    return existing.filter((filePath): filePath is string => Boolean(filePath))
  }

  return scanKnowledgeFiles(root)
}

async function scanKnowledgeFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  return (
    await Promise.all(
      entries.flatMap((entry) => {
        if (entry.name === "_archive") return []
        const target = path.join(root, entry.name)
        if (entry.isDirectory()) return [scanKnowledgeFiles(target)]
        if (entry.isFile() && searchableExtensions.has(path.extname(entry.name).toLowerCase())) {
          return [Promise.resolve([target])]
        }
        return []
      }),
    )
  ).flat()
}

async function readJson(target: string): Promise<unknown | undefined> {
  return readFile(target, "utf8")
    .then((value) => JSON.parse(value) as unknown)
    .catch((error) => {
      if (isNodeError(error) && error.code === "ENOENT") return undefined
      throw error
    })
}

async function exists(target: string) {
  return stat(target)
    .then(() => true)
    .catch((error) => {
      if (isNodeError(error) && error.code === "ENOENT") return false
      throw error
    })
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}

function isManagedIndexRecord(value: unknown): value is {
  id?: string
  title?: string
  filePath: string
  version?: number
  active?: boolean
  importedAt?: string
  updatedAt?: string
} {
  return typeof value === "object" && value !== null && typeof (value as { filePath?: unknown }).filePath === "string"
}

function queryTerms(query: string) {
  const normalized = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
  const words = normalized.split(/\s+/).filter((term) => term.length > 1)
  const chinese = [...normalized.matchAll(/[\u4e00-\u9fff]{2,}/g)].flatMap((match) =>
    Array.from({ length: Math.max(0, match[0].length - 1) }, (_, index) => match[0].slice(index, index + 2)),
  )
  return [...new Set([...words, ...chinese])]
}

function occurrences(value: string, term: string) {
  return value.split(term).length - 1
}

function categoryFromPath(filePath: string): KnowledgeCategory {
  const value = filePath.replaceAll("\\", "/").toLowerCase()
  if (value.includes("company_rules")) return "company_rule"
  if (value.includes("report_templates") || value.includes("/templates/")) return "template"
  if (value.includes("excellent_reports")) return "excellent_report"
  if (value.includes("expert_experience")) return "expert_experience"
  if (value.includes("tender_cases")) return "tender_case"
  if (value.includes("contract_cases")) return "contract_case"
  return "standard"
}

function state(sessionId: string, taskId: string, value: "searching" | "success" | "error", message: string) {
  return {
    event: "agent_state_changed" as const,
    type: "xiaoxue.agent.state" as const,
    agent: "knowledge" as const,
    sessionId,
    taskId,
    state: value,
    message,
    timestamp: Date.now(),
  }
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error))
}
