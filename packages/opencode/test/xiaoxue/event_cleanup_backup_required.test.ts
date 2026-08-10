import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { Database } from "bun:sqlite"
import os from "node:os"
import path from "node:path"
import { XiaoxueEventDbMaintenance as Maintenance } from "../../src/xiaoxue/event-db-maintenance"

describe("event cleanup requires backup", () => {
  test("refuses cleanup before any backup exists", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "event-maintenance-"))
    const file = path.join(directory, "opencode-test.db")
    new Database(file).close()
    expect(Maintenance.hasBackup(file)).toBe(false)
    expect(() => Maintenance.requireBackup(file)).toThrow(/备份/)
    rmSync(directory, { recursive: true, force: true })
  })

  test("creates fresh verified backups and rejects them after the source changes", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "event-maintenance-"))
    const file = path.join(directory, "opencode-test.db")
    const db = new Database(file)
    db.exec("CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO sample(value) VALUES ('one')")
    db.close()

    const backup = Maintenance.backupDatabase(file)
    expect(backup.created).toBe(true)
    expect(existsSync(backup.path)).toBe(true)
    expect(Maintenance.hasBackup(file)).toBe(true)
    expect(() => Maintenance.requireBackup(file)).not.toThrow()

    const changed = new Database(file)
    changed.exec("INSERT INTO sample(value) VALUES ('two')")
    changed.close()
    expect(Maintenance.hasBackup(file)).toBe(false)
    expect(() => Maintenance.requireBackup(file)).toThrow(/备份/)

    const fresh = Maintenance.backupDatabase(file)
    expect(fresh.path).not.toBe(backup.path)
    expect(Maintenance.hasBackup(file)).toBe(true)
    rmSync(directory, { recursive: true, force: true })
  })

  test("purges archived attachment payloads from the working database while the verified backup retains them", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "event-maintenance-"))
    const file = path.join(directory, "opencode-test.db")
    const db = new Database(file)
    db.exec(
      "CREATE TABLE attachment_payload_archive (source_table TEXT NOT NULL, source_id TEXT NOT NULL, data TEXT NOT NULL, archived_at INTEGER NOT NULL, PRIMARY KEY (source_table, source_id))",
    )
    const insert = db.prepare(
      "INSERT INTO attachment_payload_archive (source_table, source_id, data, archived_at) VALUES ('part', 'prt_1', ?, 1)",
    )
    insert.run("x".repeat(4096))
    insert.finalize()

    const backup = Maintenance.backupDatabase(file)
    Maintenance.requireBackup(file)
    expect(Maintenance.purgeArchivedAttachmentPayloads(db)).toEqual({ deleted: 1, bytes: 4096 })
    const workingCount = db.query("SELECT COUNT(*) AS count FROM attachment_payload_archive")
    expect(workingCount.get()).toEqual({ count: 0 })
    workingCount.finalize()

    const backupDb = new Database(backup.path, { readonly: true })
    const backupCount = backupDb.query("SELECT COUNT(*) AS count FROM attachment_payload_archive")
    expect(backupCount.get()).toEqual({ count: 1 })
    backupCount.finalize()
    backupDb.close()
    db.close()
    Bun.gc(true)
    rmSync(directory, { recursive: true, force: true })
  })
})
