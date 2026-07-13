export type BusinessTaskStatus = "running" | "completed" | "failed"

export type BusinessTask = {
  id: string
  sessionId: string
  taskType:
    | "geology_report_review"
    | "tender_review"
    | "contract_review"
    | "office_document"
    | "knowledge_query"
    | "document_generation"
  agent: string
  title: string
  status: BusinessTaskStatus
  wellName?: string
  createdAt: string
  completedAt?: string
  sourceFiles: Array<{ fileName: string; mime?: string; sourcePath?: string }>
  resultType?: string
  result?: unknown
  score?: unknown
  exportedFiles: Array<{ fileName: string; filePath: string; format: string; size?: number }>
  error?: { message: string }
}

export const BUSINESS_TASKS_METADATA_KEY = "xiaoxue_business_tasks"
const MAX_TASKS_PER_SESSION = 50

export function readBusinessTasks(metadata: Record<string, unknown> | undefined): BusinessTask[] {
  const value = metadata?.[BUSINESS_TASKS_METADATA_KEY]
  if (!Array.isArray(value)) return []
  return value.filter(isBusinessTask)
}

export function upsertBusinessTask(metadata: Record<string, unknown> | undefined, task: BusinessTask) {
  return {
    ...metadata,
    [BUSINESS_TASKS_METADATA_KEY]: [task, ...readBusinessTasks(metadata).filter((item) => item.id !== task.id)]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, MAX_TASKS_PER_SESSION),
  }
}

export function removeBusinessTask(metadata: Record<string, unknown> | undefined, taskID: string) {
  return {
    ...metadata,
    [BUSINESS_TASKS_METADATA_KEY]: readBusinessTasks(metadata).filter((item) => item.id !== taskID),
  }
}

function isBusinessTask(value: unknown): value is BusinessTask {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const task = value as Record<string, unknown>
  return (
    typeof task.id === "string" &&
    typeof task.sessionId === "string" &&
    typeof task.taskType === "string" &&
    typeof task.agent === "string" &&
    typeof task.title === "string" &&
    typeof task.status === "string" &&
    typeof task.createdAt === "string" &&
    Array.isArray(task.sourceFiles) &&
    Array.isArray(task.exportedFiles)
  )
}