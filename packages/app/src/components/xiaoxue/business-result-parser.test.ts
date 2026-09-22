import { describe, expect, test } from "bun:test"
import type { Part } from "@opencode-ai/sdk/v2"
import { businessResultFromPart } from "./business-result-parser"

describe("business result parser", () => {
  test("recognizes Office artifact preview results", () => {
    const result = businessResultFromPart({
      type: "tool",
      tool: "office_artifact_preview",
      state: {
        status: "completed",
        output: JSON.stringify({
          type: "office_artifact_result",
          filePath: "C:\\exports\\修改后.pptx",
          fileName: "修改后.pptx",
          fileType: "pptx",
          size: 1024,
          metadata: { slideCount: 1 },
          paragraphs: [{ location: "幻灯片 1", text: "录井汇报" }],
          tables: [],
          truncated: false,
        }),
      },
    } as unknown as Part)

    expect(result?.type).toBe("office_artifact_result")
    if (result?.type !== "office_artifact_result") throw new Error("Expected Office artifact result")
    expect(result.fileName).toBe("修改后.pptx")
    expect(result.annotations).toEqual([])
  })

  test("ignores incomplete artifact payloads", () => {
    const result = businessResultFromPart({
      type: "tool",
      tool: "office_artifact_preview",
      state: { status: "completed", output: '{"type":"office_artifact_result"}' },
    } as unknown as Part)

    expect(result).toBeUndefined()
  })

  test("recognizes paired Office revision results", () => {
    const artifact = {
      type: "office_artifact_result",
      filePath: "C:\\exports\\合同_标注版.docx",
      fileName: "合同_标注版.docx",
      fileType: "docx",
      size: 1024,
      metadata: {},
      paragraphs: [],
      tables: [],
      truncated: false,
    }
    const result = businessResultFromPart({
      type: "tool",
      tool: "office_document_revise",
      state: {
        status: "completed",
        output: JSON.stringify({
          type: "office_revision_result",
          sourceFileName: "合同.docx",
          format: "docx",
          changes: { annotated: { applied: 1, unmatched: 0 }, final: { applied: 1, unmatched: 0 } },
          annotated: { ...artifact, variant: "annotated" },
          final: {
            ...artifact,
            filePath: "C:\\exports\\合同_最终修改版.docx",
            fileName: "合同_最终修改版.docx",
            variant: "final",
          },
        }),
      },
    } as unknown as Part)

    expect(result?.type).toBe("office_revision_result")
    if (result?.type !== "office_revision_result") throw new Error("Expected Office revision result")
    expect(result.annotated.annotations).toEqual([])
    expect(result.final.annotations).toEqual([])
  })
})
