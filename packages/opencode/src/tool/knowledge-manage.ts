import { createHash, randomUUID } from "node:crypto"
import { mkdir, open, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { Effect, Schema, Semaphore } from "effect"
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
  // 对话式导入：用户在消息文本里以本地路径形式给出的资料文件。出于信任
  // 边界考虑，仅允许导入"当前用户消息文本中出现过的路径"，且优先级低于
  // 真实附件（两者并存时只导入附件）。
  paths: Schema.optional(Schema.Array(Schema.String)),
  // 扫描件支持：对无文字层 PDF（纯扫描件），先用 pdfkit extract_text
  // --ocr_fallback 提取文本，再把文本文件路径传入本参数一并导入。
  // 仅在资料确实没有文字层时生效；原始 PDF 仍会归档保存。
  ocr_text_path: Schema.optional(Schema.String),
})

export type KnowledgeRecord = {
  id: string
  title: string
  category: Schema.Schema.Type<typeof Category>
  fileName: string
  filePath: string
  // 扫描件的 OCR 文本副本路径；检索时优先解析该文件（原始 PDF 无文字层）。
  textPath?: string
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
      "管理本地私有知识资料。用户明确要求导入、更新、查看清单或确认删除时必须调用本工具，不能只读取或预览附件。import 导入当前用户消息附件（消息里只有文件路径时，把路径原样传入 paths 参数），update 按 sourceId 更新版本，list 查看清单，remove 按 sourceId 删除；所有操作仅限本机知识库目录。纯扫描件 PDF（无文字层）：先用 pdfkit extract_text --ocr_fallback 提取文本存为 .txt，再 import 时同时传 paths（原 PDF）与 ocr_text_path（OCR 文本）完成入库。",
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
                  userMentionedPaths(ctx.messages, params.paths),
                  params.ocr_text_path,
                )
              : params.action === "update"
                ? await updateKnowledgeAttachment(
                    root,
                    requireSourceId(params.sourceId),
                    latestUserAttachments(ctx.messages),
                    userMentionedPaths(ctx.messages, params.paths),
                    params.ocr_text_path,
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

// 对话式路径导入的信任锚：智能体传来的 paths 必须逐字出现在当前用户消息
// 文本中（用户显式提到该文件），防止智能体凭空捏造路径导入任意本地文件。
export function userMentionedPaths(
  messages: Parameters<typeof latestUserAttachments>[0],
  requested?: readonly string[],
): string[] {
  if (!requested?.length) return []
  const latest = [...(messages ?? [])].reverse().find((item) => item.info.role === "user")
  if (!latest) return []
  const text = latest.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n")
  if (!text.trim()) return []
  return requested.filter((value) => {
    const normalized = value.trim()
    return normalized && text.includes(normalized)
  })
}

// OCR 文本副本大小上限：防止把超大文本塞进知识索引。
const OCR_TEXT_MAX_BYTES = 10 * 1024 * 1024

async function readOcrTextFile(ocrTextPath: string): Promise<string> {
  const resolved = path.resolve(ocrTextPath)
  if (path.extname(resolved).toLowerCase() !== ".txt") throw new Error("ocr_text_path 只接受 .txt 文本文件。")
  const info = await stat(resolved).catch(() => undefined)
  if (!info?.isFile()) throw new Error(`OCR 文本文件不存在：${ocrTextPath}`)
  if (info.size > OCR_TEXT_MAX_BYTES) throw new Error("OCR 文本超过 10MB 上限。")
  const text = await readFile(resolved, "utf8")
  if (!text.trim()) throw new Error("OCR 文本文件为空。")
  return text
}

// 无文字层 PDF（纯扫描件）在 pdf_parser 中以该错误码抛出
function isScannedPdfError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "PDF_NO_EXTRACTABLE_TEXT"
}

async function parseOcrText(ocrText: string): Promise<Awaited<ReturnType<typeof parseDocument>>> {
  const searchable = await parseDocument({
    fileName: "ocr.txt",
    mimeType: "text/plain",
    data: new Uint8Array(Buffer.from(ocrText, "utf8")),
    metadata: { source: "knowledge_import_ocr" },
  })
  if (!searchable.rawText.trim()) throw new Error("OCR 文本无法解析为可检索内容。")
  return searchable
}

// 解析资料 + 扫描件降级：PDF 无文字层（parseDocument 抛 PDF_NO_EXTRACTABLE_TEXT
// 或返回空文本）时改用 OCR 文本作为可检索内容。返回 [原始文档(可能为空), 可检索文档, 是否使用OCR]。
async function parseSourceWithOcrFallback(
  sourceName: string,
  sourceMime: string,
  data: Uint8Array,
  metadataSource: string,
  ocrText: string | undefined,
): Promise<{
  document: Awaited<ReturnType<typeof parseDocument>> | undefined
  searchable: Awaited<ReturnType<typeof parseDocument>>
  usedOcr: boolean
}> {
  let document: Awaited<ReturnType<typeof parseDocument>> | undefined
  try {
    document = await parseDocument({
      fileName: sourceName,
      mimeType: sourceMime,
      data,
      metadata: { source: metadataSource },
    })
  } catch (error) {
    if (!isScannedPdfError(error)) throw error
    if (!ocrText) {
      throw new Error(
        `资料“${sourceName}”是纯扫描件（无文字层）。请先用 pdfkit extract_text --ocr_fallback ` +
          "提取文本（打包内置 RapidOCR），再把文本文件路径通过 ocr_text_path 参数一并导入。",
      )
    }
  }
  if (document?.rawText.trim() && ocrText)
    throw new Error(`资料“${sourceName}”自带可读文字层，不需要 OCR 文本，请去掉 ocr_text_path 后重试。`)
  if (document?.rawText.trim()) return { document, searchable: document, usedOcr: false }
  if (ocrText) return { document, searchable: await parseOcrText(ocrText), usedOcr: true }
  if (document) {
    throw new Error(
      `资料“${sourceName}”解析后没有可检索文本（扫描件或图片型 PDF）。` +
        "请先用 pdfkit extract_text --ocr_fallback 提取文本（打包内置 RapidOCR），" +
        "再把文本文件路径通过 ocr_text_path 参数一并导入。",
    )
  }
  throw new Error(`资料“${sourceName}”解析失败。`)
}

const knowledgeLocks = new Map<string, Semaphore.Semaphore>()

async function withKnowledgeLock<T>(root: string, operation: () => Promise<T>) {
  await mkdir(root, { recursive: true })
  const physical = await realpath(root)
  const key = process.platform === "win32" ? physical.toLowerCase() : physical
  const lock = knowledgeLocks.get(key) ?? Semaphore.makeUnsafe(1)
  knowledgeLocks.set(key, lock)
  // Serialize the complete read-modify-write cycle, not only index publication.
  return Effect.runPromise(lock.withPermits(1)(Effect.tryPromise({ try: operation, catch: toError })))
}

export function importKnowledgeAttachments(...args: Parameters<typeof importAttachments>) {
  return withKnowledgeLock(args[0], () => importAttachments(...args))
}

async function importAttachments(
  root: string,
  category: KnowledgeRecord["category"],
  attachments: ReturnType<typeof latestUserAttachments>,
  paths: string[] = [],
  ocrTextPath?: string,
): Promise<KnowledgeManageResult> {
  if (!attachments.length && !paths.length) throw new Error("当前会话没有可导入的附件。")
  if (ocrTextPath && (attachments.length || paths.length) !== 1)
    throw new Error("ocr_text_path 仅支持单份资料的扫描件导入，请一份一份处理。")
  const ocrText = ocrTextPath ? await readOcrTextFile(ocrTextPath) : undefined
  await mkdir(path.join(root, category), { recursive: true })
  const current = await readIndex(root)
  const imported: KnowledgeRecord[] = []
  const writes: KnowledgeWrite[] = []
  // 附件与"用户消息中提到的本地路径"统一处理；真实附件优先（路径可能重复指向同一文件）。
  const sources: Array<{ name: string; mime: string; load: () => Promise<Uint8Array> }> = [
    ...attachments.map((attachment) => ({
      name: attachment.filename,
      mime: attachment.mime,
      load: () => readAttachment(attachment),
    })),
    ...(attachments.length ? [] : paths).map((filePath) => ({
      name: path.basename(filePath),
      mime: guessMime(filePath),
      load: async () => new Uint8Array(await readFile(filePath)),
    })),
  ]
  for (const source of sources) {
    const data = await source.load().catch((error) => {
      throw new Error(`无法读取资料“${source.name}”：${error instanceof Error ? error.message : String(error)}`)
    })
    const sha256 = createHash("sha256").update(data).digest("hex")
    const existing = current.find((record) => record.sha256 === sha256 && record.active)
    const archived = current.find((record) => record.sha256 === sha256 && !record.active)
    if (existing) {
      imported.push(existing)
      continue
    }
    if (archived) throw new Error(`资料“${source.name}”与已归档版本内容相同，请使用版本更新恢复或替换资料。`)
    // 解析 + 扫描件降级：文字层为空时改用 OCR 文本作为可检索内容
    const { document, searchable, usedOcr } = await parseSourceWithOcrFallback(
      source.name,
      source.mime,
      data,
      "knowledge_import",
      ocrText,
    )
    const id = `KN-${sha256.slice(0, 12).toUpperCase()}`
    const fileName = `${id}-${sanitizeFileName(source.name)}`
    const filePath = path.join(root, category, fileName)
    writes.push({ target: filePath, data })
    // OCR 文本副本与原始 PDF 同目录存放，检索时优先解析
    let textPath: string | undefined
    if (usedOcr && ocrText) {
      textPath = `${filePath}.txt`
      writes.push({ target: textPath, data: ocrText })
    }
    const record: KnowledgeRecord = {
      id,
      title: source.name,
      category,
      fileName,
      filePath,
      ...(textPath ? { textPath } : {}),
      importedAt: new Date().toISOString(),
      size: data.byteLength,
      sha256,
      fileType: document?.fileType ?? "pdf",
      paragraphCount: searchable.paragraphs.length,
      tableCount: searchable.tables.length,
      version: 1,
      active: true,
    }
    current.push(record)
    imported.push(record)
  }
  await commitKnowledgeChange(root, current, writes)
  return {
    type: "knowledge_manage_result",
    action: "import",
    records: imported,
    message: `已导入或复用 ${imported.length} 份知识资料。`,
  }
}

export function updateKnowledgeAttachment(...args: Parameters<typeof updateAttachment>) {
  return withKnowledgeLock(args[0], () => updateAttachment(...args))
}

async function updateAttachment(
  root: string,
  sourceId: string,
  attachments: ReturnType<typeof latestUserAttachments>,
  paths: string[] = [],
  ocrTextPath?: string,
): Promise<KnowledgeManageResult> {
  if ((attachments.length || paths.length) !== 1)
    throw new Error("更新知识资料时必须且只能上传一份新文件（附件或消息中给出的文件路径）。")
  const ocrText = ocrTextPath ? await readOcrTextFile(ocrTextPath) : undefined
  const current = await readIndex(root)
  const previous = current.find((record) => record.id === sourceId && record.active)
  if (!previous) throw new Error("没有找到生效中的知识资料 " + sourceId + "。")
  const attachment = attachments[0]
    ? { name: attachments[0].filename, mime: attachments[0].mime, load: () => readAttachment(attachments[0]) }
    : {
        name: path.basename(paths[0]),
        mime: guessMime(paths[0]),
        load: async () => new Uint8Array(await readFile(paths[0])),
      }
  const data = await attachment.load().catch((error) => {
    throw new Error(`无法读取资料“${attachment.name}”：${error instanceof Error ? error.message : String(error)}`)
  })
  const sha256 = createHash("sha256").update(data).digest("hex")
  if (sha256 === previous.sha256) {
    return {
      type: "knowledge_manage_result",
      action: "update",
      records: [previous],
      message: "新文件与当前版本内容一致，无需更新。",
    }
  }
  if (current.some((record) => record.active && record.sha256 === sha256)) {
    throw new Error("新文件内容已存在于另一份生效资料中，请复用已有资料；当前版本未修改。")
  }
  const { document, searchable, usedOcr } = await parseSourceWithOcrFallback(
    attachment.name,
    attachment.mime,
    data,
    "knowledge_update",
    ocrText,
  )
  const archivePath = path.join(root, "_archive", previous.category, previous.fileName)
  const moves: KnowledgeMove[] = [{ source: previous.filePath, target: archivePath }]
  // 旧版本的 OCR 文本副本一并归档
  let archivedTextPath: string | undefined
  if (previous.textPath) {
    archivedTextPath = `${archivePath}.txt`
    moves.push({ source: previous.textPath, target: archivedTextPath })
  }
  previous.active = false
  previous.filePath = archivePath
  if (archivedTextPath) previous.textPath = archivedTextPath
  previous.updatedAt = new Date().toISOString()

  // A rollback is a new version, even when its bytes match an archived version.
  const baseId = "KN-" + sha256.slice(0, 12).toUpperCase()
  const id = current.some((record) => record.id === baseId) ? `${baseId}-${randomUUID()}` : baseId
  const fileName = id + "-" + sanitizeFileName(attachment.name)
  const filePath = path.join(root, previous.category, fileName)
  const writes: KnowledgeWrite[] = [{ target: filePath, data }]
  let textPath: string | undefined
  if (usedOcr && ocrText) {
    textPath = `${filePath}.txt`
    writes.push({ target: textPath, data: ocrText })
  }
  const record: KnowledgeRecord = {
    id,
    title: attachment.name,
    category: previous.category,
    fileName,
    filePath,
    ...(textPath ? { textPath } : {}),
    importedAt: new Date().toISOString(),
    size: data.byteLength,
    sha256,
    fileType: document?.fileType ?? "pdf",
    paragraphCount: searchable.paragraphs.length,
    tableCount: searchable.tables.length,
    version: previous.version + 1,
    active: true,
    supersedes: previous.id,
  }
  current.push(record)
  await commitKnowledgeChange(root, current, writes, moves)
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

export function removeKnowledgeRecord(root: string, sourceId: string) {
  return withKnowledgeLock(root, () => removeRecord(root, sourceId))
}

async function removeRecord(root: string, sourceId: string): Promise<KnowledgeManageResult> {
  const current = await readIndex(root)
  const record = current.find((item) => item.id === sourceId)
  if (!record) throw new Error(`没有找到知识资料 ${sourceId}。`)
  // Keep deleted bytes outside fallback search until index publication succeeds.
  const moves = [record.filePath, ...(record.textPath ? [record.textPath] : [])].map((source) => ({
    source,
    target: path.join(root, "_archive", ".removed", `${randomUUID()}.pending`),
  }))
  await commitKnowledgeChange(
    root,
    current.filter((item) => item.id !== sourceId),
    [],
    moves,
  )
  const cleanup = await Promise.allSettled(
    moves.map((move) =>
      unlink(move.target).catch((error) => {
        if (isNodeError(error) && error.code === "ENOENT") return
        throw error
      }),
    ),
  )
  const retained = cleanup.flatMap((result, index) => (result.status === "rejected" ? [moves[index].target] : []))
  return {
    type: "knowledge_manage_result",
    action: "remove",
    records: [record],
    message: `已删除知识资料 ${record.title}。${retained.length ? `暂存副本清理失败，需要人工清理：${retained.join("、")}` : ""}`,
  }
}

type KnowledgeWrite = { target: string; data: Uint8Array | string }
type KnowledgeMove = { source: string; target: string }

async function commitKnowledgeChange(
  root: string,
  records: KnowledgeRecord[],
  writes: KnowledgeWrite[],
  moves: KnowledgeMove[] = [],
) {
  const undo: Array<() => Promise<unknown>> = []
  // Validate every path before changing any file; reserve existing destinations rather than overwrite them.
  for (const target of [
    ...writes.map((write) => write.target),
    ...moves.flatMap((move) => [move.source, move.target]),
  ]) {
    await requireManagedPath(root, target)
  }
  try {
    for (const write of writes) {
      await mkdir(path.dirname(write.target), { recursive: true })
      const file = await open(write.target, "wx")
      undo.push(() => unlink(write.target))
      try {
        await file.writeFile(write.data)
        await file.sync()
      } finally {
        await file.close()
      }
    }
    for (const move of moves) {
      if (!(await exists(move.source))) continue
      if (await exists(move.target)) throw new Error(`归档目标已存在，未覆盖已有文件：${move.target}`)
      await mkdir(path.dirname(move.target), { recursive: true })
      await rename(move.source, move.target)
      undo.push(() => rename(move.target, move.source))
    }
    await writeIndex(root, records)
  } catch (error) {
    const failures: unknown[] = []
    for (const restore of undo.toReversed()) {
      await restore().catch((failure) => {
        failures.push(failure)
      })
    }
    if (failures.length)
      throw new AggregateError([error, ...failures], "知识库写入失败且文件恢复未完成，请保留管理目录并人工检查。")
    throw error
  }
}

async function requireManagedPath(root: string, target: string) {
  const resolvedRoot = await realpath(root)
  const resolved = path.resolve(target)
  const relative = path.relative(path.resolve(root), resolved)
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("安全限制：知识资料路径超出管理目录。")
  }
  // Resolve the nearest existing ancestor as well, so junctions cannot bypass containment.
  const physical = await existingAncestor(resolved)
  const physicalRelative = path.relative(resolvedRoot, physical)
  if (physicalRelative === ".." || physicalRelative.startsWith(`..${path.sep}`) || path.isAbsolute(physicalRelative)) {
    throw new Error("安全限制：知识资料路径超出管理目录。")
  }
  return resolved
}

async function existingAncestor(target: string): Promise<string> {
  return realpath(target).catch((error) => {
    if (isNodeError(error) && error.code === "ENOENT") return existingAncestor(path.dirname(target))
    throw error
  })
}

async function readIndex(root: string): Promise<KnowledgeRecord[]> {
  const target = path.join(root, "index.json")
  if (!(await exists(target))) return []
  const value: unknown = JSON.parse(await readFile(target, "utf8"))
  if (!Array.isArray(value)) throw new Error("知识库索引格式无效。")
  return value
    .filter(isKnowledgeRecord)
    .map((record) => ({ ...record, version: record.version ?? 1, active: record.active ?? true }))
}

async function writeIndex(root: string, records: KnowledgeRecord[]) {
  await mkdir(root, { recursive: true })
  const target = path.join(root, "index.json")
  const temporary = `${target}.tmp`
  await writeFile(temporary, JSON.stringify(records, null, 2))
  const file = await open(temporary, "r+")
  try {
    await file.sync()
  } finally {
    await file.close()
  }
  await rename(temporary, target)
}

async function exists(target: string) {
  return stat(target)
    .then(() => true)
    .catch((error) => {
      if (isNodeError(error) && error.code === "ENOENT") return false
      throw error
    })
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
  return (
    path
      .basename(value)
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .slice(0, 180) || "knowledge-file"
  )
}

// 路径导入时按扩展名推断 MIME；document_engine 主要依赖 fileName，此处仅需合理默认值。
function guessMime(filePath: string) {
  const extension = path.extname(filePath).toLowerCase()
  switch (extension) {
    case ".pdf":
      return "application/pdf"
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    case ".txt":
      return "text/plain"
    case ".md":
      return "text/markdown"
    case ".csv":
      return "text/csv"
    default:
      return "application/octet-stream"
  }
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
