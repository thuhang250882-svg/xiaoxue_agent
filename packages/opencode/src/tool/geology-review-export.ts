import { Global } from "@opencode-ai/core/global"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { exportReviewResultToDocx } from "../../../../document_engine"
import type { ReviewResult } from "../../../../document_engine"

export async function exportPersistedGeologyReview(result: unknown) {
  if (!isReviewResult(result)) throw new Error("Invalid persisted ReviewResult")
  const outputPath = path.join(Global.Path.data, "exports", "geology-report")
  await mkdir(outputPath, { recursive: true })
  return exportReviewResultToDocx(result, { outputPath })
}

export function isReviewResult(value: unknown): value is ReviewResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const result = value as Record<string, unknown>
  return typeof result.taskId === "string" && typeof result.fileName === "string" && Array.isArray(result.issues)
}