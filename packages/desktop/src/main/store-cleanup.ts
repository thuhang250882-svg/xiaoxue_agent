import { readdir, readFile, rm, stat } from "node:fs/promises"
import { join } from "node:path"

const EMPTY_STORE_MAX_BYTES = 128
const DRAFT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const DRAFT_KEEP_RECENT = 100
// 草稿文件合计体积上限：条目数量限制管不住体积，单文件超限由 store-repair
// 预启动清洗负责，这里负责大量草稿累积时的总量治理（从最旧开始删除）
const DRAFT_TOTAL_BYTE_LIMIT = 32 * 1024 * 1024

type StoreKind = "draft" | "workspace"
type StoreCandidate = {
  name: string
  path: string
  kind: StoreKind
  modified: number
  size: number
  empty: boolean
}

export async function cleanupStoreFiles(userDataPath: string, now = Date.now()) {
  const entries = await readdir(userDataPath, { withFileTypes: true }).catch(() => [])
  const candidates = (
    await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const kind = storeKind(entry.name)
          if (!kind) return

          const file = join(userDataPath, entry.name)
          const stats = await stat(file).catch(() => undefined)
          if (!stats?.isFile()) return

          return {
            name: entry.name,
            path: file,
            kind,
            modified: stats.mtimeMs,
            size: stats.size,
            empty: await isEmptyStore(file, stats.size),
          }
        }),
    )
  ).filter((candidate) => !!candidate)

  const stale = new Set<StoreCandidate>()
  for (const candidate of candidates) {
    if (candidate.empty) stale.add(candidate)
    if (candidate.kind === "draft" && now - candidate.modified > DRAFT_RETENTION_MS) stale.add(candidate)
  }

  candidates
    .filter((candidate) => candidate.kind === "draft" && !candidate.empty)
    .sort((a, b) => b.modified - a.modified)
    .slice(DRAFT_KEEP_RECENT)
    .forEach((candidate) => stale.add(candidate))

  // 总量预算：按最新在前累计体积，超出上限的最旧草稿标记删除
  candidates
    .filter((candidate) => candidate.kind === "draft" && !candidate.empty && !stale.has(candidate))
    .sort((a, b) => b.modified - a.modified)
    .reduce((total, candidate) => {
      if (total + candidate.size > DRAFT_TOTAL_BYTE_LIMIT) stale.add(candidate)
      return total + candidate.size
    }, 0)

  const deleted = await Promise.all(
    [...stale].map(async (candidate) => {
      await rm(candidate.path, { force: true })
      return candidate.name
    }),
  )

  return { scanned: candidates.length, deleted }
}

export async function deleteStoreFileIfEmpty(userDataPath: string, name: string) {
  if (!storeKind(name)) return false

  const file = join(userDataPath, name)
  const stats = await stat(file).catch(() => undefined)
  if (!stats?.isFile()) return false
  if (!(await isEmptyStore(file, stats.size))) return false

  await rm(file, { force: true })
  return true
}

function storeKind(name: string): StoreKind | undefined {
  if (/^opencode\.draft\..+\.dat$/.test(name)) return "draft"
  if (/^opencode\.workspace\..+\.dat$/.test(name)) return "workspace"
}

async function isEmptyStore(file: string, size: number) {
  if (size > EMPTY_STORE_MAX_BYTES) return false

  const raw = await readFile(file, "utf8").catch(() => undefined)
  if (raw === undefined) return false
  if (raw.trim() === "") return true

  try {
    const parsed = JSON.parse(raw) as unknown
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) && Object.keys(parsed).length === 0
  } catch {
    return false
  }
}
