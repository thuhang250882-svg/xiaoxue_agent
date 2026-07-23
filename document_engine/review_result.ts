export type ReviewSeverity = "高" | "中" | "低"

export type ReviewIssue = {
  id: string
  type: string
  location: string
  originalText: string
  issue: string
  severity: ReviewSeverity
  suggestion: string
  basis: string
  needHumanConfirm: boolean
  sources?: Array<{
    sourceId: string
    title: string
    category: string
    section?: string
    page?: number
  }>
}

export type ReviewSummary = {
  totalIssues: number
  highRiskCount: number
  mediumRiskCount: number
  lowRiskCount: number
  conclusion: string
}

export type ReviewResult = {
  taskId: string
  fileName: string
  summary: ReviewSummary
  issues: ReviewIssue[]
}

export function summarizeIssues(issues: ReviewIssue[]): ReviewSummary {
  const highRiskCount = issues.filter((issue) => issue.severity === "高").length
  const mediumRiskCount = issues.filter((issue) => issue.severity === "中").length
  const lowRiskCount = issues.filter((issue) => issue.severity === "低").length
  const conclusion =
    issues.length === 0
      ? "未发现基础规则问题，建议继续进行人工专业复核。"
      : `发现 ${issues.length} 项基础规则问题，其中高风险 ${highRiskCount} 项、中风险 ${mediumRiskCount} 项、低风险 ${lowRiskCount} 项。`
  return { totalIssues: issues.length, highRiskCount, mediumRiskCount, lowRiskCount, conclusion }
}

export function createReviewResult(input: { taskId?: string; fileName: string; issues: ReviewIssue[] }): ReviewResult {
  return {
    taskId: input.taskId ?? `review-${Date.now()}`,
    fileName: input.fileName,
    summary: summarizeIssues(input.issues),
    issues: input.issues,
  }
}