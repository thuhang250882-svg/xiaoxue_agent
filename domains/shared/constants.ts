import type { ReviewSeverity } from "../../document_engine"

export const SEVERITY_ORDER: Record<ReviewSeverity, number> = {
  高: 3,
  中: 2,
  低: 1,
}

export const SEVERITY_LABELS: Record<ReviewSeverity, string> = {
  高: "高风险",
  中: "中风险",
  低: "低风险",
}

export const AGENT_IDS = ["report", "office", "knowledge", "xiaoxue"] as const

export type AgentId = (typeof AGENT_IDS)[number]