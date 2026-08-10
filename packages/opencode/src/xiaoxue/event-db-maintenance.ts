export * as XiaoxueEventDbMaintenance from "./event-db-maintenance"

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { randomBytes } from "node:crypto"
import path from "node:path"
import { XiaoxueSqlite } from "#xiaoxue-sqlite"
import type { AdapterDatabase } from "./sqlite"

// event 表是 append-only 事件溯源存储：message.part.updated 每次流式更新都写入
// part 的完整快照（core/src/event.ts insert(EventTable)），且全仓库没有任何清理/
// retention 逻辑。本模块提供受控的只读分析与批量压缩入口，供维护命令使用。
// 规则：绝不删除事件行（保留 type/seq/aggregate_id），只把「同一 part 的非最新
// 快照」替换为保留身份与时间的 tombstone；每个 part 的最新快照原样保留，因此重放
// 的最终状态不变，用户消息正文、Provider 错误、审核结果均不受影响。

export const PART_UPDATED_TYPE_PREFIX = "message.part.updated"

export type CleanupPlanOptions = {
  minSizeBytes?: number
  minAgeDays?: number
}

export type CleanupCandidate = {
  id: string
  aggregateID: string
  seq: number
  partID: string
  size: number
}

export type CleanupPlan = {
  eventCount: number
  eventBytes: number
  candidates: CleanupCandidate[]
  candidatesBytes: number
  estimatedBytesFreed: number
}

export type CleanupResult = {
  updated: number
  batches: number
}

type Row = Record<string, unknown>

const DEFAULT_MIN_SIZE_BYTES = 2048
const TOMBSTONE_OVERHEAD_ESTIMATE = 256
const MAX_RUNTIME_COMPACTION_EVENTS = 10_000

type BackupManifest = {
  source: string
  sourceSize: number
  sourceModifiedAt: number
  backup: string
  backupSize: number
  createdAt: number
}

function asRows(value: unknown): Row[] {
  return value as Row[]
}

function asRow(value: unknown): Row | undefined {
  return value as Row | undefined
}

function numberAt(row: Row, key: string): number {
  const value = row[key]
  return typeof value === "number" ? value : Number(value ?? 0)
}

export function tableSizes(db: AdapterDatabase) {
  const tables = asRows(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all(),
  )
  return tables.map((table) => {
    const name = String(table.name)
    const count = numberAt(asRow(db.prepare(`SELECT COUNT(*) AS c FROM "${name}"`).get()) ?? {}, "c")
    const cols = asRows(db.prepare(`PRAGMA table_info("${name}")`).all())
    const sum = cols.map((col) => `COALESCE(LENGTH(CAST("${String(col.name)}" AS BLOB)), 0)`).join(" + ")
    const bytes = numberAt(asRow(db.prepare(`SELECT SUM(${sum}) AS b FROM "${name}"`).get()) ?? {}, "b")
    return { name, count, bytes }
  })
}

export function analyze(db: AdapterDatabase) {
  const totals = asRow(db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM event").get())
  const types = asRows(
    db
      .prepare(
        "SELECT type, COUNT(*) AS count, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM event GROUP BY type ORDER BY bytes DESC",
      )
      .all(),
  )
  const dataUrl = asRow(
    db
      .prepare(
        "SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM event WHERE data LIKE '%data:%base64,%'",
      )
      .get(),
  )
  return {
    eventCount: numberAt(totals ?? {}, "count"),
    eventBytes: numberAt(totals ?? {}, "bytes"),
    types: types.map((row) => ({
      type: String(row.type),
      count: numberAt(row, "count"),
      bytes: numberAt(row, "bytes"),
    })),
    dataUrlEvents: numberAt(dataUrl ?? {}, "count"),
    dataUrlBytes: numberAt(dataUrl ?? {}, "bytes"),
  }
}

// 候选 = message.part.updated.* 事件中「同一 part 存在更晚快照」的旧快照。
// 更晚的完整快照会在重放中覆盖旧快照，因此旧快照内容可以安全替换为 tombstone。
// 使用窗口函数单次扫描，避免对 20 万+ 行事件表做相关子查询。
export function planCleanup(db: AdapterDatabase, options?: CleanupPlanOptions): CleanupPlan {
  const minSize = options?.minSizeBytes ?? DEFAULT_MIN_SIZE_BYTES
  // 只压缩「写入时间早于截止时间」的旧快照；未设置 minAgeDays 时不限制
  const cutoff = options?.minAgeDays ? Date.now() - options.minAgeDays * 86400000 : Number.MAX_SAFE_INTEGER
  const totals = asRow(db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM event").get())
  const candidates = asRows(
    db
      .prepare(
        `SELECT id, aggregate_id, seq, part_id, size FROM (
           SELECT e.id AS id, e.aggregate_id AS aggregate_id, e.seq AS seq,
                  json_extract(e.data, '$.part.id') AS part_id,
                  LENGTH(e.data) AS size,
                  json_extract(e.data, '$.time') AS ts,
                  MAX(e.seq) OVER (PARTITION BY e.aggregate_id, json_extract(e.data, '$.part.id')) AS max_seq
           FROM event e
           WHERE e.type LIKE '${PART_UPDATED_TYPE_PREFIX}.%'
         )
         WHERE part_id IS NOT NULL AND seq < max_seq AND size >= ? AND ts <= ?
         ORDER BY size DESC`,
      )
      .all(minSize, cutoff),
  ).map((row) => ({
    id: String(row.id),
    aggregateID: String(row.aggregate_id),
    seq: numberAt(row, "seq"),
    partID: String(row.part_id),
    size: numberAt(row, "size"),
  }))
  const candidatesBytes = candidates.reduce((total, candidate) => total + candidate.size, 0)
  return {
    eventCount: numberAt(totals ?? {}, "count"),
    eventBytes: numberAt(totals ?? {}, "bytes"),
    candidates,
    candidatesBytes,
    estimatedBytesFreed: candidates.reduce(
      (total, candidate) => total + Math.max(0, candidate.size - TOMBSTONE_OVERHEAD_ESTIMATE),
      0,
    ),
  }
}

// 单个 Session 作用域的中间快照压缩：轮次结束、Session 进入稳定状态后调用。
// 只压缩该 Session 内 text/reasoning part 「被更晚快照覆盖」的旧快照，每个 part
// 保留最新完整快照；用户消息（同一 part 只有一个快照，不会命中 seq < max_seq）、
// tool 调用与结果、Provider 错误、审核结果均不在压缩范围内。不在每个 Token 到达
// 时执行，避免流式热路径上的额外写入。
export function planAggregateCleanup(
  db: AdapterDatabase,
  aggregateID: string,
  options?: CleanupPlanOptions,
): CleanupPlan {
  const minSize = options?.minSizeBytes ?? DEFAULT_MIN_SIZE_BYTES
  const totals = asRow(db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM event").get())
  const candidates = asRows(
    db
      .prepare(
        `SELECT id, aggregate_id, seq, part_id, size FROM (
           SELECT e.id AS id, e.aggregate_id AS aggregate_id, e.seq AS seq,
                  json_extract(e.data, '$.part.id') AS part_id,
                  LENGTH(e.data) AS size,
                  MAX(e.seq) OVER (PARTITION BY e.aggregate_id, json_extract(e.data, '$.part.id')) AS max_seq
           FROM event e
           WHERE e.type LIKE '${PART_UPDATED_TYPE_PREFIX}.%'
             AND e.aggregate_id = ?
             AND json_extract(e.data, '$.part.type') IN ('text', 'reasoning')
         )
         WHERE part_id IS NOT NULL AND seq < max_seq AND size >= ?
         ORDER BY size DESC`,
      )
      .all(aggregateID, minSize),
  ).map((row) => ({
    id: String(row.id),
    aggregateID: String(row.aggregate_id),
    seq: numberAt(row, "seq"),
    partID: String(row.part_id),
    size: numberAt(row, "size"),
  }))
  const candidatesBytes = candidates.reduce((total, candidate) => total + candidate.size, 0)
  return {
    eventCount: numberAt(totals ?? {}, "count"),
    eventBytes: numberAt(totals ?? {}, "bytes"),
    candidates,
    candidatesBytes,
    estimatedBytesFreed: candidates.reduce(
      (total, candidate) => total + Math.max(0, candidate.size - TOMBSTONE_OVERHEAD_ESTIMATE),
      0,
    ),
  }
}

// 运行时轮次结束压缩入口：独立打开事件库连接（WAL 模式允许与应用主连接并存，
// busy_timeout 避免与流式写入互斥失败），执行作用域清理后关闭。:memory: 库
// （测试环境）直接跳过。
export function compactSessionEvents(sessionID: string, dbPath: string): CleanupResult {
  if (!dbPath || dbPath === ":memory:") return { updated: 0, batches: 0 }
  const db = XiaoxueSqlite.open(dbPath)
  try {
    db.exec("PRAGMA busy_timeout = 5000")
    const count = numberAt(
      asRow(db.prepare("SELECT COUNT(*) AS c FROM event WHERE aggregate_id = ?").get(sessionID)) ?? {},
      "c",
    )
    if (count > MAX_RUNTIME_COMPACTION_EVENTS) return { updated: 0, batches: 0 }
    const plan = planAggregateCleanup(db, sessionID)
    if (plan.candidates.length === 0) return { updated: 0, batches: 0 }
    return executeCleanup(db, plan)
  } finally {
    db.close()
  }
}

// 使用 SQLite VACUUM INTO 生成包含 WAL 已提交内容的一致快照；每次维护都创建
// 新备份并写入源文件指纹，禁止用陈旧或损坏的副本绕过清理门禁。
export function backupDatabase(dbPath: string): { path: string; created: boolean } {
  const directory = path.dirname(dbPath)
  const base = path.basename(dbPath)
  const target = path.join(
    directory,
    `${base}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}`,
  )
  const db = XiaoxueSqlite.open(dbPath)
  try {
    db.exec("PRAGMA busy_timeout = 5000")
    db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`)
  } finally {
    db.close()
  }
  const source = statSync(dbPath)
  const backup = statSync(target)
  const manifest: BackupManifest = {
    source: path.resolve(dbPath),
    sourceSize: source.size,
    sourceModifiedAt: source.mtimeMs,
    backup: path.resolve(target),
    backupSize: backup.size,
    createdAt: Date.now(),
  }
  writeFileSync(`${target}.json`, JSON.stringify(manifest, null, 2), "utf8")
  validateBackup(target, manifest)
  return { path: target, created: true }
}

export function hasBackup(dbPath: string): boolean {
  const directory = path.dirname(dbPath)
  const base = path.basename(dbPath)
  return readdirSync(directory).some((name: string) => {
    if (!name.startsWith(`${base}.bak-`) || !name.endsWith(".json")) return false
    try {
      const manifest = JSON.parse(readFileSync(path.join(directory, name), "utf8")) as BackupManifest
      validateBackup(manifest.backup, manifest, dbPath)
      return true
    } catch {
      return false
    }
  })
}

export function requireBackup(dbPath: string) {
  if (!hasBackup(dbPath)) throw new Error(`拒绝执行清理：未找到 ${path.basename(dbPath)}.bak* 备份，请先执行 backup`)
}

export function purgeArchivedAttachmentPayloads(db: AdapterDatabase) {
  const exists = asRow(
    db
      .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'attachment_payload_archive'")
      .get(),
  )
  if (!exists) return { deleted: 0, bytes: 0 }
  const totals = asRow(
    db
      .prepare("SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM attachment_payload_archive")
      .get(),
  )
  db.exec("DELETE FROM attachment_payload_archive")
  return { deleted: numberAt(totals ?? {}, "count"), bytes: numberAt(totals ?? {}, "bytes") }
}

function validateBackup(backupPath: string, manifest: BackupManifest, sourcePath?: string) {
  if (!existsSync(backupPath)) throw new Error(`备份文件不存在：${backupPath}`)
  const backup = statSync(backupPath)
  if (backup.size !== manifest.backupSize) throw new Error(`备份大小校验失败：${backupPath}`)
  if (path.resolve(backupPath) !== path.resolve(manifest.backup)) throw new Error(`备份路径校验失败：${backupPath}`)
  if (sourcePath) {
    const source = statSync(sourcePath)
    if (path.resolve(sourcePath) !== path.resolve(manifest.source)) throw new Error("备份源路径不匹配")
    if (source.size !== manifest.sourceSize || source.mtimeMs !== manifest.sourceModifiedAt)
      throw new Error("数据库在备份后已变化，请重新执行 backup")
  }
  const backupDb = XiaoxueSqlite.open(backupPath)
  try {
    const result = asRow(backupDb.prepare("PRAGMA quick_check").get())
    if (String(result?.quick_check ?? "") !== "ok") throw new Error(`备份完整性检查失败：${backupPath}`)
  } finally {
    backupDb.close()
  }
}

// tombstone 保留事件类型、seq、Session、part 身份与时间元数据，剥离正文/工具输出/
// 附件载荷等重型字段，并记录原始字节数便于审计。
function buildTombstone(original: string, size: number): string {
  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(original) as Record<string, unknown>
  } catch {
    parsed = {}
  }
  const part = (parsed.part ?? {}) as Record<string, unknown>
  const time = (part.time ?? {}) as Record<string, unknown>
  return JSON.stringify({
    sessionID: parsed.sessionID,
    time: parsed.time,
    compacted: true,
    originalBytes: size,
    part: {
      id: part.id,
      sessionID: part.sessionID,
      messageID: part.messageID,
      type: part.type,
      time: { created: time.created },
    },
  })
}

export function executeCleanup(db: AdapterDatabase, plan: CleanupPlan, batchSize = 2000): CleanupResult {
  const update = db.prepare("UPDATE event SET data = ? WHERE id = ?")
  let updated = 0
  let batches = 0
  for (let start = 0; start < plan.candidates.length; start += batchSize) {
    const batch = plan.candidates.slice(start, start + batchSize)
    db.exec("BEGIN")
    let batchUpdated = 0
    try {
      for (const candidate of batch) {
        const original = asRow(db.prepare("SELECT data FROM event WHERE id = ?").get(candidate.id))?.data
        if (typeof original !== "string") continue
        update.run(buildTombstone(original, candidate.size), candidate.id)
        batchUpdated += 1
      }
      db.exec("COMMIT")
    } catch (error) {
      db.exec("ROLLBACK")
      throw error
    }
    updated += batchUpdated
    batches += 1
  }
  return { updated, batches }
}

export function checkpoint(db: AdapterDatabase) {
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
}
