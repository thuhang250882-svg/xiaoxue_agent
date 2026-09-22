import type { Part } from "@opencode-ai/sdk/v2"
import type { XiaoxueBusinessResult } from "./BusinessReviewResults"

const tools = new Set([
  "knowledge_search",
  "knowledge_manage",
  "tender_review",
  "contract_review",
  "office_artifact_preview",
  "office_document_revise",
])

export function businessResultFromPart(part: Part): XiaoxueBusinessResult | undefined {
  if (part.type !== "tool" || !tools.has(part.tool) || part.state.status !== "completed") return
  const text = part.state.output.trim()
  if (!text.startsWith("{") || !text.endsWith("}")) return
  const parsed = parseJson(text)
  if (!isRecord(parsed) || typeof parsed.type !== "string") return
  if (parsed.type === "knowledge_search_result" && Array.isArray(parsed.hits)) {
    return parsed as unknown as XiaoxueBusinessResult
  }
  if (parsed.type === "knowledge_manage_result" && Array.isArray(parsed.records)) {
    return parsed as unknown as XiaoxueBusinessResult
  }
  if (parsed.type === "tender_review_result" && Array.isArray(parsed.requirements) && isRecord(parsed.summary)) {
    return parsed as unknown as XiaoxueBusinessResult
  }
  if (parsed.type === "contract_review_result" && Array.isArray(parsed.issues) && isRecord(parsed.summary)) {
    return parsed as unknown as XiaoxueBusinessResult
  }
  if (
    parsed.type === "office_artifact_result" &&
    typeof parsed.filePath === "string" &&
    Array.isArray(parsed.paragraphs) &&
    Array.isArray(parsed.tables)
  ) {
    return normalizeArtifact(parsed) as unknown as XiaoxueBusinessResult
  }
  if (
    parsed.type === "office_revision_result" &&
    isRecord(parsed.annotated) &&
    isRecord(parsed.final) &&
    typeof parsed.sourceFileName === "string"
  ) {
    return {
      ...parsed,
      annotated: normalizeArtifact(parsed.annotated),
      final: normalizeArtifact(parsed.final),
    } as unknown as XiaoxueBusinessResult
  }
}

function normalizeArtifact(value: Record<string, unknown>) {
  return { ...value, annotations: Array.isArray(value.annotations) ? value.annotations : [] }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
