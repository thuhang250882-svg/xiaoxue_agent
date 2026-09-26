import { expect, test } from "bun:test"
import { reviewUploadedAttachments } from "../../../../domains/geology_report/upload_review"

test("approved experience becomes an unscored human-review hint before report rules run", async () => {
  const text = "模拟井录井报告。终孔井深为 5000 m。其余资料请人工核对。"
  const result = await reviewUploadedAttachments({
    sessionId: "synthetic-strategy-hints",
    taskId: "synthetic-strategy-hints",
    attachments: [
      {
        filename: "模拟井录井报告.txt",
        mime: "text/plain",
        url: `data:text/plain;base64,${Buffer.from(text).toString("base64")}`,
      },
    ],
    reviewStrategies: [
      {
        id: "matching-card",
        title: "核对井深口径",
        before: "5000 m",
        scenario: "终孔井深与原始记录不一致时",
        exception: "垂深另核",
        basis: "模拟审核记录",
        sourceFile: "模拟原稿.docx",
        sourceLocation: "第一章",
      },
      {
        id: "scope-only-card",
        title: "检查单位",
        before: "未出现的片段",
        scenario: "单位不一致时",
        exception: "无",
        basis: "模拟审核记录",
        sourceFile: "模拟原稿.docx",
        sourceLocation: "第二章",
      },
    ],
  })

  expect(result.strategyHints?.map((hint) => [hint.id, hint.match])).toEqual([
    ["matching-card", "原文片段命中"],
    ["scope-only-card", "仅报告类型匹配"],
  ])
  expect(result.result.issues.some((issue) => issue.id === "matching-card" || issue.id === "scope-only-card")).toBe(
    false,
  )
})
