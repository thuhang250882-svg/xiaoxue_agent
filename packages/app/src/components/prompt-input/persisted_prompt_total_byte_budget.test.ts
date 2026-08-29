import { describe, expect, test } from "bun:test"
import { PERSISTED_HISTORY_TOTAL_LIMIT, persistedByteLength } from "@opencode-ai/core/util/persisted-payload"
import { migratePromptHistory } from "./history"

// 单条在内联上限内的 PNG 附件（无本地路径，必须内联）
function inlinePngEntry(id: string) {
  return {
    prompt: [
      { type: "text", content: id, start: 0, end: id.length },
      {
        type: "image",
        id,
        filename: `${id}.png`,
        mime: "image/png",
        dataUrl: `data:image/png;base64,${"B".repeat(300 * 1024)}`,
      },
    ],
    comments: [],
  }
}

describe("persisted prompt total byte budget", () => {
  test("history total stays within byte budget even with many mid-size entries", () => {
    const input = { entries: Array.from({ length: 30 }, (_, index) => inlinePngEntry(`entry-${index}`)) }
    const entries = (migratePromptHistory(input) as { entries: typeof input.entries }).entries

    expect(entries.length).toBeGreaterThan(1)
    expect(entries.length).toBeLessThan(30)
    expect(persistedByteLength(entries)).toBeLessThanOrEqual(PERSISTED_HISTORY_TOTAL_LIMIT)
    // 最新条目保留在最前
    expect(entries[0]?.prompt[1]?.id).toBe("entry-0")
  })

  test("single entry over the per-entry budget drops all dataUrls", () => {
    // 无本地路径的内联图片超过内联上限时会被保留，但整条超过 1MB 单条预算后
    // 必须清空全部 dataUrl（条目数量限制管不住单条超大记录）
    const input = { entries: [inlinePngEntry("huge")] }
    input.entries[0]!.prompt[1]!.dataUrl = `data:image/png;base64,${"D".repeat(1200 * 1024)}`
    const entries = (migratePromptHistory(input) as { entries: typeof input.entries }).entries
    const entry = entries[0]!

    expect(entry.prompt[1]?.dataUrl).toBe("")
    expect(entry.prompt[1]?.filename).toBe("huge.png")
    expect(persistedByteLength(entries)).toBeLessThan(10 * 1024)
  })

  test("migrate trims legacy oversized history to the byte budget", () => {
    const legacy = {
      version: 1,
      entries: Array.from({ length: 20 }, (_, index) => ({
        prompt: [
          { type: "text", content: `legacy-${index}`, start: 0, end: 10 },
          {
            type: "image",
            id: `legacy-${index}`,
            filename: `legacy-${index}.png`,
            mime: "image/png",
            dataUrl: `data:image/png;base64,${"E".repeat(300 * 1024)}`,
          },
        ],
        comments: [],
      })),
    }

    const migrated = migratePromptHistory(legacy) as { entries: unknown[] }

    expect(migrated.entries.length).toBeLessThan(20)
    expect(migrated.entries.length).toBeGreaterThan(0)
    expect(persistedByteLength(migrated.entries)).toBeLessThanOrEqual(PERSISTED_HISTORY_TOTAL_LIMIT)
  })
})
