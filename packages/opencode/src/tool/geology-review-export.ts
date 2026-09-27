import { mkdir } from "node:fs/promises"
import { exportReviewResultToDocx } from "../../../../document_engine"
import type { ReviewResult } from "../../../../document_engine"

export async function exportPersistedGeologyReview(result: unknown, outputPath: string) {
  if (!isReviewResult(result)) throw new Error("Invalid persisted ReviewResult")
  await mkdir(outputPath, { recursive: true })
  return exportReviewResultToDocx(result, {
    outputPath,
    fileName: `${result.fileName.replace(/\.[^.]+$/, "")}_审核意见_${result.taskId}.docx`,
  })
}

export function isReviewResult(value: unknown): value is ReviewResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const result = value as Record<string, unknown>
  return typeof result.taskId === "string" && typeof result.fileName === "string" && Array.isArray(result.issues)
}
