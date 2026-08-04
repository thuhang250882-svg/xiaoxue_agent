import { describe, expect, test } from "bun:test"
import { sanitizePersistedValue } from "@opencode-ai/core/util/persisted-payload"
import { PersistTesting } from "@/utils/persist"

// 草稿每次键入都会全量写盘（Persist setItem），写路径的 prepare 钩子负责
// 在落盘前剥离超限附件 dataUrl，避免 opencode.draft.*.dat 膨胀
function writeDraft(raw: unknown) {
  return PersistTesting.prepareWrite(JSON.stringify(raw), sanitizePersistedValue)
}

describe("draft strips large data url", () => {
  test("oversized office attachment keeps metadata but drops inline payload", () => {
    const prompt = [
      { type: "text", content: "分析这份录井报告", start: 0, end: 8 },
      {
        type: "image",
        id: "att-1",
        filename: "呼北2井录井报告.doc",
        sourcePath: "C:\\Users\\Administrator\\Desktop\\呼北2井录井报告.doc",
        mime: "application/msword",
        dataUrl: `data:application/msword;base64,${"A".repeat(600 * 1024)}`,
      },
    ]

    const stored = JSON.parse(writeDraft(prompt))

    expect(stored[1].dataUrl).toBe("")
    expect(stored[1].sourcePath).toBe("C:\\Users\\Administrator\\Desktop\\呼北2井录井报告.doc")
    expect(stored[1].filename).toBe("呼北2井录井报告.doc")
    expect(stored[1].mime).toBe("application/msword")
    expect(stored[0].content).toBe("分析这份录井报告")
  })

  test("small inline image stays intact", () => {
    const prompt = [
      {
        type: "image",
        id: "att-2",
        filename: "chart.png",
        mime: "image/png",
        dataUrl: "data:image/png;base64,QUJD",
      },
    ]

    const raw = JSON.stringify(prompt)
    expect(writeDraft(prompt)).toBe(raw)
  })

  test("oversized image with local path drops payload for file:// resubmission", () => {
    const prompt = [
      {
        type: "image",
        id: "att-3",
        filename: "scan.png",
        sourcePath: "C:\\scan.png",
        mime: "image/png",
        dataUrl: `data:image/png;base64,${"B".repeat(600 * 1024)}`,
      },
    ]

    const stored = JSON.parse(writeDraft(prompt))
    expect(stored[0].dataUrl).toBe("")
    expect(stored[0].sourcePath).toBe("C:\\scan.png")
  })

  test("clean draft writes are not re-serialized", () => {
    const prompt = [{ type: "text", content: "hello", start: 0, end: 5 }]
    const raw = JSON.stringify(prompt)
    expect(writeDraft(prompt)).toBe(raw)
  })
})
