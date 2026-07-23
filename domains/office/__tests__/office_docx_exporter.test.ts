import { expect, test } from "bun:test"
import path from "node:path"
import { extractRawText } from "mammoth"
import { COMPANY_REPORTING_FORMAT, exportOfficeMaterialToDocx } from "../../../document_engine"

test("company reporting format matches the supplied Word requirements", () => {
  expect(COMPANY_REPORTING_FORMAT.font.title).toBe("方正小标宋简体")
  expect(COMPANY_REPORTING_FORMAT.font.heading1).toBe("方正黑体简体")
  expect(COMPANY_REPORTING_FORMAT.font.heading2).toBe("方正楷体简体")
  expect(COMPANY_REPORTING_FORMAT.font.body).toBe("方正仿宋简体")
  expect(COMPANY_REPORTING_FORMAT.size.title).toBe(44)
  expect(COMPANY_REPORTING_FORMAT.size.body).toBe(32)
  expect(COMPANY_REPORTING_FORMAT.size.pageNumber).toBe(28)
  expect(COMPANY_REPORTING_FORMAT.spacing.body).toBe(560)
  expect(COMPANY_REPORTING_FORMAT.page.margin).toEqual({
    top: 2098,
    bottom: 1984,
    left: 1587,
    right: 1474,
    header: 850,
    footer: 992,
  })
})

test("office material exports a readable DOCX with company headings", async () => {
  const exported = await exportOfficeMaterialToDocx(
    {
      title: "录井小雪阶段工作汇报",
      recipient: "公司领导：",
      content: "## 背景\n\n录井小雪已完成报告审核MVP。\n\n## 下一步计划\n\n1. 完善真实文件上传。\n2. 增强专业规则。",
      author: "项目组",
      date: "2026年7月10日",
    },
    { outputPath: path.join(import.meta.dir, ".tmp-office_docx_exporter.test") },
  )

  const bytes = new Uint8Array(await Bun.file(exported.filePath).arrayBuffer())
  const text = await extractRawText({ buffer: Buffer.from(bytes) })

  expect(exported.documentFormat).toBe("company_reporting_default")
  expect(exported.size).toBeGreaterThan(1000)
  expect(Array.from(bytes.slice(0, 2))).toEqual([0x50, 0x4b])
  expect(text.value).toContain("录井小雪阶段工作汇报")
  expect(text.value).toContain("一、背景")
  expect(text.value).toContain("二、下一步计划")
})
