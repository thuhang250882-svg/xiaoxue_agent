import type { ParsedDocument } from "../../document_engine"

export type OfficeTaskType =
  | "work_summary"
  | "work_report"
  | "meeting_minutes"
  | "rectification_list"
  | "work_plan"
  | "technical_plan"
  | "project_application"
  | "document_polish"
  | "table_summary"

export type OfficeAgentState = "idle" | "listen" | "reading" | "writing" | "thinking" | "searching" | "success" | "error"

export type OfficeAgentStateEvent = {
  event: "agent_state_changed"
  agent: "office"
  state: OfficeAgentState
  message: string
}

export type OfficeTaskInput = {
  taskType: OfficeTaskType
  document?: ParsedDocument
  context?: Record<string, unknown>
  onEvent?: (event: OfficeAgentStateEvent) => void
}

export type OfficeTaskResult = {
  taskId: string
  taskType: OfficeTaskType
  content: string
  metadata?: Record<string, unknown>
}

export type WritingStyle = {
  tone: string
  preference: string[]
}

export type DocumentTemplate = {
  id: string
  name: string
  sections: string[]
  style: WritingStyle
}

export type MeetingMinutes = {
  title: string
  date: string
  attendees: string[]
  agenda: string[]
  decisions: string[]
  actionItems: ActionItem[]
}

export type ActionItem = {
  id: string
  task: string
  owner: string
  deadline?: string
  status: "pending" | "in_progress" | "completed"
}

export type WorkSummary = {
  period: string
  highlights: string[]
  challenges: string[]
  nextSteps: string[]
  metrics?: Record<string, string | number>
}

export type RectificationItem = {
  id: string
  issue: string
  responsibleUnit: string
  deadline: string
  measures: string
  status: "pending" | "in_progress" | "completed" | "verified"
}
