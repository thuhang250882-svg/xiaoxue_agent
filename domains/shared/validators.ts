import { z } from "zod"

export const ReviewSeveritySchema = z.enum(["高", "中", "低"])

export const ReviewIssueSchema = z.object({
  id: z.string(),
  type: z.string(),
  location: z.string(),
  originalText: z.string(),
  issue: z.string(),
  severity: ReviewSeveritySchema,
  suggestion: z.string(),
  basis: z.string(),
  needHumanConfirm: z.boolean(),
})

export const ReviewSummarySchema = z.object({
  totalIssues: z.number().int().nonnegative(),
  highRiskCount: z.number().int().nonnegative(),
  mediumRiskCount: z.number().int().nonnegative(),
  lowRiskCount: z.number().int().nonnegative(),
  conclusion: z.string(),
})

export const ReviewResultSchema = z.object({
  taskId: z.string(),
  fileName: z.string(),
  summary: ReviewSummarySchema,
  issues: z.array(ReviewIssueSchema),
})

export const DocumentParagraphSchema = z.object({
  index: z.number().int().positive(),
  text: z.string(),
  location: z.string().optional(),
})

export const DocumentTableSchema = z.object({
  index: z.number().int().positive(),
  rows: z.array(z.array(z.string())),
  location: z.string().optional(),
  caption: z.string().optional(),
})

export const SupportedDocumentTypeSchema = z.enum(["docx", "xlsx", "pdf", "txt", "csv", "unknown"])

export const ParsedDocumentSchema = z.object({
  fileId: z.string(),
  fileName: z.string(),
  fileType: SupportedDocumentTypeSchema,
  rawText: z.string(),
  paragraphs: z.array(DocumentParagraphSchema),
  tables: z.array(DocumentTableSchema),
  metadata: z.record(z.string(), z.unknown()),
})

export const DocumentParseInputSchema = z.object({
  fileId: z.string().optional(),
  fileName: z.string(),
  content: z.union([z.string(), z.instanceof(ArrayBuffer), z.instanceof(Uint8Array)]),
  mimeType: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const ReportAgentStateSchema = z.enum(["reading", "reviewing", "thinking", "success", "error"])
export const OfficeAgentStateSchema = z.enum(["idle", "reading", "writing", "thinking", "searching", "success", "error"])
export const XiaoxueStateSchema = z.enum([
  "idle",
  "listen",
  "thinking",
  "searching",
  "reading",
  "writing",
  "reviewing",
  "success",
  "celebrate",
  "warning",
  "error",
])

export const AgentStateEventSchema = z.object({
  event: z.literal("agent_state_changed"),
  agent: z.enum(["report", "office", "knowledge", "xiaoxue"]),
  state: z.string(),
  message: z.string(),
  timestamp: z.number().optional(),
})

export const OfficeTaskTypeSchema = z.enum(["work_summary", "meeting_minutes", "rectification_list", "document_polish"])

export const ActionItemSchema = z.object({
  id: z.string(),
  task: z.string(),
  owner: z.string(),
  deadline: z.string().optional(),
  status: z.enum(["pending", "in_progress", "completed"]),
})

export const MeetingMinutesSchema = z.object({
  title: z.string(),
  date: z.string(),
  attendees: z.array(z.string()),
  agenda: z.array(z.string()),
  decisions: z.array(z.string()),
  actionItems: z.array(ActionItemSchema),
})

export const RectificationItemSchema = z.object({
  id: z.string(),
  issue: z.string(),
  responsibleUnit: z.string(),
  deadline: z.string(),
  measures: z.string(),
  status: z.enum(["pending", "in_progress", "completed", "verified"]),
})

export function validateReviewIssue(data: unknown) {
  return ReviewIssueSchema.safeParse(data)
}

export function validateReviewResult(data: unknown) {
  return ReviewResultSchema.safeParse(data)
}

export function validateParsedDocument(data: unknown) {
  return ParsedDocumentSchema.safeParse(data)
}

export function validateDocumentParseInput(data: unknown) {
  return DocumentParseInputSchema.safeParse(data)
}