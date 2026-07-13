import { mkdir, rename, unlink } from "node:fs/promises"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { Effect, Schema } from "effect"
import { parseDocument } from "../../../../document_engine"
import { Tool } from "./tool"
import { latestUserAttachments, readAttachment } from "./xiaoxue-attachments"

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
  action: Schema.Literals(["import", "update", "list", "remove"]),
  category: Schema.optional(Category),
  sourceId: Schema.optional(Schema.String),
})

export type KnowledgeRecord = {
  id: string
  title: string
  category: Schema.Schema.Type<typeof Category>
  fileName: string
  filePath: string
  importedAt: string
  size: number
  sha256: string
  fileType: string
  paragraphCount: number
  tableCount: number
  version: number
  active: boolean
  supersedes?: string
  updatedAt?: string
}

export type KnowledgeManageResult = {
  type: "knowledge_manage_result"
  action: "import" | "update" | "list" | "remove"
  records: KnowledgeRecord[]
  message: string
}

export const KnowledgeManageTool = Tool.define(
  "knowledge_manage",
  Effect.succeed({
    description:
      "管理本地私有知识资料。import 导入附件，update 按 sourceId 更新版本，list 查看清单，remove 按 sourceId 删除；所有操作仅限本机知识库目录。",
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) => {
      const taskId = `knowledge-manage-${Date.now()}`
      return Effect.tryPromise({
        try: async () => {
          const root = path.join(Global.Path.data, "knowledge")
          await Effect.runPromise(
            ctx.metadata({
              title: "知识资料管理",
              metadata: state(
                ctx.sessionID,
                taskId,
                params.action === "list" ? "searching" : "reading",
                "正在处理本地知识资料...",
              ),
            }),
          )
          const result =
            params.action === "import"
              ? await importKnowledgeAttachments(
                  root,
                  requireCategory(params.category),
                  latestUserAttachments(ctx.messages),
                )
              : params.action === "update"
                ? await updateKnowledgeAttachment(
                    root,
                    requireSourceId(params.sourceId),
                    latestUserAttachments(ctx.messages),
                  )
                : params.action === "remove"
                  ? await removeKnowledgeRecord(root, requireSourceId(params.sourceId))
                  : await listKnowledgeRecords(root, params.category ? [params.category] : undefined)
          await Effect.runPromise(
            ctx.metadata({ title: "知识资料管理", metadata: state(ctx.sessionID, taskId, "success", result.message) }),
          )
          return {
            title: "知识资料管理",
            output: JSON.stringify(result),
            metadata: { ...state(ctx.sessionID, taskId, "success", result.message), result },
          }
        },
        catch: toError,
      }).pipe(
        Effect.catch((error) =>
          ctx
            .metadata({ title: "知识资料管理失败", metadata: state(ctx.sessionID, taskId, "error", error.message) })
            .pipe(
              Effect.as({
                title: "知识资料管理失败",
                output: JSON.stringify({ type: "knowledge_manage_error", error: error.message }),
                metadata: state(ctx.sessionID, taskId, "error", error.message),
              }),
            ),
        ),
      )
    },
  }),
)

export async function importKnowledgeAttachments(
  root: string,
  category: KnowledgeRecord["category"],
  attachments: ReturnType<typeof latestUserAttachments>,
): Promise<KnowledgeManageResult> {
  if (!attachments.length) throw new Error("当前会话没有可导入的附件。")
  await mkdir(path.join(root, category), { recursive: true })
  const current = await readIndex(root)
  const imported: KnowledgeRecord[] = []
  for (const attachment of attachments) {
    const data = await readAttachment(attachment)
    const sha256 = new Bun.CryptoHasher("sha256").update(data).digest("hex")
    const existing = current.find((record) => record.sha256 === sha256 && record.active)
    const archived = current.find((record) => record.sha256 === sha256 && !record.active)
    if (archived) throw new Error(`资料“${attachment.filename}”与已归档版本内容相同，请使用版本更新恢复或替换资料。`)
    if (existing) {
      imported.push(existing)
      continue
    }
    const document = await parseDocument({
      fileName: attachment.filename,
      mimeType: attachment.mime,
      data,
      metadata: { source: "knowledge_import" },
    })
    if (!document.rawText.trim()) throw new Error(`资料“${attachment.filename}”解析后没有可检索文本。`)
    const id = `KN-${sha256.slice(0, 12).toUpperCase()}`
    const fileName = `${id}-${sanitizeFileName(attachment.filename)}`
    const filePath = path.join(root, category, fileName)
    await Bun.write(filePath, data)
    const record: KnowledgeRecord = {
      id,
      title: attachment.filename,
      category,
      fileName,
      filePath,
      importedAt: new Date().toISOString(),
      size: data.byteLength,
      sha256,
      fileType: document.fileType,
      paragraphCount: document.paragraphs.length,
      tableCount: document.tables.length,
      version: 1,
      active: true,
    }
    current.push(record)
    imported.push(record)
  }
  await writeIndex(root, current)
  return {
    type: "knowledge_manage_result",
    action: "import",
    records: imported,
    message: `已导入或复用 ${imported.length} 份知识资料。`,
  }
}

export async function updateKnowledgeAttachment(
  root: string,
  sourceId: string,
  attachments: ReturnType<typeof latestUserAttachments>,
): Promise<KnowledgeManageResult> {
  if (attachments.length !== 1) throw new Error("更新知识资料时必须且只能上传一份新文件。")
  const current = await readIndex(root)
  const previous = current.find((record) => record.id === sourceId && record.active)
  if (!previous) throw new Error("没有找到生效中的知识资料 " + sourceId + "。")
  const attachment = attachments[0]
  const data = await readAttachment(attachment)
  const sha256 = new Bun.CryptoHasher("sha256").update(data).digest("hex")
  if (sha256 === previous.sha256) {
    return {
      type: "knowledge_manage_result",
      action: "update",
      records: [previous],
      message: "新文件与当前版本内容一致，无需更新。",
    }
  }
  const document = await parseDocument({
    fileName: attachment.filename,
    mimeType: attachment.mime,
    data,
    metadata: { source: "knowledge_update" },
  })
  if (!document.rawText.trim()) throw new Error("更新资料解析后没有可检索文本。")
  const archivePath = path.join(root, "_archive", previous.category, previous.fileName)
  await mkdir(path.dirname(archivePath), { recursive: true })
  if (await Bun.file(previous.filePath).exists()) await rename(previous.filePath, archivePath)
  previous.active = false
  previous.filePath = archivePath
  previous.updatedAt = new Date().toISOString()

  const id = "KN-" + sha256.slice(0, 12).toUpperCase()
  const fileName = id + "-" + sanitizeFileName(attachment.filename)
  const filePath = path.join(root, previous.category, fileName)
  await mkdir(path.dirname(filePath), { recursive: true })
  await Bun.write(filePath, data)
  const record: KnowledgeRecord = {
    id,
    title: attachment.filename,
    category: previous.category,
    fileName,
    filePath,
    importedAt: new Date().toISOString(),
    size: data.byteLength,
    sha256,
    fileType: document.fileType,
    paragraphCount: document.paragraphs.length,
    tableCount: document.tables.length,
    version: previous.version + 1,
    active: true,
    supersedes: previous.id,
  }
  current.push(record)
  await writeIndex(root, current)
  return {
    type: "knowledge_manage_result",
    action: "update",
    records: [record],
    message: "已更新至第 " + record.version + " 版，旧版本已归档。",
  }
}
export async function listKnowledgeRecords(
  root: string,
  categories?: KnowledgeRecord["category"][],
): Promise<KnowledgeManageResult> {
  const records = (await readIndex(root))
    .filter((record) => record.active)
    .filter((record) => !categories?.length || categories.includes(record.category))
    .toSorted((a, b) => b.importedAt.localeCompare(a.importedAt))
  return {
    type: "knowledge_manage_result",
    action: "list",
    records,
    message: `知识库共有 ${records.length} 份已索引资料。`,
  }
}

export async function removeKnowledgeRecord(root: string, sourceId: string): Promise<KnowledgeManageResult> {
  const current = await readIndex(root)
  const record = current.find((item) => item.id === sourceId)
  if (!record) throw new Error(`没有找到知识资料 ${sourceId}。`)
  const resolvedRoot = path.resolve(root)
  const resolvedFile = path.resolve(record.filePath)
  const relative = path.relative(resolvedRoot, resolvedFile)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("安全限制：知识资料路径超出管理目录。")
  }
  await unlink(resolvedFile).catch((error) => {
    if (isNodeError(error) && error.code === "ENOENT") return
    throw error
  })
  await writeIndex(root, current.filter((item) => item.id !== sourceId))
  return {
    type: "knowledge_manage_result",
    action: "remove",
    records: [record],
    message: `已删除知识资料 ${record.title}。`,
  }
}

async function readIndex(root: string): Promise<KnowledgeRecord[]> {
  const file = Bun.file(path.join(root, "index.json"))
  if (!(await file.exists())) return []
  const value: unknown = await file.json()
  if (!Array.isArray(value)) throw new Error("知识库索引格式无效。")
  return value
    .filter(isKnowledgeRecord)
    .map((record) => ({ ...record, version: record.version ?? 1, active: record.active ?? true }))
}

async function writeIndex(root: string, records: KnowledgeRecord[]) {
  await mkdir(root, { recursive: true })
  const target = path.join(root, "index.json")
  const temporary = `${target}.tmp`
  await Bun.write(temporary, JSON.stringify(records, null, 2))
  await rename(temporary, target)
}

function requireCategory(value?: KnowledgeRecord["category"]): KnowledgeRecord["category"] {
  if (!value) throw new Error("导入知识资料时必须指定 category。")
  return value
}

function requireSourceId(value?: string) {
  if (!value?.trim()) throw new Error("更新或删除知识资料时必须指定 sourceId。")
  return value.trim()
}

function sanitizeFileName(value: string) {
  return path.basename(value).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 180) || "knowledge-file"
}

function isKnowledgeRecord(value: unknown): value is KnowledgeRecord {
  if (typeof value !== "object" || value === null) return false
  const record = value as Partial<KnowledgeRecord>
  return typeof record.id === "string" && typeof record.filePath === "string" && typeof record.sha256 === "string"
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}

function state(
  sessionId: string,
  taskId: string,
  value: "reading" | "searching" | "success" | "error",
  message: string,
) {
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
