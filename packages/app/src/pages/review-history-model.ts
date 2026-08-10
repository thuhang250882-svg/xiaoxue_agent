export const BUSINESS_TASKS_METADATA_KEY = "xiaoxue_business_tasks"

export type BusinessTask = {
  id: string
  sessionId: string
  taskType: string
  agent: string
  title: string
  status: "running" | "completed" | "failed"
  wellName?: string
  createdAt: string
  completedAt?: string
  sourceFiles: Array<{
    fileName: string
    mime?: string
    sourcePath?: string
    size?: number
    modifiedAt?: number
    sha256?: string
  }>
  resultType?: string
  result?: unknown
  score?: unknown
  exportedFiles: Array<{ fileName: string; filePath: string; format: string; size?: number }>
  error?: { message: string }
}

export type HistoryRecord = { task: BusinessTask; metadata: Record<string, unknown> }

type SessionPage = {
  data?: ReadonlyArray<{ metadata?: Record<string, unknown> }>
  cursor?: string
}

type SessionQuery = {
  roots: true
  limit: number
  cursor?: number
}

export async function loadReviewHistory(list: (query: SessionQuery) => Promise<SessionPage>) {
  const records: HistoryRecord[] = []
  let cursor: number | undefined

  do {
    const page = await list({ roots: true, limit: 200, cursor })
    records.push(
      ...(page.data ?? []).flatMap((session) =>
        readBusinessTasks(session.metadata)
          .filter((task) => task.status !== "failed")
          .map((task) => ({
            task,
            metadata: session.metadata ?? {},
          })),
      ),
    )
    const next = page.cursor ? Number(page.cursor) : undefined
    cursor = Number.isFinite(next) && next !== cursor ? next : undefined
  } while (cursor !== undefined && records.length < 50)

  return records.sort((a, b) => Date.parse(b.task.createdAt) - Date.parse(a.task.createdAt)).slice(0, 50)
}

export function readBusinessTasks(metadata: unknown): BusinessTask[] {
  if (!isRecord(metadata)) return []
  const tasks = metadata[BUSINESS_TASKS_METADATA_KEY]
  if (!Array.isArray(tasks)) return []
  return tasks.filter(isBusinessTask)
}

function isBusinessTask(value: unknown): value is BusinessTask {
  if (!isRecord(value)) return false
  return (
    typeof value.id === "string" &&
    typeof value.sessionId === "string" &&
    typeof value.taskType === "string" &&
    typeof value.title === "string" &&
    typeof value.status === "string" &&
    typeof value.createdAt === "string" &&
    Array.isArray(value.sourceFiles) &&
    Array.isArray(value.exportedFiles)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
