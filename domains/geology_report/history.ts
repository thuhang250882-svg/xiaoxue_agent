import type { ReviewResult } from "../../document_engine"

export type ReviewHistoryItem = {
  id: string
  taskId: string
  fileName: string
  wellName?: string
  createdAt: string
  issueCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  resultPath?: string
  exportedHtmlPath?: string
  exportedDocxPath?: string
}

const historyStore: Map<string, ReviewHistoryItem> = new Map()
const resultStore: Map<string, ReviewResult> = new Map()

/** 最大历史记录条数，超过后自动淘汰最旧记录 */
const MAX_HISTORY_SIZE = 200

/** 淘汰超过上限的最旧记录 */
function evictIfFull() {
  if (historyStore.size <= MAX_HISTORY_SIZE) return
  const sorted = Array.from(historyStore.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
  const toRemove = sorted.slice(0, historyStore.size - MAX_HISTORY_SIZE)
  for (const item of toRemove) {
    historyStore.delete(item.taskId)
    resultStore.delete(item.taskId)
  }
}

function extractWellNameFromFileName(fileName: string): string | undefined {
  return fileName.match(/([\u4e00-\u9fa5A-Za-z0-9-]{1,24}井)/)?.[1]
}

export function saveReviewHistory(
  result: ReviewResult,
  options?: { exportedHtmlPath?: string; exportedDocxPath?: string; resultPath?: string },
): ReviewHistoryItem {
  const item: ReviewHistoryItem = {
    id: `history-${result.taskId}`,
    taskId: result.taskId,
    fileName: result.fileName,
    wellName: extractWellNameFromFileName(result.fileName),
    createdAt: new Date().toISOString(),
    issueCount: result.summary.totalIssues,
    highCount: result.summary.highRiskCount,
    mediumCount: result.summary.mediumRiskCount,
    lowCount: result.summary.lowRiskCount,
    resultPath: options?.resultPath,
    exportedHtmlPath: options?.exportedHtmlPath,
    exportedDocxPath: options?.exportedDocxPath,
  }
  historyStore.set(item.taskId, item)
  resultStore.set(item.taskId, result)
  evictIfFull()
  return item
}

export function listReviewHistory(limit = 50): ReviewHistoryItem[] {
  return Array.from(historyStore.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit)
}

export function getReviewHistory(taskId: string): ReviewHistoryItem | null {
  return historyStore.get(taskId) ?? null
}

export function getReviewResult(taskId: string): ReviewResult | null {
  return resultStore.get(taskId) ?? null
}

export function deleteReviewHistory(taskId: string): boolean {
  resultStore.delete(taskId)
  return historyStore.delete(taskId)
}

export function clearHistory(): void {
  historyStore.clear()
  resultStore.clear()
}

export function getHistoryCount(): number {
  return historyStore.size
}