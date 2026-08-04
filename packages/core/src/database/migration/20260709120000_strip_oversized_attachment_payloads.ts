import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export const OVERSIZED_ATTACHMENT_COMPACTION_ID = "strip-oversized-attachments"

export default {
  id: "20260709120000_strip_oversized_attachment_payloads",
  up(tx) {
    return Effect.gen(function* () {
      // 早期版本会把大附件（如几十 MB 的 Word 文档）整体 base64 后写入会话历史，
      // 打开此类会话会直接耗尽渲染进程内存。此处把超大 data URL 替换为空载荷，
      // 历史中仅保留附件卡片；提取出的文本内容不受影响。
      const partStats = yield* tx.get<{ count: number; bytes: number }>(`
        SELECT COUNT(*) AS count, COALESCE(SUM(length(data)), 0) AS bytes
        FROM part
        WHERE length(data) > 1048576
          AND json_extract(data, '$.type') = 'file'
          AND json_extract(data, '$.url') LIKE 'data:%';
      `)
      const eventStats = yield* tx.get<{ count: number; bytes: number }>(`
        SELECT COUNT(*) AS count, COALESCE(SUM(length(data)), 0) AS bytes
        FROM event
        WHERE length(data) > 1048576
          AND json_extract(data, '$.part.type') = 'file'
          AND json_extract(data, '$.part.url') LIKE 'data:%';
      `)

      yield* tx.run(`
        UPDATE part
        SET data = json_set(data, '$.url', 'data:' || COALESCE(json_extract(data, '$.mime'), 'application/octet-stream') || ';base64,')
        WHERE length(data) > 1048576
          AND json_extract(data, '$.type') = 'file'
          AND json_extract(data, '$.url') LIKE 'data:%';
      `)
      yield* tx.run(`
        UPDATE event
        SET data = json_set(data, '$.part.url', 'data:' || COALESCE(json_extract(data, '$.part.mime'), 'application/octet-stream') || ';base64,')
        WHERE length(data) > 1048576
          AND json_extract(data, '$.part.type') = 'file'
          AND json_extract(data, '$.part.url') LIKE 'data:%';
      `)

      // SQLite 更新后不会自动缩小文件体积；确有清理时写入压缩标记，
      // 由数据库打开流程在事务外执行一次性 VACUUM
      const affected = (partStats?.count ?? 0) + (eventStats?.count ?? 0)
      if (affected > 0) {
        yield* tx.run(`CREATE TABLE IF NOT EXISTS compaction (id TEXT PRIMARY KEY, requested_at INTEGER NOT NULL)`)
        yield* tx.run(
          `INSERT OR IGNORE INTO compaction (id, requested_at) VALUES ('${OVERSIZED_ATTACHMENT_COMPACTION_ID}', ${Date.now()})`,
        )
        yield* Effect.logInfo("stripped oversized attachment payloads from session history", {
          rows: affected,
          bytes: (partStats?.bytes ?? 0) + (eventStats?.bytes ?? 0),
        })
      }
    })
  },
} satisfies DatabaseMigration.Migration
