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
              filename: "report.doc",
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

describe("renderer starts after store repair", () => {
  test("preflight completes synchronously before any store read can happen", async () => {
    const root = await tempRoot()
    const path = join(root, "opencode.global.dat")
    await writeFile(path, oversizedStoreRaw())

    // preflightRepairStores 是同步函数：返回即代表修复完成，之后才允许
    // electron-store 首次读取（会整体 JSON.parse 该文件）
    const report = preflightRepairStores(root, { threshold: 1024 })
    expect(report.entries).toHaveLength(1)

    // 模拟 electron-store 的加载方式：整文件读取 + JSON.parse
    const parsed = JSON.parse(await readFile(path, "utf-8"))
    expect(parsed["prompt-history"].entries[0].prompt[0].dataUrl).toBe("")
    expect(parsed.theme).toBe("dark")
    expect((await stat(path)).size).toBeLessThan(1024 * 1024)
  })

  test("no oversized store remains after preflight for the renderer to load", async () => {
    const root = await tempRoot()
    await writeFile(join(root, "opencode.global.dat"), oversizedStoreRaw())
    await writeFile(
      join(root, "opencode.draft.abc.dat"),
      JSON.stringify({
        "draft:prompt": [
          {
            type: "image",
            id: "att-2",
            filename: "big.doc",
            sourcePath: "C:\\big.doc",
            mime: "application/msword",
            dataUrl: `data:application/msword;base64,${"C".repeat(600 * 1024)}`,
          },
        ],
      }),
    )

    const report = preflightRepairStores(root, { threshold: 1024, scopedThreshold: 1024 })

    expect(report.entries).toHaveLength(2)
    for (const entry of report.entries) {
      expect(entry.action).not.toBe("failed")
      expect(entry.after).toBeLessThan(entry.before)
    }
  })
})
