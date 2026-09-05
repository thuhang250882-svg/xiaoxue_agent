import { Packer, Table, TableCell, TableLayoutType, TableRow, VerticalAlign, WidthType } from "docx"
import type { ReviewIssue, ReviewResult } from "../review_result"
import { SEVERITY_LABELS } from "../../domains/shared/constants"
import {
  COMPANY_REPORTING_FORMAT,
  companyBodyParagraph,
  companyHeading,
  companyLabelParagraph,
  companyNumberedParagraph,
  companyTableParagraph,
  companyTitle,
  createCompanyReportingDocument,
} from "../templates"
import { extractWellName, sanitizeFileName } from "./review_html_exporter"
import type { ExportedReviewFile, ReviewExportOptions } from "./review_html_exporter"

const DISCLAIMER =
  "本审核结果由“录井小雪”智能体根据已配置规则和已提供资料自动生成，仅作为专业人员审核的辅助依据。涉及地质认识、层位划分、油气显示解释、气测解释及关键数据调整的内容，应由具备相应专业能力的技术人员复核确认。"

export async function exportReviewResultToDocx(
  result: ReviewResult,
  options?: ReviewExportOptions,
): Promise<ExportedReviewFile> {
  const wellName = options?.wellName ?? extractWellName(result.fileName)
  const fileName = sanitizeFileName(
    options?.fileName ??
      (wellName ? `${wellName}_地质录井报告审核意见.docx` : `地质录井报告审核意见_${result.taskId}.docx`),
  )
  const filePath = `${(options?.outputPath ?? ".").replace(/[\\/]$/, "")}/${fileName}`
  const buffer = await Packer.toBuffer(createReviewDocument(result, wellName))
  const { writeFile } = await import("node:fs/promises")

  await writeFile(filePath, buffer)

  return {
    filePath,
    fileName,
    wellName,
    format: "docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: buffer.byteLength,
  }
}

export async function packReviewResultToDocxBlob(
  result: ReviewResult,
  options?: Pick<ReviewExportOptions, "fileName" | "wellName">,
) {
  const wellName = options?.wellName ?? extractWellName(result.fileName)
  const fileName = sanitizeFileName(
    options?.fileName ??
      (wellName ? `${wellName}_地质录井报告审核意见.docx` : `地质录井报告审核意见_${result.taskId}.docx`),
  )
  return {
    blob: await Packer.toBlob(createReviewDocument(result, wellName)),
    fileName,
  }
}
function createReviewDocument(result: ReviewResult, wellName?: string) {
  return createCompanyReportingDocument({
    title: "地质录井报告审核意见",
    subject: "地质录井报告智能辅助审核",
    children: [
      companyTitle("地质录井报告审核意见"),
      companyHeading("一、审核基本信息"),
      infoTable(result, wellName),
      companyHeading("二、总体评价"),
      companyBodyParagraph(result.summary.conclusion),
      companyHeading("三、问题汇总"),
      companyBodyParagraph(
        `本次共发现${result.summary.totalIssues}项问题，其中高风险${result.summary.highRiskCount}项、中风险${result.summary.mediumRiskCount}项、低风险${result.summary.lowRiskCount}项。`,
      ),
      companyHeading("四、详细问题清单"),
      ...issueSections(result.issues),
      companyHeading("五、重点修改建议"),
      ...keySuggestions(result.issues),
      companyHeading("六、审核结论"),
      companyBodyParagraph(DISCLAIMER),
    ],
  })
}

function infoTable(result: ReviewResult, wellName?: string) {
  const widths = [2000, COMPANY_REPORTING_FORMAT.page.contentWidth - 2000]
  const rows = [
    ["审核文件", result.fileName],
    ["识别井号", wellName ?? "未识别"],
    ["审核时间", new Date().toLocaleString("zh-CN")],
    ["审核方式", "规则库自动检查 + 智能辅助整理"],
    ["问题总数", String(result.summary.totalIssues)],
    [
      "高/中/低风险",
      `${result.summary.highRiskCount} / ${result.summary.mediumRiskCount} / ${result.summary.lowRiskCount}`,
    ],
  ]

  return new Table({
    width: { size: COMPANY_REPORTING_FORMAT.page.contentWidth, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: widths,
    rows: rows.map(
      (row) =>
        new TableRow({
          children: [tableCell(row[0], widths[0], true), tableCell(row[1], widths[1])],
        }),
    ),
  })
}

function issueSections(issues: ReviewIssue[]) {
  if (issues.length === 0) return [companyBodyParagraph("未发现基础规则问题，建议继续进行人工专业复核。")]

  return [
    ...issueGroup(
      issues.filter((issue) => issue.severity === "高"),
      "（一）高风险问题",
    ),
    ...issueGroup(
      issues.filter((issue) => issue.severity === "中"),
      "（二）中风险问题",
    ),
    ...issueGroup(
      issues.filter((issue) => issue.severity === "低"),
      "（三）低风险问题",
    ),
  ]
}

function issueGroup(issues: ReviewIssue[], heading: string) {
  if (issues.length === 0) return []

  return [
    companyHeading(heading, 2),
    ...issues.flatMap((issue, index) => [
      companyHeading(`${index + 1}. ${issue.id} ${issue.type}`, 3),
      companyLabelParagraph("问题位置", issue.location),
      companyLabelParagraph("严重程度", SEVERITY_LABELS[issue.severity]),
      ...(issue.originalText ? [companyLabelParagraph("原文内容", issue.originalText)] : []),
      companyLabelParagraph("问题说明", issue.issue),
      companyLabelParagraph("修改建议", issue.suggestion),
      companyLabelParagraph("依据来源", issue.basis),
      companyLabelParagraph("是否需要人工确认", issue.needHumanConfirm ? "是" : "否"),
    ]),
  ]
}

function keySuggestions(issues: ReviewIssue[]) {
  const importantIssues = issues.filter((issue) => issue.severity === "高" || issue.needHumanConfirm).slice(0, 8)
  if (importantIssues.length === 0) return [companyBodyParagraph("未发现需要优先处理的高风险问题。")]
  return importantIssues.map((issue) => companyNumberedParagraph(issue.suggestion))
}

function tableCell(text: string, width: number, bold = false) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 120, right: 120, bottom: 120, left: 120 },
    children: [companyTableParagraph(text, bold)],
  })
}
