import { copyFileSync, existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  PERSISTED_HISTORY_TOTAL_LIMIT,
  sanitizePersistedValue,
  trimHistoryToByteBudget,
} from "@opencode-ai/core/util/persisted-payload"

// 超过阈值的全局/工作区状态文件会在创建任何渲染进程之前被主进程修复。
// 阈值必须远小于曾导致渲染进程 OOM 的 165MB 实测值。
export const STORE_REPAIR_THRESHOLD_BYTES = 32 * 1024 * 1024
// workspace/draft 是按目录/草稿分片的小文件，用更低阈值尽早治理
export const SCOPED_STORE_REPAIR_THRESHOLD_BYTES = 8 * 1024 * 1024

const HISTORY_KEYS = ["prompt-history", "prompt-history-shell"]
const STORE_FILE = /^opencode\.(global|workspace\..+|draft\..+)\.dat$/

export type StoreRepairAction = "sanitized" | "history-reset" | "reset" | "failed"

export type StoreRepairEntry = {
  file: string
  action: StoreRepairAction
  before: number
  after: number
  durationMs: number
  error?: string
}

export type StoreRepairReport = {
  entries: StoreRepairEntry[]
  repaired: boolean
  historyReset: boolean
}

// 在主进程修复单个超限状态文件。顺序保证“原文件和备份不会被同时覆盖”：
// 先完整复制出 .bak，再把修复结果写进 .tmp，最后原子替换原文件。
export function repairStoreFile(path: string): StoreRepairEntry {
  const startedAt = Date.now()
  const before = statSync(path).size
  const backup = `${path}.bak`
  const entry: StoreRepairEntry = { file: path, action: "sanitized", before, after: before, durationMs: 0 }
  const finish = () => {
    entry.after = statSync(path).size
    entry.durationMs = Date.now() - startedAt
    return entry
  }

  try {
    // 已有备份时不再覆盖，保证最早的原文件始终可恢复
    if (!existsSync(backup)) copyFileSync(path, backup)
  } catch (error) {
    entry.action = "failed"
    entry.error = `备份失败：${describeError(error)}`
    entry.durationMs = Date.now() - startedAt
    return entry
  }

  const raw = readFileSync(path, "utf-8")
  const parsed = parseStore(raw)

  // 无法安全解析时降级：备份已保存，重置为空 store，历史与偏好一起丢弃
  if (parsed === undefined || typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    entry.action = "reset"
    writeAtomic(path, "{}")
    return finish()
  }

  const sanitized = sanitizeStore(parsed as Record<string, unknown>)
  const repairedRaw = JSON.stringify(sanitized.value)

  // 清洗后仍超阈值：只丢弃 prompt-history，保留其余偏好配置
  if (repairedRaw.length > STORE_REPAIR_THRESHOLD_BYTES) {
    for (const key of HISTORY_KEYS) delete sanitized.value[key]
    entry.action = "history-reset"
    writeAtomic(path, JSON.stringify(sanitized.value))
    return finish()
  }

  if (!sanitized.changed && repairedRaw.length >= before) return finish()
  writeAtomic(path, repairedRaw)
  if (sanitized.historyDropped) entry.action = "history-reset"
  return finish()
}

// 创建窗口前扫描 userData 下的状态文件并修复超限者。同步执行以保证
// 任何 electron-store 读取（首次 getStore 会整体解析文件）发生在修复之后。
export function preflightRepairStores(
  userDataPath: string,
  options: { threshold?: number; scopedThreshold?: number } = {},
): StoreRepairReport {
  const threshold = options.threshold ?? STORE_REPAIR_THRESHOLD_BYTES
  const scopedThreshold = options.scopedThreshold ?? SCOPED_STORE_REPAIR_THRESHOLD_BYTES
  const report: StoreRepairReport = { entries: [], repaired: false, historyReset: false }

  let files: string[] = []
  try {
    files = readdirSync(userDataPath)
  } catch {
    return report
  }

  for (const name of files) {
    if (!STORE_FILE.test(name)) continue
    const path = join(userDataPath, name)
    let size = 0
    try {
      const stats = statSync(path)
      if (!stats.isFile()) continue
      size = stats.size
    } catch {
      continue
    }
    const limit = name === "opencode.global.dat" ? threshold : scopedThreshold
    if (size <= limit) continue

    const entry = repairStoreFile(path)
    report.entries.push(entry)
    if (entry.action === "sanitized" || entry.action === "history-reset") report.repaired = true
    if (entry.action === "history-reset" || entry.action === "reset") report.historyReset = true
  }

  return report
}

function parseStore(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}

// 深度清洗整个 store：先按统一规则剥离超限附件 dataUrl，再对 prompt-history
// 条目应用总字节预算。返回 changed 供调用方判断是否需要回写。
function sanitizeStore(store: Record<string, unknown>) {
  let changed = false
  let historyDropped = false
  const value: Record<string, unknown> = {}

  for (const [key, item] of Object.entries(store)) {
    const sanitized = sanitizePersistedValue(item)
    if (sanitized !== item) changed = true
    if (HISTORY_KEYS.includes(key)) {
      const trimmed = sanitizeHistory(sanitized)
      if (trimmed.value !== sanitized) {
        changed = true
        historyDropped = historyDropped || trimmed.dropped
      }
      value[key] = trimmed.value
      continue
    }
    value[key] = sanitized
  }

  return { value, changed, historyDropped }
}

function sanitizeHistory(value: unknown): { value: unknown; dropped: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { value, dropped: false }
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.entries)) return { value, dropped: false }
  const entries = trimHistoryToByteBudget(record.entries, PERSISTED_HISTORY_TOTAL_LIMIT)
  if (entries === record.entries) return { value, dropped: false }
  return { value: { ...record, entries }, dropped: entries.length < record.entries.length }
}

function writeAtomic(path: string, content: string) {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, content, "utf-8")
  renameSync(tmp, path)
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
