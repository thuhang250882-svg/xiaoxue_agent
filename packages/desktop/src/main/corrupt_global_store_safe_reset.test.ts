import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { preflightRepairStores } from "./store-repair"

const roots: string[] = []

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "opencode-store-repair-"))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("corrupt global store safe reset", () => {
  test("resets an oversized unparseable store while preserving its backup", async () => {
    const root = await tempRoot()
    const path = join(root, "opencode.global.dat")
    const corrupt = `{"prompt-history": {{{ corrupted payload ${"x".repeat(2048)}`
    await writeFile(path, corrupt)

    const report = preflightRepairStores(root, { threshold: 1024 })

    expect(report.entries[0].action).toBe("reset")
    expect(report.historyReset).toBe(true)
    // 降级为全新空 store，其余由应用重新生成；原始损坏内容保留在备份中
    expect(await readFile(path, "utf-8")).toBe("{}")
    expect(await readFile(`${path}.bak`, "utf-8")).toBe(corrupt)
  })

  test("leaves small corrupt stores for the app's own error handling", async () => {
    const root = await tempRoot()
    const path = join(root, "opencode.global.dat")
    const corrupt = "{invalid"
    await writeFile(path, corrupt)

    const report = preflightRepairStores(root)

    expect(report.entries).toEqual([])
    expect(await readFile(path, "utf-8")).toBe(corrupt)
  })
})
