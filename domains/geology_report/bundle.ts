import { createReviewResult, extractWellBasicInfo } from "../../document_engine"
import type { ParsedDocument, ReviewIssue, ReviewResult } from "../../document_engine"
import { saveReviewHistory } from "./history"
import { reviewGeologyReportRulesAsync } from "./rule_engine"

export type ReviewBundle = {
  primaryReport: ParsedDocument
  attachments: ParsedDocument[]
}

export async function reviewGeologyReportBundle(input: {
  bundle: ReviewBundle
  taskId?: string
  rulePaths?: string[]
}): Promise<ReviewResult> {
  const issues = [
    ...(await reviewGeologyReportRulesAsync(input.bundle.primaryReport, input.rulePaths)),
    ...reviewBundleConsistency(input.bundle),
  ]
  const result = createReviewResult({
    taskId: input.taskId,
    fileName: input.bundle.primaryReport.fileName,
    issues,
  })
  saveReviewHistory(result)
  return result
}

function reviewBundleConsistency(bundle: ReviewBundle): ReviewIssue[] {
  const documents = [bundle.primaryReport, ...bundle.attachments]
  const identified = documents
    .map((document) => ({ document, wellName: extractWellBasicInfo(document).wellName }))
    .filter((item): item is { document: ParsedDocument; wellName: string } => Boolean(item.wellName))
  const wellNames = [...new Set(identified.map((item) => item.wellName))]
  if (wellNames.length < 2) return []

  return [
    {
      id: "BUNDLE-WELL-001",
      type: "多资料井号一致性",
      location: identified.map((item) => item.document.fileName).join("、"),
      originalText: identified.map((item) => `${item.document.fileName}：${item.wellName}`).join("；"),
      issue: `本次审核资料中识别出多个不同井号：${wellNames.join("、")}。`,
      severity: "高",
      suggestion: "请核对主报告及各附表所属井号，确认上传资料属于同一口井后再进行专业审核。",
      basis: "多文件井基础信息一致性规则，需人工复核",
      needHumanConfirm: true,
    },
  ]
}