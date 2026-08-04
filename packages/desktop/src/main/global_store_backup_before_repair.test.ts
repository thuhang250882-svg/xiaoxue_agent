import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
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

function oversizedStoreRaw() {
  return JSON.stringify({
    "prompt-history": {
      version: 1,
      entries: [
        {
          prompt: [
            {
              type: "image",
              id: "att-1",
              filename: "呼北2井录井报告.doc",
              sourcePath: "C:\\report.doc",
              mime: "application/msword",
              dataUrl: `data:application/msword;base64,${"A".repeat(600 * 1024)}`,
            },
          ],
        },
      ],
    },
    theme: "dark",
  })
}

describe("global store backup before repair", () => {
  test("creates .bak with the original content before rewriting the store", async () => {
    const root = await tempRoot()
    const path = join(root, "opencode.global.dat")
    const original = oversizedStoreRaw()
    await writeFile(path, original)

    const report = preflightRepairStores(root, { threshold: 1024 })

    expect(report.repaired).toBe(true)
    expect(await readFile(`${path}.bak`, "utf-8")).toBe(original)
    const repaired = await readFile(path, "utf-8")
    expect(repaired).not.toBe(original)
    expect(repaired.length).toBeLessThan(original.length)
    // 备份永远是修复前的原文件，且大小与原内容一致
    expect((await stat(`${path}.bak`)).size).toBe(Buffer.byteLength(original, "utf-8"))
  })

  test("never overwrites an existing backup on later repairs", async () => {
    const root = await tempRoot()
    const path = join(root, "opencode.global.dat")
    const original = oversizedStoreRaw()
    await writeFile(path, original)
    preflightRepairStores(root, { threshold: 1024 })

    // 模拟状态再次膨胀后的第二次修复：备份不能被覆盖
    await writeFile(path, oversizedStoreRaw())
    preflightRepairStores(root, { threshold: 1024 })

    expect(await readFile(`${path}.bak`, "utf-8")).toBe(original)
  })
})
