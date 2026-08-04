import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { XiaoxueEventDbMaintenance as Maintenance } from "../../src/xiaoxue/event-db-maintenance"

describe("event cleanup requires backup", () => {
  test("refuses cleanup before any backup exists", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "event-maintenance-"))
    const file = path.join(directory, "opencode-test.db")
    writeFileSync(file, "placeholder")
    expect(Maintenance.hasBackup(file)).toBe(false)
    expect(() => Maintenance.requireBackup(file)).toThrow(/备份/)
    rmSync(directory, { recursive: true, force: true })
  })

  test("creates a timestamped backup and never overwrites an existing one", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "event-maintenance-"))
    const file = path.join(directory, "opencode-test.db")
    writeFileSync(file, "original-content")
    const existing = path.join(directory, `${path.basename(file)}.bak-manual`)
    writeFileSync(existing, "earlier-backup")

    const backup = Maintenance.backupDatabase(file)
    // 已有备份时复用,不创建新备份,保证原文件与最早备份不会同时被覆盖
    expect(backup.created).toBe(false)
    expect(backup.path).toBe(existing)
    expect(Maintenance.hasBackup(file)).toBe(true)
    expect(() => Maintenance.requireBackup(file)).not.toThrow()

    rmSync(existing)
    const fresh = Maintenance.backupDatabase(file)
    expect(fresh.created).toBe(true)
    expect(existsSync(fresh.path)).toBe(true)
    // 再次备份不覆盖刚创建的备份
    const again = Maintenance.backupDatabase(file)
    expect(again.created).toBe(false)
    expect(again.path).toBe(fresh.path)
    rmSync(directory, { recursive: true, force: true })
  })
})
