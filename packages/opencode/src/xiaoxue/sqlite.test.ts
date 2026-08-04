import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { XiaoxueSqlite } from "#xiaoxue-sqlite"

let directory: string | undefined

afterEach(async () => {
  if (!directory) return
  await rm(directory, { recursive: true, force: true })
  directory = undefined
})

describe("xiaoxue sqlite adapter", () => {
  test("releases prepared statements when the database closes", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "xiaoxue-sqlite-"))
    const database = XiaoxueSqlite.open(path.join(directory, "memory.sqlite"))
    database.exec("CREATE TABLE memory (value TEXT)")
    database.prepare("INSERT INTO memory VALUES (?)").run("ready")

    database.close()
    await expect(rm(directory, { recursive: true })).resolves.toBeUndefined()
    directory = undefined
  })
})
