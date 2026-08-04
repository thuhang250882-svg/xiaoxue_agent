import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { XiaoxueEventDbMaintenance as Maintenance } from "../../src/xiaoxue/event-db-maintenance"
import { createEventDb, insertEvent } from "./event_payload_analysis.test"

describe("event cleanup dry-run", () => {
  test("dry-run estimates savings without writing any byte", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "event-maintenance-"))
    const { db } = createEventDb(directory)
    insertEvent(db, { id: "evt_1", sessionID: "ses_a", seq: 1, partID: "prt_1", payload: { text: "x".repeat(5000) } })
    insertEvent(db, { id: "evt_2", sessionID: "ses_a", seq: 2, partID: "prt_1", payload: { text: "x".repeat(9000) } })
    insertEvent(db, { id: "evt_3", sessionID: "ses_a", seq: 3, partID: "prt_2", payload: { text: "y".repeat(6000) } })

    const before = Maintenance.analyze(db)
    const plan = Maintenance.planCleanup(db)
    const after = Maintenance.analyze(db)

    // 只有 prt_1 的旧快照(evt_1)可压缩；prt_2 唯一快照与 prt_1 最新快照保留
    expect(plan.candidates.map((candidate) => candidate.id)).toEqual(["evt_1"])
    expect(plan.estimatedBytesFreed).toBeGreaterThan(4000)
    expect(after.eventBytes).toBe(before.eventBytes)
    expect(after.eventCount).toBe(before.eventCount)
    db.close()
    rmSync(directory, { recursive: true, force: true })
  })

  test("dry-run is repeatable and idempotent", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "event-maintenance-"))
    const { db } = createEventDb(directory)
    insertEvent(db, { id: "evt_1", sessionID: "ses_a", seq: 1, partID: "prt_1", payload: { text: "x".repeat(5000) } })
    insertEvent(db, { id: "evt_2", sessionID: "ses_a", seq: 2, partID: "prt_1", payload: { text: "x".repeat(9000) } })
    expect(Maintenance.planCleanup(db).candidates).toEqual(Maintenance.planCleanup(db).candidates)
    db.close()
    rmSync(directory, { recursive: true, force: true })
  })
})
