import { Packer } from "docx"
import {
  companyBodyParagraph,
  companyHeading,
  companyLabelParagraph,
  companyNumberedParagraph,
  companyTitle,
  createCompanyReportingDocument,
} from "../templates"
import { sanitizeFileName } from "./review_html_exporter"

export type BusinessReviewDocument = {
  title: string
  subject: string
  fileName: string
  info: Array<[string, string]>
  summary: string
  issues: Array<{
    id: string
    category: string
    location: string
    severity: "high" | "medium" | "low"
    originalText: string
    issue: string
    suggestion: string
    basis?: string
  }>
  disclaimer: string
}

export async function exportBusinessReviewToDocx(input: BusinessReviewDocument, outputPath = ".") {
  const fileName = sanitizeFileName(input.fileName.endsWith(".docx") ? input.fileName : `${input.fileName}.docx`)
  const filePath = `${outputPath.replace(/[\\/]$/, "")}/${fileName}`
  const document = createCompanyReportingDocument({
    title: input.title,
    subject: input.subject,
    children: [
      companyTitle(input.title),
      companyHeading("一、审核基本信息"),
      ...input.info.map(([label, value]) => companyLabelParagraph(label, value)),
      companyHeading("二、总体评价"),
      companyBodyParagraph(input.summary),
      companyHeading("三、详细问题清单"),
      ...issueSections(input.issues),
      companyHeading("四、重点处理建议"),
      ...keySuggestions(input.issues),
      companyHeading("五、审核说明"),
      companyBodyParagraph(input.disclaimer),
    ],
  })
  const buffer = await Packer.toBuffer(document)
  const { writeFile } = await import("node:fs/promises")
  await writeFile(filePath, buffer)
  return {
    filePath,
    fileName,
    format: "docx" as const,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: buffer.byteLength,
  }
}

function issueSections(issues: BusinessReviewDocument["issues"]) {
  if (!issues.length) return [companyBodyParagraph("未发现结构化问题，仍建议由专业人员复核原始文件。")]
  return (["high", "medium", "low"] as const).flatMap((severity) => {
    const selected = issues.filter((issue) => issue.severity === severity)
    if (!selected.length) return []
    const label = { high: "高风险", medium: "中风险", low: "低风险" }[severity]
    return [
      companyHeading(label, 2),
      ...selected.flatMap((issue, index) => [
        companyHeading(`${index + 1}. ${issue.id} ${issue.category}`, 3),
        companyLabelParagraph("位置", issue.location),
        companyLabelParagraph("原文", issue.originalText || "未识别到对应原文"),
        companyLabelParagraph("问题", issue.issue),
        companyLabelParagraph("建议", issue.suggestion),
        ...(issue.basis ? [companyLabelParagraph("依据", issue.basis)] : []),
      ]),
    ]
  })
}

function keySuggestions(issues: BusinessReviewDocument["issues"]) {
  const selected = issues.filter((issue) => issue.severity === "high").slice(0, 10)
  if (!selected.length) return [companyBodyParagraph("未发现需要优先处理的高风险事项。")]
  return selected.map((issue) => companyNumberedParagraph(issue.suggestion))
}
