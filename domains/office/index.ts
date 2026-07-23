export type {
  OfficeTaskType,
  OfficeAgentState,
  OfficeAgentStateEvent,
  OfficeTaskInput,
  OfficeTaskResult,
  WritingStyle,
  DocumentTemplate,
  MeetingMinutes,
  ActionItem,
  WorkSummary,
  RectificationItem,
} from "./types"

export { COMPANY_WRITING_STYLE, DEFAULT_TEMPLATES, DEFAULT_STRUCTURE, getTemplate } from "./templates"
export { processOfficeTask, getWritingStyle, getDefaultStructure } from "./assistant"
export { exportOfficeTaskResultToDocx } from "./exporter"
export type { OfficeTaskDocxOptions } from "./exporter"
