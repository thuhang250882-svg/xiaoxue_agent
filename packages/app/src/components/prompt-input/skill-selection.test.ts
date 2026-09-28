import { describe, expect, test } from "bun:test"
import { promptWithSelectedSkill } from "./skill-selection"

describe("skill selection", () => {
  test("keeps typed task text and later file mentions aligned", () => {
    const result = promptWithSelectedSkill([
      { type: "text", content: "请审核 ", start: 0, end: 4 },
      { type: "file", path: "C:\\reports\\well.docx", content: "@well.docx", start: 4, end: 14 },
    ], "geolog-logging-review")
    expect(result[0]).toEqual({ type: "text", content: "/geolog-logging-review ", start: 0, end: 23 })
    expect(result[1]).toEqual({ type: "text", content: "请审核 ", start: 23, end: 27 })
    expect(result[2]).toMatchObject({ type: "file", path: "C:\\reports\\well.docx", start: 27, end: 37 })
  })

  test("replaces a previous skill without dropping task text", () => {
    const result = promptWithSelectedSkill([{ type: "text", content: "/old 请生成周报", start: 0, end: 10 }], "weekly-report")
    expect(result.map((part) => "content" in part ? part.content : "").join("")).toBe("/weekly-report 请生成周报")
    expect(result[1]).toMatchObject({ start: 15, end: 20 })
  })
})
