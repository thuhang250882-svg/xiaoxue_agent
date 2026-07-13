import type { Part } from "@opencode-ai/sdk/v2"
import type { XiaoxueBusinessResult } from "./BusinessReviewResults"

const tools = new Set(["knowledge_search", "knowledge_manage", "tender_review", "contract_review"])

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
