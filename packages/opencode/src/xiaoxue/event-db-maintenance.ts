export * as XiaoxueEventDbMaintenance from "./event-db-maintenance"

import { copyFileSync, readdirSync } from "node:fs"
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
  const totals = asRow(
    db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM event").get(),
  )
  const types = asRows(
    db
      .prepare(
        "SELECT type, COUNT(*) AS count, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM event GROUP BY type ORDER BY bytes DESC",
      )
      .all(),
  )
  const dataUrl = asRow(
    db
      .prepare("SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM event WHERE data LIKE '%data:%base64,%'")
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
  const totals = asRow(
    db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM event").get(),
  )
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
  const totals = asRow(
    db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM event").get(),
  )
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
    const plan = planAggregateCleanup(db, sessionID)
    if (plan.candidates.length === 0) return { updated: 0, batches: 0 }
    return executeCleanup(db, plan)
  } finally {
    db.close()
  }
}

// 备份文件与原文件共存于同一目录，命名携带时间戳；已存在任意备份时不重复创建，
// 保证「原文件 + 最早备份」永远不会被同时覆盖。
export function backupDatabase(dbPath: string): { path: string; created: boolean } {
  const directory = path.dirname(dbPath)
  const base = path.basename(dbPath)
  const existing = readdirSync(directory).find((name: string) => name.startsWith(`${base}.bak`))
  if (existing) return { path: path.join(directory, existing), created: false }
  const target = path.join(directory, `${base}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`)
  copyFileSync(dbPath, target)
  return { path: target, created: true }
}

export function hasBackup(dbPath: string): boolean {
  const directory = path.dirname(dbPath)
  const base = path.basename(dbPath)
  return readdirSync(directory).some((name: string) => name.startsWith(`${base}.bak`))
}

export function requireBackup(dbPath: string) {
  if (!hasBackup(dbPath))
    throw new Error(`拒绝执行清理：未找到 ${path.basename(dbPath)}.bak* 备份，请先执行 backup`)
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
    for (const candidate of batch) {
      const original = asRow(db.prepare("SELECT data FROM event WHERE id = ?").get(candidate.id))?.data
      if (typeof original !== "string") continue
      update.run(buildTombstone(original, candidate.size), candidate.id)
      updated += 1
    }
    db.exec("COMMIT")
    batches += 1
  }
  return { updated, batches }
}

export function checkpoint(db: AdapterDatabase) {
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
}
