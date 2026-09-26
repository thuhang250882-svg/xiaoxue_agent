import { describe, expect, test } from "bun:test"
import type { Part } from "@opencode-ai/sdk/v2"
import type { ReviewStrategyCardData, ReviewStrategyResultData } from "./BusinessReviewResults"
import { businessResultFromPart, latestPendingReviewStrategy } from "./business-result-parser"

describe("business result parser", () => {
  test("keeps the latest verified preview visible through list calls and clears it after save", () => {
    const card: ReviewStrategyCardData = {
      id: "sample-id",
      title: "井深口径修订",
      status: "proposed",
      evidenceStatus: "verified",
      version: 1,
      before: "5000 m",
      after: "5001 m",
      rationale: "人工复核",
      basis: "原始记录",
      scenario: "井深不一致",
      exception: "垂深另核",
      sourceFile: "模拟原稿.docx",
      sourceLocation: "第一章",
    }
    const preview: ReviewStrategyResultData = { type: "review_strategy_result", action: "preview", value: card }
    const list: ReviewStrategyResultData = { type: "review_strategy_result", action: "list", value: [] }
    const save: ReviewStrategyResultData = {
      type: "review_strategy_result",
      action: "save",
      value: { ...card, status: "approved" },
    }
    const remove: ReviewStrategyResultData = {
      type: "review_strategy_result",
      action: "remove",
      value: { ...card, status: "retired" },
    }

    expect(latestPendingReviewStrategy([preview, list])?.id).toBe(card.id)
    expect(latestPendingReviewStrategy([preview, list, save])).toBeUndefined()
    expect(latestPendingReviewStrategy([preview, remove])).toBeUndefined()
    expect(
      latestPendingReviewStrategy([preview, save, { ...preview, value: { ...card, id: "new-candidate" } }])?.id,
    ).toBe("new-candidate")
    expect(
      latestPendingReviewStrategy([{ ...preview, value: { ...card, evidenceStatus: "needs-location-review" } }]),
    ).toBeUndefined()
  })

  test("recognizes a pending experience card without treating it as saved", () => {
    const result = businessResultFromPart({
      type: "tool",
      tool: "review_strategy",
      state: {
        status: "completed",
        output: JSON.stringify({
          type: "review_strategy_result",
          action: "preview",
          value: {
            id: "candidate-id",
            title: "待核对井深口径",
            status: "proposed",
            version: 1,
            before: "5000 m",
            after: "5001 m",
            rationale: "人工复核",
            basis: "原始记录",
            scenario: "井深不一致",
            exception: "垂深另核",
            sourceFile: "模拟原稿.docx",
            sourceLocation: "第一章",
          },
        }),
      },
    } as unknown as Part)
    expect(result?.type).toBe("review_strategy_result")
    if (result?.type !== "review_strategy_result") throw new Error("Expected review strategy result")
    expect(result.action).toBe("preview")
  })

  test("recognizes saved personal review experience", () => {
    const result = businessResultFromPart({
      type: "tool",
      tool: "review_strategy",
      state: {
        status: "completed",
        output: JSON.stringify({
          type: "review_strategy_result",
          action: "save",
          value: {
            id: "sample-id",
            title: "井深口径修订",
            status: "approved",
            version: 1,
            before: "5000 m",
            after: "5001 m",
            rationale: "人工复核",
            basis: "原始记录",
            scenario: "井深不一致",
            exception: "垂深另核",
            sourceFile: "模拟原稿.docx",
            sourceLocation: "第一章",
          },
        }),
      },
    } as unknown as Part)
    expect(result?.type).toBe("review_strategy_result")
    if (result?.type !== "review_strategy_result") throw new Error("Expected review strategy result")
    expect(result.action).toBe("save")
  })

  test("ignores incomplete experience cards instead of rendering missing fields", () => {
    const result = businessResultFromPart({
      type: "tool",
      tool: "review_strategy",
      state: {
        status: "completed",
        output: JSON.stringify({
          type: "review_strategy_result",
          action: "preview",
          value: { id: "incomplete", title: "缺少依据" },
        }),
      },
    } as unknown as Part)
    expect(result).toBeUndefined()
  })

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
