import { createReviewResult } from "../../document_engine"
import type { GeologyReportReviewInput, ReportAgentState, ReportAgentStateEvent } from "./types"
import { REPORT_AGENT_STATE_MESSAGES } from "./prompt"
import { reviewGeologyReportRulesAsync } from "./rule_engine"
import { ReviewError } from "../shared"
import { saveReviewHistory } from "./history"

export async function reviewGeologyReport(input: GeologyReportReviewInput & { rulePaths?: string[] }) {
  try {
    emit(input, "reading")
    emit(input, "reviewing")
    const issues = await reviewGeologyReportRulesAsync(input.document, input.rulePaths)
    emit(input, "thinking")
    const result = createReviewResult({ taskId: input.taskId, fileName: input.document.fileName, issues })
    saveReviewHistory(result)
    emit(input, "success")
    return result
  } catch (error) {
    emit(input, "error", error instanceof Error ? error.message : "未知错误")
    if (error instanceof ReviewError) throw error
    throw new ReviewError(error instanceof Error ? error.message : "报告审核失败", "RULE_ERROR", error)
  }
}

export const reviewGeologyReportAsync = reviewGeologyReport

function emit(input: GeologyReportReviewInput, state: ReportAgentState, errorMessage?: string) {
  const event: ReportAgentStateEvent = {
    event: "agent_state_changed",
    agent: "report",
    state,
    message: state === "error" && errorMessage ? errorMessage : REPORT_AGENT_STATE_MESSAGES[state],
  }
  input.onEvent?.(event)
}