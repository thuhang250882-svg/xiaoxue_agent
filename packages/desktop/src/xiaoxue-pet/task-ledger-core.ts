export type PendingPetTask = { taskId: string; prompt: string; agent: string; autoSubmit: boolean }

type Database = {
  exec(sql: string): unknown
  prepare(sql: string): {
    run(...values: unknown[]): unknown
    get(...values: unknown[]): unknown
    all(...values: unknown[]): unknown[]
  }
}

type Status = "pending" | "running" | "succeeded" | "failed" | "cancelled"

export function initialize(db: Database) {
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA busy_timeout = 5000")
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_ledger (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      input TEXT,
      output TEXT,
      error TEXT,
      request_id TEXT UNIQUE,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS task_ledger_status_idx ON task_ledger(status, updated_at);
  `)
}

export function create(db: Database, task: PendingPetTask) {
  const now = Date.now()
  db.prepare(`
    INSERT INTO task_ledger
      (id, session_id, project_id, kind, status, input, output, error, request_id, attempts, created_at, updated_at)
    VALUES (?, '', '', 'xiaoxue-pet', 'pending', ?, NULL, NULL, ?, 0, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = 'pending',
      input = excluded.input,
      error = NULL,
      updated_at = excluded.updated_at
  `).run(task.taskId, JSON.stringify(task), task.taskId, now, now)
}

export function recover(db: Database) {
  const rows = db
    .prepare(`
      SELECT id, input, status
      FROM task_ledger
      WHERE kind = 'xiaoxue-pet' AND status IN ('pending', 'running')
      ORDER BY updated_at DESC
    `)
    .all()
    .filter(isTaskRow)
  if (rows.length === 0) return undefined

  const latest = rows[0]
  const now = Date.now()
  // 崩溃前积压的旧任务无法全部补投，统一标记为 cancelled，避免僵尸记录永远残留
  for (const stale of rows.slice(1)) {
    db.prepare("UPDATE task_ledger SET status = 'cancelled', error = ?, updated_at = ? WHERE id = ?").run(
      "应用重启后仅恢复最新任务，该任务已被取消",
      now,
      stale.id,
    )
  }

  const task = parseTask(latest.input)
  if (!task) {
    db.prepare("UPDATE task_ledger SET status = 'cancelled', error = ?, updated_at = ? WHERE id = ?").run(
      "任务记录无法解析，已取消",
      now,
      latest.id,
    )
    return undefined
  }
  if (latest.status === "running") {
    db.prepare("UPDATE task_ledger SET status = 'pending', error = ?, updated_at = ? WHERE id = ?").run(
      "应用重启后恢复投递",
      now,
      latest.id,
    )
  }
  return task
}

export function delivered(db: Database, taskId: string) {
  update(db, taskId, "pending", true)
}

export function running(db: Database, taskId: string) {
  update(db, taskId, "running")
}

export function result(
  db: Database,
  taskId: string,
  input: { success: boolean; partial?: boolean; answer?: string; error?: string },
) {
  const status: Status = input.success ? (input.partial ? "running" : "succeeded") : "failed"
  db.prepare(`
    UPDATE task_ledger
    SET status = ?, output = COALESCE(?, output), error = ?, updated_at = ?
    WHERE id = ? AND kind = 'xiaoxue-pet'
  `).run(status, input.answer ? JSON.stringify({ answer: input.answer }) : null, input.error ?? null, Date.now(), taskId)
}

export function prune(db: Database, cutoff: number) {
  db.prepare(`
    DELETE FROM task_ledger
    WHERE kind = 'xiaoxue-pet'
      AND status IN ('succeeded', 'failed', 'cancelled')
      AND updated_at < ?
  `).run(cutoff)
}

function update(db: Database, taskId: string, status: Status, incrementAttempts = false) {
  db.prepare(`
    UPDATE task_ledger
    SET status = ?, attempts = attempts + ?, updated_at = ?
    WHERE id = ? AND kind = 'xiaoxue-pet'
  `).run(status, incrementAttempts ? 1 : 0, Date.now(), taskId)
}

function parseTask(value: string) {
  const task = (() => {
    try {
      return JSON.parse(value) as unknown
    } catch {
      return undefined
    }
  })()
  if (!isPendingTask(task)) return undefined
  return task
}

function isTaskRow(value: unknown): value is { id: string; input: string; status: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "input" in value &&
    typeof value.input === "string" &&
    "status" in value &&
    typeof value.status === "string"
  )
}

export function isPendingTask(value: unknown): value is PendingPetTask {
  return (
    typeof value === "object" &&
    value !== null &&
    "taskId" in value &&
    typeof value.taskId === "string" &&
    "prompt" in value &&
    typeof value.prompt === "string" &&
    "agent" in value &&
    typeof value.agent === "string" &&
    "autoSubmit" in value &&
    typeof value.autoSubmit === "boolean"
  )
}
