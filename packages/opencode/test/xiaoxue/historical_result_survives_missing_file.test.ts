import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import {
  BUSINESS_TASKS_METADATA_KEY,
  readBusinessTasks,
  upsertBusinessTask,
  type BusinessTask,
} from "../../src/tool/business-task"

// 构造一条带结构化审核结果的业务历史，源文件指向一个不存在的路径
function reviewTask(id: string, sourcePath: string): BusinessTask {
  return {
    id,
    sessionId: "ses_test",
    taskType: "geology_report_review",
    agent: "xiaoxue",
    title: "探井 A 录井报告",
    status: "completed",
    createdAt: "2026-07-01T08:00:00.000Z",
    completedAt: "2026-07-01T08:05:00.000Z",
    sourceFiles: [
      {
        fileName: "探井A录井报告.docx",
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sourcePath,
        size: 102_400,
        modifiedAt: 1_750_000_000_000,
        sha256: "a".repeat(64),
      },
    ],
    resultType: "review_result",
    result: {
      taskId: "review-1",
      fileName: "探井A录井报告.docx",
      summary: { totalIssues: 3, highRiskCount: 1, mediumRiskCount: 1, lowRiskCount: 1 },
      issues: [{ id: "issue-1", severity: "high", description: "井深与测井数据不一致" }],
    },
    score: { totalIssues: 3, highRiskCount: 1, mediumRiskCount: 1, lowRiskCount: 1 },
    exportedFiles: [{ fileName: "审核意见.docx", filePath: "G:\\导出\\审核意见.docx", format: "docx", size: 2048 }],
  }
}

describe("historical review results survive missing source files", () => {
  test("the structured result stays readable after the source file disappears", () => {
    const missing = "G:\\项目资料\\已被U盘移除\\探井A录井报告.docx"
    expect(existsSync(missing)).toBeFalse()

    const metadata = upsertBusinessTask({}, reviewTask("task_1", missing))
    const tasks = readBusinessTasks(metadata)

    expect(tasks).toHaveLength(1)
    expect(tasks[0].result).toMatchObject({ taskId: "review-1", summary: { totalIssues: 3 } })
    expect(tasks[0].score).toMatchObject({ highRiskCount: 1 })
    // 源文件元数据保留：脱敏展示与重新授权（hash 比对）都依赖它
    expect(tasks[0].sourceFiles[0]).toMatchObject({
      fileName: "探井A录井报告.docx",
      size: 102_400,
      sha256: "a".repeat(64),
    })
  })

  test("history never stores a consumable one-time credential", () => {
    const metadata = upsertBusinessTask({}, reviewTask("task_2", "D:\\资料\\报告.docx"))
    const serialized = JSON.stringify(metadata[BUSINESS_TASKS_METADATA_KEY])
    // 一次性凭证是高熵随机 token，历史里不得出现凭证 URL 或 attachmentId 字段
    expect(serialized).not.toContain("xiaoxue-attachment:")
    expect(serialized).not.toContain("attachmentId")
  })

  test("later reviews do not evict earlier results", () => {
    let metadata = upsertBusinessTask({}, reviewTask("task_old", "D:\\旧\\a.docx"))
    metadata = upsertBusinessTask(metadata, {
      ...reviewTask("task_new", "D:\\新\\b.docx"),
      id: "task_new",
      createdAt: "2026-07-02T08:00:00.000Z",
    })

    const tasks = readBusinessTasks(metadata)
    expect(tasks.map((task) => task.id)).toEqual(["task_new", "task_old"])
  })
})
