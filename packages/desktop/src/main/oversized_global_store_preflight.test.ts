import { afterEach, describe, expect, test } from "bun:test"
import { readFile, rm, writeFile } from "node:fs/promises"
import { mkdtemp } from "node:fs/promises"
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

// 超过 512KB 内联上限的 Office 附件 dataUrl（有本地路径，按 file:// 引用发送）
function officeDataUrl(kilobytes: number) {
  return `data:application/msword;base64,${"A".repeat(kilobytes * 1024)}`
}

describe("oversized global store preflight", () => {
  test("sanitizes oversized global store and keeps unrelated preferences", async () => {
    const root = await tempRoot()
    const store = {
      "prompt-history": {
        version: 1,
        entries: [
          {
            prompt: [
              { type: "text", content: "分析这份录井报告", start: 0, end: 10 },
              {
                type: "image",
                id: "att-1",
                filename: "呼北2井录井报告.doc",
                sourcePath: "C:\\Users\\Administrator\\Desktop\\呼北2井录井报告.doc",
                mime: "application/msword",
                dataUrl: officeDataUrl(600),
              },
            ],
          },
        ],
      },
      theme: "dark",
      "window-state": { width: 1280, height: 720 },
    }
    await writeFile(join(root, "opencode.global.dat"), JSON.stringify(store))

    const report = preflightRepairStores(root, { threshold: 1024 })

    expect(report.repaired).toBe(true)
    expect(report.entries).toHaveLength(1)
    expect(report.entries[0].action).toBe("sanitized")
    expect(report.entries[0].after).toBeLessThan(report.entries[0].before)

    const repaired = JSON.parse(await readFile(join(root, "opencode.global.dat"), "utf-8"))
    expect(repaired.theme).toBe("dark")
    expect(repaired["window-state"]).toEqual({ width: 1280, height: 720 })
    const attachment = repaired["prompt-history"].entries[0].prompt[1]
    expect(attachment.dataUrl).toBe("")
    expect(attachment.sourcePath).toBe("C:\\Users\\Administrator\\Desktop\\呼北2井录井报告.doc")
    expect(attachment.filename).toBe("呼北2井录井报告.doc")
  })

  test("drops oldest history entries when total exceeds byte budget", async () => {
    const root = await tempRoot()
    // 30 条 × 300KB：单条在内联上限内不会被剥离，但总量超过 4MB 历史预算。
    // 与真实历史一致按最新在前排列，超预算时应从尾部（最旧）开始丢弃。
    const entries = Array.from({ length: 30 }, (_, index) => ({
      prompt: [
        {
          type: "image",
          id: `img-${29 - index}`,
          filename: `screenshot-${29 - index}.png`,
          mime: "image/png",
          dataUrl: `data:image/png;base64,${"B".repeat(300 * 1024)}`,
        },
      ],
    }))
    await writeFile(
      join(root, "opencode.global.dat"),
      JSON.stringify({ "prompt-history": { version: 1, entries }, theme: "dark" }),
    )

    const report = preflightRepairStores(root, { threshold: 1024 })

    expect(report.entries[0].action).toBe("history-reset")
    const repaired = JSON.parse(await readFile(join(root, "opencode.global.dat"), "utf-8"))
    const remaining = repaired["prompt-history"].entries as unknown[]
    expect(remaining.length).toBeLessThan(30)
    expect(remaining.length).toBeGreaterThan(0)
    // 保留的是最新条目（首条仍是 img-29），最旧的被丢弃
    expect((remaining[0] as any).prompt[0].id).toBe("img-29")
    expect((remaining[remaining.length - 1] as any).prompt[0].id).not.toBe("img-0")
    expect(repaired.theme).toBe("dark")
  })

  test("repairs oversized workspace stores with the scoped threshold", async () => {
    const root = await tempRoot()
    await writeFile(
      join(root, "opencode.workspace.QzpcVXNlcnNc.xg7okm.dat"),
      JSON.stringify({
        "draft:prompt": [
          {
            type: "image",
            id: "att-1",
            filename: "report.doc",
            sourcePath: "C:\\report.doc",
            mime: "application/msword",
            dataUrl: officeDataUrl(600),
          },
        ],
      }),
    )

    const report = preflightRepairStores(root, { scopedThreshold: 1024 })

    expect(report.repaired).toBe(true)
    const repaired = JSON.parse(
      await readFile(join(root, "opencode.workspace.QzpcVXNlcnNc.xg7okm.dat"), "utf-8"),
    )
    expect(repaired["draft:prompt"][0].dataUrl).toBe("")
  })

  test("leaves small stores untouched", async () => {
    const root = await tempRoot()
    const raw = JSON.stringify({ theme: "dark" })
    await writeFile(join(root, "opencode.global.dat"), raw)

    const report = preflightRepairStores(root)

    expect(report.entries).toEqual([])
    expect(report.repaired).toBe(false)
    expect(await readFile(join(root, "opencode.global.dat"), "utf-8")).toBe(raw)
  })
})
