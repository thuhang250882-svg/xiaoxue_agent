import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { XiaoxueEventDbMaintenance as Maintenance } from "../../src/xiaoxue/event-db-maintenance"
import { createEventDb, insertEvent } from "./event_payload_analysis.test"

describe("event cleanup preserves business results", () => {
  test("keeps latest snapshot per part, user messages, errors and audit rows", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "event-maintenance-"))
    const { db, file } = createEventDb(directory)
    // 同一 part 的三次流式快照:只有前两次可压缩,最新一次必须原样保留
    insertEvent(db, { id: "evt_1", sessionID: "ses_a", seq: 1, partID: "prt_1", payload: { text: "x".repeat(5000) } })
    insertEvent(db, { id: "evt_2", sessionID: "ses_a", seq: 2, partID: "prt_1", payload: { text: "x".repeat(6000) } })
    insertEvent(db, { id: "evt_3", sessionID: "ses_a", seq: 3, partID: "prt_1", payload: { text: "最终正文" } })
    // 用户消息 part:唯一快照,不得触碰
    insertEvent(db, { id: "evt_4", sessionID: "ses_a", seq: 4, partID: "prt_user", payload: { text: "用户提问正文".repeat(500) } })
    // Provider 错误 part:唯一快照,不得触碰
    insertEvent(db, {
      id: "evt_5",
      sessionID: "ses_a",
      seq: 5,
      partID: "prt_err",
      payload: { state: { status: "error", error: "provider 500" } },
    })
    db.prepare("INSERT INTO audit_event (id, action, metadata) VALUES ('aud_1', 'business.review', ?)").run(
      JSON.stringify({ result: "approved" }),
    )
    Maintenance.backupDatabase(file)
    Maintenance.executeCleanup(db, Maintenance.planCleanup(db))

    const rows = db.prepare("SELECT id, data FROM event ORDER BY seq").all() as Array<{ id: string; data: string }>
    const byId = Object.fromEntries(rows.map((row) => [row.id, JSON.parse(row.data) as Record<string, unknown>]))
    // 旧快照被替换为 tombstone,但保留 part 身份与 session
    expect(byId.evt_1).toMatchObject({ compacted: true, sessionID: "ses_a", part: { id: "prt_1" } })
    expect(byId.evt_2).toMatchObject({ compacted: true })
    // 最新快照 / 用户消息 / Provider 错误原样保留
    expect((byId.evt_3.part as { text: string }).text).toBe("最终正文")
    expect((byId.evt_4.part as { text: string }).text).toContain("用户提问正文")
    expect(((byId.evt_5.part as { state: { error: string } }).state).error).toBe("provider 500")
    // 事件行数量不变,seq 完整,审核链未动
    expect(rows).toHaveLength(5)
    const audit = db.prepare("SELECT metadata FROM audit_event WHERE id = 'aud_1'").get() as { metadata: string }
    expect(JSON.parse(audit.metadata)).toMatchObject({ result: "approved" })
    db.close()
    rmSync(directory, { recursive: true, force: true })
  })

  test("re-running cleanup after compaction finds nothing new", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "event-maintenance-"))
    const { db, file } = createEventDb(directory)
    insertEvent(db, { id: "evt_1", sessionID: "ses_a", seq: 1, partID: "prt_1", payload: { text: "x".repeat(5000) } })
    insertEvent(db, { id: "evt_2", sessionID: "ses_a", seq: 2, partID: "prt_1", payload: { text: "x".repeat(6000) } })
    Maintenance.backupDatabase(file)
    Maintenance.executeCleanup(db, Maintenance.planCleanup(db))
    // tombstone 体积低于阈值,第二轮 plan 为空,清理幂等
    expect(Maintenance.planCleanup(db).candidates).toHaveLength(0)
    db.close()
    rmSync(directory, { recursive: true, force: true })
  })
})
