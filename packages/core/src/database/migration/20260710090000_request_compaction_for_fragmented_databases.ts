import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

// 超过该体积的可回收空闲页才触发一次性压缩，避免小库在启动时执行无谓的 VACUUM
const COMPACTION_FREELIST_THRESHOLD = 256 * 1024 * 1024

export default {
  id: "20260710090000_request_compaction_for_fragmented_databases",
  up(tx) {
    return Effect.gen(function* () {
      // 旧版本安装在本库执行 strip_oversized_attachment_payloads 时还没有压缩标记
      // 机制，删除的大字段变成了空闲页留在文件里。这里按可回收空间补写标记，
      // 由数据库打开流程在事务外执行一次性 VACUUM。
      const freelist = yield* tx.get<{ freelist_count: number }>(`PRAGMA freelist_count`)
      const pageSize = yield* tx.get<{ page_size: number }>(`PRAGMA page_size`)
      const reclaimable = (freelist?.freelist_count ?? 0) * (pageSize?.page_size ?? 4096)
      if (reclaimable <= COMPACTION_FREELIST_THRESHOLD) return
      yield* tx.run(`CREATE TABLE IF NOT EXISTS compaction (id TEXT PRIMARY KEY, requested_at INTEGER NOT NULL)`)
      yield* tx.run(
        `INSERT OR IGNORE INTO compaction (id, requested_at) VALUES ('strip-oversized-attachments', ${Date.now()})`,
      )
      yield* Effect.logInfo("requested one-time database compaction for freed attachment payload space", {
        reclaimable,
      })
    })
  },
} satisfies DatabaseMigration.Migration
