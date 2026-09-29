import { expect, mock, test } from "bun:test"
import { createParsedDocument } from "../../../document_engine"
import { reviewGeologyReportRulesAsync } from "../rule_engine"
import { loadRulesFromYamlContents } from "../rules/loader"

const sections = [
  "资料验收意见书",
  "目  录",
  "第一章 概况",
  "第二章 录井工作及质量控制",
  "第三章 工程录井",
  "第四章 地层描述、储集层及油气水评价",
  "第五章 结论与建议",
  "附表1 基本数据表",
  "附图1 录测综合图",
]

test("semantic structure screening accepts historical report headings without literal template words", async () => {
  const document = createParsedDocument({
    fileName: "哨东103井录井报告.docx",
    fileType: "docx",
    rawText: ["哨东103井录井报告", ...sections].join("\n"),
  })
  const issues = await reviewGeologyReportRulesAsync(document)
  expect(issues.filter((item) => item.id.startsWith("STR-001"))).toHaveLength(0)
  expect(issues.filter((item) => item.id.startsWith("LITH-"))).toHaveLength(0)
})

test("neighbor-well comparisons do not count as main-well name conflicts or stratigraphic overlap", async () => {
  const document = createParsedDocument({
    fileName: "呼北2井录井报告.doc",
    fileType: "doc",
    rawText: [
      "呼北2井录井报告",
      ...sections,
      "本井与呼北1井、新湖1井进行地层及物性对比。",
      "呼北1井地层井段 6938.00m～6942.00m；本井地层井段 6920.00m～6926.00m。",
    ].join("\n"),
  })
  const issues = await reviewGeologyReportRulesAsync(document)
  expect(issues.some((item) => item.type === "multiple_well_names")).toBe(false)
  expect(issues.some((item) => item.type === "overlap_stratigraphy_interval")).toBe(false)
})

test("authoritative title mismatch remains a review candidate", async () => {
  const document = createParsedDocument({
    fileName: "哨东103井录井报告.docx",
    fileType: "docx",
    rawText: ["哨东102井录井报告", ...sections].join("\n"),
  })
  const issues = await reviewGeologyReportRulesAsync(document)
  expect(issues.some((item) => item.type === "multiple_well_names")).toBe(true)
})

test("basic-data table mismatch remains visible when its caption is not extracted", async () => {
  const document = createParsedDocument({
    fileName: "哨东103井录井报告.docx",
    fileType: "docx",
    rawText: ["哨东103井录井报告", ...sections].join("\n"),
    tables: [{ index: 1, rows: [["井号", "哨东102井", "井别", "预探井"], ["完钻井深", "4000m"]] }],
  })
  const issues = await reviewGeologyReportRulesAsync(document)
  expect(issues.some((item) => item.type === "multiple_well_names")).toBe(true)
})

test("overlap in a named stratigraphic table remains a review candidate", async () => {
  const document = createParsedDocument({
    fileName: "哨东103井录井报告.docx",
    fileType: "docx",
    rawText: ["哨东103井录井报告", ...sections].join("\n"),
    tables: [{
      index: 1,
      caption: "附表2 哨东103井地层分层数据表",
      rows: [["地层", "井段"], ["安集海河组", "3900.00m～3950.00m"], ["紫泥泉子组", "3940.00m～4000.00m"]],
    }],
  })
  const issues = await reviewGeologyReportRulesAsync(document)
  expect(issues.some((item) => item.type === "overlap_stratigraphy_interval")).toBe(true)
})

test("unrecognized sections are explicitly candidates rather than confirmed missing parts", async () => {
  const document = createParsedDocument({ fileName: "哨东103井录井报告.doc", fileType: "doc", rawText: "哨东103井录井报告" })
  const issues = await reviewGeologyReportRulesAsync(document)
  expect(issues.filter((item) => item.id.startsWith("STR-001")).every((item) => item.needHumanConfirm && item.issue.includes("不能据此判定缺失"))).toBe(true)
})

test("oil-show screening accepts a depth interval without the literal label 显示井段", async () => {
  const document = createParsedDocument({
    fileName: "哨东103井录井报告.docx",
    fileType: "docx",
    rawText: ["哨东103井录井报告", ...sections, "3946.75m～3950.52m油气显示，荧光和气测资料相互印证。"].join("\n"),
  })
  const issues = await reviewGeologyReportRulesAsync(document)
  expect(issues.some((item) => item.type === "missing_oil_gas_show_detail")).toBe(false)
})

test("PDF metadata from another well is reported as a template-residue candidate", async () => {
  const document = createParsedDocument({
    fileName: "天湾3井录井报告.pdf",
    fileType: "pdf",
    rawText: ["天湾3井录井报告", ...sections].join("\n"),
    metadata: { documentTitle: "金龙6井完井地质总结报告" },
  })
  const issues = await reviewGeologyReportRulesAsync(document)
  expect(issues.some((item) => item.type === "document_title_mismatch")).toBe(true)
})

test("acceptance placeholders are flagged without treating a final filename as approval", async () => {
  const document = createParsedDocument({
    fileName: "玛纳3井录井报告（最终）.doc",
    fileType: "doc",
    rawText: ["玛纳3井录井报告", "资料验收意见书 本井于XXXX年XX月XX日通过评审验收。验收人：手签", ...sections.slice(1)].join("\n"),
  })
  const issues = await reviewGeologyReportRulesAsync(document)
  expect(issues.some((item) => item.type === "acceptance_pending")).toBe(true)
})

test("unrecognized logging-unit label is a manual check, not a confirmed high-severity omission", async () => {
  const document = createParsedDocument({
    fileName: "哨东103井录井报告.docx",
    fileType: "docx",
    rawText: ["哨东103井录井报告", ...sections, "施工单位：西部钻探地质研究院"].join("\n"),
  })
  const issues = await reviewGeologyReportRulesAsync(document)
  const loggingUnit = issues.find((item) => item.type === "missing_required_field" && item.issue.includes("录井单位"))
  expect(loggingUnit?.severity).toBe("中")
  expect(loggingUnit?.needHumanConfirm).toBe(true)
})

test("a rule without checks or a dedicated evaluator warns at load instead of silently no-oping", async () => {
  const warn = mock((message: string) => {})
  const originalWarn = console.warn
  console.warn = warn as typeof console.warn
  try {
    const evaluators = loadRulesFromYamlContents([
      {
        rulePath: "lithology_rules.yaml",
        content: [
          "rules:",
          "  - id: LITH-001",
          "    category: lithology",
          "    name: 岩性描述完整性",
          "    required_parts:",
          "      - 岩性名称",
          "      - 颜色",
        ].join("\n"),
      },
    ])
    expect(evaluators).toHaveLength(1)
    const document = createParsedDocument({
      fileName: "哨东103井录井报告.docx",
      fileType: "docx",
      rawText: "哨东103井录井报告 岩性名称：砂岩",
    })
    expect(evaluators[0]!(document)).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0])).toContain("LITH-001")
    expect(String(warn.mock.calls[0])).toContain("不做任何检查")
  } finally {
    console.warn = originalWarn
  }
})
