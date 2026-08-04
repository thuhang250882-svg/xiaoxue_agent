import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { XiaoxueEventDbMaintenance as Maintenance } from "../../src/xiaoxue/event-db-maintenance"
import { XiaoxueSqlite } from "../../src/xiaoxue/sqlite.bun"
import type { AdapterDatabase } from "../../src/xiaoxue/sqlite"

export function createEventDb(directory: string) {
  const file = path.join(directory, "opencode-test.db")
  const db = XiaoxueSqlite.open(file)
  db.exec(`
    CREATE TABLE event_sequence (aggregate_id TEXT PRIMARY KEY, seq INTEGER NOT NULL, owner_id TEXT)
  `)
  db.exec(`
    CREATE TABLE event (
      id TEXT PRIMARY KEY,
      aggregate_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      type TEXT NOT NULL,
      data TEXT NOT NULL
    )
  `)
  db.exec(`
    CREATE TABLE audit_event (id TEXT PRIMARY KEY, action TEXT NOT NULL, metadata TEXT)
  `)
  return { db, file }
}

export function insertEvent(
  db: AdapterDatabase,
  input: { id: string; sessionID: string; seq: number; partID: string; payload: Record<string, unknown>; time?: number },
) {
  const data = { sessionID: input.sessionID, time: input.time ?? 1, part: { id: input.partID, ...input.payload } }
  db.prepare("INSERT INTO event (id, aggregate_id, seq, type, data) VALUES (?, ?, ?, 'message.part.updated.1', ?)").run(
    input.id,
    input.sessionID,
    input.seq,
    JSON.stringify(data),
  )
  db.prepare("INSERT INTO event_sequence (aggregate_id, seq) VALUES (?, ?) ON CONFLICT(aggregate_id) DO UPDATE SET seq = excluded.seq").run(
    input.sessionID,
    input.seq,
  )
}

describe("event payload analysis", () => {
  test("reports table sizes and event type distribution on a temp database", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "event-maintenance-"))
    const { db } = createEventDb(directory)
    insertEvent(db, { id: "evt_1", sessionID: "ses_a", seq: 1, partID: "prt_1", payload: { text: "x".repeat(4000) } })
    insertEvent(db, { id: "evt_2", sessionID: "ses_a", seq: 2, partID: "prt_1", payload: { text: "x".repeat(8000) } })
    db.prepare("INSERT INTO audit_event (id, action, metadata) VALUES ('aud_1', 'review', '{}')").run()

    const tables = Maintenance.tableSizes(db)
    const event = tables.find((table) => table.name === "event")!
    const audit = tables.find((table) => table.name === "audit_event")!
    expect(event.count).toBe(2)
    expect(event.bytes).toBeGreaterThan(12000)
    expect(audit.count).toBe(1)

    const analysis = Maintenance.analyze(db)
    expect(analysis.eventCount).toBe(2)
    expect(analysis.types[0]).toMatchObject({ type: "message.part.updated.1", count: 2 })
    expect(analysis.dataUrlEvents).toBe(0)
    db.close()
    rmSync(directory, { recursive: true, force: true })
  })

  test("counts events that still embed base64 data urls", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "event-maintenance-"))
    const { db } = createEventDb(directory)
    insertEvent(db, {
      id: "evt_1",
      sessionID: "ses_a",
      seq: 1,
      partID: "prt_1",
      payload: { attachments: [{ dataUrl: "data:image/png;base64,AAAA" }] },
    })
    expect(Maintenance.analyze(db).dataUrlEvents).toBe(1)
    db.close()
    rmSync(directory, { recursive: true, force: true })
  })
})
