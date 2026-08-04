import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { XiaoxueEventDbMaintenance as Maintenance } from "../../src/xiaoxue/event-db-maintenance"
import { createEventDb, insertEvent } from "./event_payload_analysis.test"

describe("aggregate-scoped event compaction", () => {
  test("compacts only superseded text snapshots of the target session", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "event-maintenance-"))
    const { db } = createEventDb(directory)
    // ses_a：prt_1 三次 text 快照（前两次可压缩），prt_tool 两次 tool 快照（不压缩），prt_2 唯一快照（不压缩）
    insertEvent(db, {
      id: "evt_1",
      sessionID: "ses_a",
      seq: 1,
      partID: "prt_1",
      payload: { type: "text", text: "x".repeat(5000) },
    })
    insertEvent(db, {
      id: "evt_2",
      sessionID: "ses_a",
      seq: 2,
      partID: "prt_1",
      payload: { type: "text", text: "x".repeat(6000) },
    })
    insertEvent(db, {
      id: "evt_3",
      sessionID: "ses_a",
      seq: 3,
      partID: "prt_1",
      payload: { type: "text", text: "最终正文" },
    })
    insertEvent(db, {
      id: "evt_4",
      sessionID: "ses_a",
      seq: 4,
      partID: "prt_tool",
      payload: { type: "tool", state: { status: "running", output: "y".repeat(5000) } },
    })
    insertEvent(db, {
      id: "evt_5",
      sessionID: "ses_a",
      seq: 5,
      partID: "prt_tool",
      payload: { type: "tool", state: { status: "completed", output: "y".repeat(6000) } },
    })
    insertEvent(db, {
      id: "evt_6",
      sessionID: "ses_a",
      seq: 6,
      partID: "prt_2",
      payload: { type: "text", text: "用户消息正文".repeat(500) },
    })
    // ses_b：跨 Session 的旧快照不受影响
    insertEvent(db, {
      id: "evt_7",
      sessionID: "ses_b",
      seq: 1,
      partID: "prt_9",
      payload: { type: "text", text: "z".repeat(5000) },
    })
    insertEvent(db, {
      id: "evt_8",
      sessionID: "ses_b",
      seq: 2,
      partID: "prt_9",
      payload: { type: "text", text: "z".repeat(6000) },
    })

    const plan = Maintenance.planAggregateCleanup(db, "ses_a")
    expect(plan.candidates.map((candidate) => candidate.id)).toEqual(["evt_2", "evt_1"])

    Maintenance.executeCleanup(db, plan)
    const rows = db.prepare("SELECT id, data FROM event ORDER BY seq").all() as Array<{ id: string; data: string }>
    const byId = Object.fromEntries(rows.map((row) => [row.id, JSON.parse(row.data) as Record<string, unknown>]))
    expect(byId.evt_1).toMatchObject({ compacted: true, part: { id: "prt_1" } })
    expect(byId.evt_2).toMatchObject({ compacted: true })
    // 最新 text 快照、tool 结果、唯一快照、其他 Session 全部原样保留
    expect((byId.evt_3.part as { text: string }).text).toBe("最终正文")
    expect(((byId.evt_4.part as { state: { output: string } }).state).output).toContain("y")
    expect(((byId.evt_5.part as { state: { status: string } }).state).status).toBe("completed")
    expect((byId.evt_6.part as { text: string }).text).toContain("用户消息正文")
    expect((byId.evt_7.part as { text: string }).text).toContain("z")
    expect(rows).toHaveLength(8)
    db.close()
    rmSync(directory, { recursive: true, force: true })
  })

  test("compactSessionEvents works on a file path and is idempotent", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "event-maintenance-"))
    const { db, file } = createEventDb(directory)
    insertEvent(db, {
      id: "evt_1",
      sessionID: "ses_a",
      seq: 1,
      partID: "prt_1",
      payload: { type: "text", text: "x".repeat(5000) },
    })
    insertEvent(db, {
      id: "evt_2",
      sessionID: "ses_a",
      seq: 2,
      partID: "prt_1",
      payload: { type: "text", text: "最终正文" },
    })
    db.close()

    const result = Maintenance.compactSessionEvents("ses_a", file)
    expect(result.updated).toBe(1)
    // tombstone 低于大小阈值，重复执行不再压缩
    expect(Maintenance.compactSessionEvents("ses_a", file).updated).toBe(0)
    rmSync(directory, { recursive: true, force: true })
  })

  test("compactSessionEvents skips in-memory databases", () => {
    expect(Maintenance.compactSessionEvents("ses_a", ":memory:")).toEqual({ updated: 0, batches: 0 })
    expect(Maintenance.compactSessionEvents("ses_a", "")).toEqual({ updated: 0, batches: 0 })
  })
})
