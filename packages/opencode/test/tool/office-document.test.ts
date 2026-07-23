import { afterAll, describe, expect, test } from "bun:test"
import { mkdir, rm } from "node:fs/promises"
import path from "node:path"
import {
  createOfficeDocumentDraft,
  exportOfficeDocumentDraft,
} from "../../src/tool/office-document"

const outputPath = path.join(import.meta.dir, ".tmp-office-document")

afterAll(async () => {
  await rm(outputPath, { recursive: true, force: true })
})

describe("office_document", () => {
  test("work summary has the company material structure", () => {
    const result = createOfficeDocumentDraft({
      taskType: "work_summary",
      title: "阶段工作总结",
      instructions: "本阶段完成报告审核流程联调，所有数据均来自当前任务记录。",
      outputFormat: "markdown",
    })

    expect(result.type).toBe("office_document_result")
    expect(result.content).toContain("## 主要工作")
    expect(result.content).toContain("## 取得成效")
    expect(result.content).toContain("## 存在问题")
    expect(result.content).toContain("## 下一步计划")
  })

  test("meeting minutes extract action owner and deadline", () => {
    const result = createOfficeDocumentDraft({
      taskType: "meeting_minutes",
      instructions:
        "会议主题：报告质量提升；时间：2026-07-11；参会人员：张三、李四。待办：整理报告问题库，责任人：张三，完成时限：2026-07-18。",
      outputFormat: "markdown",
    })

    expect(result.actionItems).toHaveLength(1)
    expect(result.actionItems[0]).toMatchObject({
      task: "整理报告问题库",
      owner: "张三",
      deadline: "2026-07-18",
      status: "pending",
    })
  })

  test("rectification list contains all required columns", () => {
    const result = createOfficeDocumentDraft({
      taskType: "rectification_list",
      instructions: "部分报告未填写完钻井深",
      outputFormat: "markdown",
    })

    for (const field of ["编号", "问题", "原因", "整改措施", "责任人", "完成期限", "当前状态"]) {
      expect(result.content).toContain(field)
    }
  })

  test("technical plan contains implementation and acceptance sections", () => {
    const result = createOfficeDocumentDraft({
      taskType: "technical_plan",
      instructions: "建设地质录井报告智能审核工作台。",
      outputFormat: "markdown",
    })

    expect(result.content).toContain("## 总体方案")
    expect(result.content).toContain("## 实施内容")
    expect(result.content).toContain("## 验收标准")
  })

  test("exports a real DOCX file", async () => {
    await mkdir(outputPath, { recursive: true })
    const result = createOfficeDocumentDraft({
      taskType: "work_report",
      title: "测试工作汇报",
      instructions: "本文件使用人工构造的脱敏测试内容。",
      outputFormat: "docx",
    })
    const exported = await exportOfficeDocumentDraft(result, outputPath)
    const bytes = new Uint8Array(await Bun.file(exported.filePath).arrayBuffer())

    expect(exported.format).toBe("docx")
    expect(exported.size).toBeGreaterThan(1000)
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK")
  })
})
