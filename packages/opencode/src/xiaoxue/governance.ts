export * as XiaoxueGovernance from "./governance"

import { Global } from "@opencode-ai/core/global"
import { Database } from "bun:sqlite"
import { mkdir } from "node:fs/promises"
import path from "node:path"

export type TaskStatus =
  | "pending"
  | "running"
  | "waiting_approval"
  | "succeeded"
  | "failed"
  | "cancelled"

export async function recordTask(input: {
  id: string
  sessionID: string
  projectID?: string
  status: TaskStatus
  kind: string
  input?: unknown
  output?: unknown
  error?: string
  requestID?: string
}) {
  const db = await store()
  const now = Date.now()
  db.query(`
    INSERT INTO task_ledger (id, session_id, project_id, kind, status, input, output, error, request_id, attempts, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      output = COALESCE(excluded.output, task_ledger.output),
      error = excluded.error,
      attempts = task_ledger.attempts + CASE WHEN excluded.status = 'running' THEN 1 ELSE 0 END,
      updated_at = excluded.updated_at
  `).run(
    input.id,
    input.sessionID,
    input.projectID ?? "",
    input.kind,
    input.status,
    safeJSON(input.input),
    safeJSON(input.output),
    input.error ?? null,
    input.requestID ?? null,
    now,
    now,
  )
  db.close()
}

export async function audit(input: {
  action: string
  resource: string
  outcome: "allowed" | "denied" | "succeeded" | "failed"
  actor?: string
  sessionID?: string
  projectID?: string
  metadata?: unknown
}) {
  const db = await store()
  const transaction = db.transaction(() => {
    const previous =
      db.query<{ hash: string }, []>("SELECT hash FROM audit_event ORDER BY sequence DESC LIMIT 1").get()?.hash ?? ""
    const timestamp = Date.now()
    const metadata = safeJSON(input.metadata)
    const payload = JSON.stringify({
      timestamp,
      actor: input.actor ?? "xiaoxue",
      action: input.action,
      resource: input.resource,
      outcome: input.outcome,
      sessionID: input.sessionID ?? "",
      projectID: input.projectID ?? "",
      metadata,
      previous,
    })
    const hash = new Bun.CryptoHasher("sha256").update(payload).digest("hex")
    db.query(`
      INSERT INTO audit_event
        (id, timestamp, actor, action, resource, outcome, session_id, project_id, metadata, previous_hash, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      timestamp,
      input.actor ?? "xiaoxue",
      input.action,
      input.resource,
      input.outcome,
      input.sessionID ?? "",
      input.projectID ?? "",
      metadata,
      previous,
      hash,
    )
  })
  transaction.immediate()
  db.close()
}

export async function auditIntegrity() {
  const db = await store()
  const rows = db
    .query<{
      timestamp: number
      actor: string
      action: string
      resource: string
      outcome: string
      session_id: string
      project_id: string
      metadata: string
      previous_hash: string
      hash: string
    }, []>("SELECT * FROM audit_event ORDER BY sequence")
    .all()
  db.close()
  const valid = rows.every((row, index) => {
    const previous = rows[index - 1]?.hash ?? ""
    if (row.previous_hash !== previous) return false
    const payload = JSON.stringify({
      timestamp: row.timestamp,
      actor: row.actor,
      action: row.action,
      resource: row.resource,
      outcome: row.outcome,
      sessionID: row.session_id,
      projectID: row.project_id,
      metadata: row.metadata,
      previous,
    })
    return new Bun.CryptoHasher("sha256").update(payload).digest("hex") === row.hash
  })
  return { valid, count: rows.length }
}

async function store() {
  const configured = process.env.XIAOXUE_GOVERNANCE_DB?.trim()
  const destination = configured && path.isAbsolute(configured) ? configured : path.join(Global.Path.data, "xiaoxue", "governance.sqlite")
  const directory = path.dirname(destination)
  await mkdir(directory, { recursive: true })
  const db = new Database(destination, { create: true })
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
    CREATE TABLE IF NOT EXISTS audit_event (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      timestamp INTEGER NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      outcome TEXT NOT NULL,
      session_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      metadata TEXT,
      previous_hash TEXT NOT NULL,
      hash TEXT NOT NULL UNIQUE
    );
  `)
  return db
}

function safeJSON(value: unknown) {
  if (value === undefined) return null
  return JSON.stringify(value).replace(
    /("(?:authorization|api.?key|access.?token|refresh.?token|password|secret)"\s*:\s*)"[^"]*"/gi,
    '$1"<REDACTED>"',
  )
}
