import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { XiaoxueEventDbMaintenance as Maintenance } from "../../src/xiaoxue/event-db-maintenance"
import { createEventDb, insertEvent } from "./event_payload_analysis.test"

describe("event cleanup batching", () => {
  test("processes candidates in bounded transactions", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "event-maintenance-"))
    const { db, file } = createEventDb(directory)
    // 7 个 part,每个 part 两条快照 → 7 个候选
    for (let index = 0; index < 7; index++) {
      insertEvent(db, {
        id: `evt_${index}_a`,
        sessionID: "ses_a",
        seq: index * 2 + 1,
        partID: `prt_${index}`,
        payload: { text: "x".repeat(4000) },
      })
      insertEvent(db, {
        id: `evt_${index}_b`,
        sessionID: "ses_a",
        seq: index * 2 + 2,
        partID: `prt_${index}`,
        payload: { text: "x".repeat(4500) },
      })
    }
    Maintenance.backupDatabase(file)
    const plan = Maintenance.planCleanup(db)
    expect(plan.candidates).toHaveLength(7)
    const result = Maintenance.executeCleanup(db, plan, 3)
    expect(result.updated).toBe(7)
    expect(result.batches).toBe(3)
    // 每个 part 的最新快照仍然完整
    for (let index = 0; index < 7; index++) {
      const row = db.prepare("SELECT data FROM event WHERE id = ?").get(`evt_${index}_b`) as { data: string }
      expect(JSON.parse(row.data).compacted).toBeUndefined()
    }
    db.close()
    rmSync(directory, { recursive: true, force: true })
  })
})
