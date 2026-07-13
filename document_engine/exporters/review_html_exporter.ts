import type { ReviewIssue, ReviewResult } from "../review_result"
import { SEVERITY_LABELS } from "../../domains/shared/constants"

export type ReviewExportOptions = {
  outputPath?: string
  fileName?: string
  wellName?: string
}

export type ExportedReviewFile = {
  filePath: string
  fileName: string
  wellName?: string
  format: "html" | "docx"
  mimeType: string
  size: number
}

export async function exportReviewResultToHtml(
  result: ReviewResult,
  options?: ReviewExportOptions,
): Promise<ExportedReviewFile> {
  const wellName = options?.wellName ?? extractWellName(result.fileName)
  const fileName = sanitizeFileName(
    options?.fileName ?? (wellName ? `${wellName}_地质录井报告审核意见.html` : `地质录井报告审核意见_${result.taskId}.html`),
  )
  const outputPath = options?.outputPath ?? "."
  const filePath = `${outputPath.replace(/[\\/]$/, "")}/${fileName}`
  const html = generateHtml(result, wellName)

  await Bun.write(filePath, html)

  return {
    filePath,
    fileName,
    wellName,
    format: "html",
    mimeType: "text/html;charset=utf-8",
    size: new TextEncoder().encode(html).byteLength,
  }
}

export function extractWellName(fileName: string): string | undefined {
  const match = fileName.match(/([\u4e00-\u9fa5A-Za-z0-9-]{1,24}井)/)
  const ignored = ["定向井", "水平井", "直井", "斜井", "评价井", "探井", "开发井", "丛式井", "调整井", "生产井"]
  if (!match || ignored.includes(match[1])) return
  return match[1]
}

export function sanitizeFileName(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
}

function generateHtml(result: ReviewResult, wellName?: string): string {
  const now = new Date().toLocaleString("zh-CN")
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>地质录井报告审核意见</title>
  <style>
    body { font-family: "Microsoft YaHei", Arial, sans-serif; line-height: 1.65; color: #1f2937; margin: 32px; }
    h1 { text-align: center; font-size: 22px; margin-bottom: 24px; }
    h2 { font-size: 16px; margin-top: 24px; padding-bottom: 6px; border-bottom: 1px solid #d1d5db; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { border: 1px solid #d1d5db; padding: 8px; vertical-align: top; font-size: 13px; }
    th { background: #f3f4f6; }
    .issue { border: 1px solid #d1d5db; padding: 12px; margin: 12px 0; }
    .muted { color: #6b7280; }
    .risk-high { color: #b91c1c; font-weight: 600; }
    .risk-medium { color: #92400e; font-weight: 600; }
    .risk-low { color: #374151; font-weight: 600; }
  </style>
</head>
<body>
  <h1>地质录井报告审核意见</h1>
  <h2>一、审核概况</h2>
  <table>
    <tbody>
      <tr><th>审核文件</th><td>${escapeHtml(result.fileName)}</td></tr>
      <tr><th>审核时间</th><td>${escapeHtml(now)}</td></tr>
      <tr><th>识别井号</th><td>${escapeHtml(wellName ?? "未识别")}</td></tr>
      <tr><th>问题总数</th><td>${result.summary.totalIssues}</td></tr>
      <tr><th>高/中/低风险</th><td>${result.summary.highRiskCount} / ${result.summary.mediumRiskCount} / ${result.summary.lowRiskCount}</td></tr>
    </tbody>
  </table>
  <h2>二、总体评价</h2>
  <p>${escapeHtml(result.summary.conclusion)}</p>
  <h2>三、问题清单</h2>
  ${result.issues.length === 0 ? "<p>未发现基础规则问题，建议继续进行人工专业复核。</p>" : result.issues.map(renderIssue).join("\n")}
  <h2>四、审核结论</h2>
  <p>本审核结果为智能辅助审核结果，涉及地质认识、解释结论和关键数据调整的内容，应由专业技术人员复核确认。</p>
</body>
</html>`
}

function renderIssue(issue: ReviewIssue, index: number): string {
  return `<section class="issue">
  <h3>问题 ${index + 1}: ${escapeHtml(issue.id)}</h3>
  <p><strong>问题类型：</strong>${escapeHtml(issue.type)}</p>
  <p><strong>问题位置：</strong>${escapeHtml(issue.location)}</p>
  <p><strong>严重程度：</strong><span class="${severityClass(issue.severity)}">${escapeHtml(SEVERITY_LABELS[issue.severity])}</span></p>
  ${issue.originalText ? `<p><strong>原文内容：</strong>${escapeHtml(issue.originalText)}</p>` : ""}
  <p><strong>问题说明：</strong>${escapeHtml(issue.issue)}</p>
  <p><strong>修改建议：</strong>${escapeHtml(issue.suggestion)}</p>
  <p><strong>依据来源：</strong>${escapeHtml(issue.basis)}</p>
  <p><strong>是否需要人工确认：</strong>${issue.needHumanConfirm ? "是" : "否"}</p>
</section>`
}

function severityClass(severity: ReviewIssue["severity"]) {
  if (severity === "高") return "risk-high"
  if (severity === "中") return "risk-medium"
  return "risk-low"
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}