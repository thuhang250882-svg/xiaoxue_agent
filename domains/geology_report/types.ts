import type { ParsedDocument, ReviewIssue, ReviewResult } from "../../document_engine"
import type { XiaoxueAgentStateEvent, XiaoxueState } from "../../avatar/xiaoxue_pet/state"

export type ReportAgentState = Extract<XiaoxueState, "reading" | "reviewing" | "thinking" | "success" | "error">

export type ReportAgentStateEvent = XiaoxueAgentStateEvent & {
  agent: "report"
  state: ReportAgentState
}

export type GeologyReportReviewInput = {
  document: ParsedDocument
  taskId?: string
  onEvent?: (event: ReportAgentStateEvent) => void
}

export type GeologyReportReviewResult = ReviewResult

export type GeologyReportRule = {
  id: string
  type: string
  basis: string
  evaluate: (document: ParsedDocument) => ReviewIssue[]
}