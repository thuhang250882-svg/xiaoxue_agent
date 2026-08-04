import { describe, expect, test } from "bun:test"
import { sanitizePersistedValue } from "@opencode-ai/core/util/persisted-payload"
import { PersistTesting } from "@/utils/persist"

// workspace store（opencode.workspace.*.dat）同时保存草稿 prompt、followup
// 队列与布局，清洗只允许动超限附件载荷，其余键必须原样保留
function writeWorkspace(raw: unknown) {
  return PersistTesting.prepareWrite(JSON.stringify(raw), sanitizePersistedValue)
}

describe("workspace prompt sanitization", () => {
  test("strips oversized attachment from workspace draft prompt", () => {
    const store = {
      "draft:prompt": [
        { type: "text", content: "审核", start: 0, end: 2 },
        {
          type: "image",
          id: "att-1",
          filename: "report.doc",
          sourcePath: "C:\\report.doc",
          mime: "application/msword",
          dataUrl: `data:application/msword;base64,${"A".repeat(600 * 1024)}`,
        },
      ],
      "draft:layout": "wide",
    }

    const stored = JSON.parse(writeWorkspace(store))

    expect(stored["draft:prompt"][1].dataUrl).toBe("")
    expect(stored["draft:prompt"][1].filename).toBe("report.doc")
    expect(stored["draft:layout"]).toBe("wide")
  })

  test("cleans nested followup queues without touching unrelated state", () => {
    const store = {
      "followup.v1": {
        pending: [
          {
            prompt: [
              {
                type: "image",
                id: "att-9",
                filename: "huge.docx",
                sourcePath: "C:\\huge.docx",
                mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                dataUrl: `data:application/octet-stream;base64,${"C".repeat(600 * 1024)}`,
              },
            ],
          },
        ],
      },
      tabs: ["session-1"],
    }

    const stored = JSON.parse(writeWorkspace(store))

    expect(stored["followup.v1"].pending[0].prompt[0].dataUrl).toBe("")
    expect(stored.tabs).toEqual(["session-1"])
  })

  test("returns identical string when nothing is oversized", () => {
    const store = {
      "draft:prompt": [{ type: "text", content: "plain", start: 0, end: 5 }],
      "draft:layout": "wide",
    }
    const raw = JSON.stringify(store)
    expect(writeWorkspace(store)).toBe(raw)
  })

  test("sanitizePersistedValue keeps object identity for clean values", () => {
    const clean = { a: 1, b: [{ c: "text" }] }
    expect(sanitizePersistedValue(clean)).toBe(clean)
  })
})
