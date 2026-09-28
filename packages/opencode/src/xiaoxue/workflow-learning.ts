export * as WorkflowLearning from "./workflow-learning"

import { createHash } from "node:crypto"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { XiaoxueSqlite } from "#xiaoxue-sqlite"

export type Observation = {
  sessionID: string
  directory: string
  skill: string
  steps: string[]
  completedAt: number
}

export type Candidate = {
  id: string
  projectID: string
  skill: string
  steps: string[]
  evidenceSessions: string[]
  sampleCount: number
  status: "proposed" | "approved" | "rejected" | "retired"
  version: number
  supersedes?: string
  createdAt: number
  updatedAt: number
}

const businessSkills = new Set([
  "geolog-logging-review",
  "mud-logging-report-generation",
  "office-document-revision",
  "office-assistant",
  "weekly-report",
  "daily-report",
  "oilfield-it-project-management",
  "tender-management",
  "contract-management",
])

const businessTools = new Set([
  "geology_report_review",
  "office_document",
  "office_document_revise",
  "office_artifact_preview",
  "tender_review",
  "contract_review",
])

type Row = { payload: string }

export function traceStep(name: string, input: unknown): string | undefined {
  if (name === "skill" && typeof input === "object" && input !== null && "name" in input) {
    const skill = input.name
    return typeof skill === "string" && businessSkills.has(skill) ? `skill:${skill}` : undefined
  }
  if (name === "task" && typeof input === "object" && input !== null && "subagent_type" in input) {
    const agent = input.subagent_type
    return typeof agent === "string" && ["office", "report", "document", "tender", "contract"].includes(agent)
      ? `task:${agent}`
      : undefined
  }
  return businessTools.has(name) ? name : undefined
}

export async function workflowStore(directory: string) {
  await mkdir(directory, { recursive: true })
  const db = XiaoxueSqlite.open(path.join(directory, "workflows.sqlite"))
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA busy_timeout = 5000")
  db.exec(`CREATE TABLE IF NOT EXISTS workflow_observation (
    session_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    signature TEXT NOT NULL,
    completed_at INTEGER NOT NULL
  )`)
  db.exec("CREATE INDEX IF NOT EXISTS workflow_observation_signature_idx ON workflow_observation(signature)")
  db.exec(`CREATE TABLE IF NOT EXISTS workflow_candidate (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('proposed', 'approved', 'rejected', 'retired')),
    payload TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`)
  db.exec("CREATE INDEX IF NOT EXISTS workflow_candidate_project_idx ON workflow_candidate(project_id, status, updated_at)")
  db.exec(`CREATE TABLE IF NOT EXISTS workflow_suppression (
    signature TEXT PRIMARY KEY,
    project_id TEXT NOT NULL
  )`)

  const read = (id: string): Candidate | undefined => {
    const row = db.prepare("SELECT payload FROM workflow_candidate WHERE id = ?").get(id) as Row | undefined
    return row ? (JSON.parse(row.payload) as Candidate) : undefined
  }
  const list = (projectID: string, status?: Candidate["status"]): Candidate[] =>
    (status
      ? db
          .prepare("SELECT payload FROM workflow_candidate WHERE project_id = ? AND status = ? ORDER BY updated_at DESC")
          .all(projectID, status)
      : db.prepare("SELECT payload FROM workflow_candidate WHERE project_id = ? ORDER BY updated_at DESC").all(projectID)
    ).map((row) => JSON.parse((row as Row).payload) as Candidate)

  return {
    close: () => db.close(),
    read,
    list,
    observe(input: Observation) {
      const steps = input.steps.filter((step, index, all) => step !== all[index - 1]).slice(0, 16)
      if (
        !businessSkills.has(input.skill) ||
        !steps.includes(`skill:${input.skill}`) ||
        steps.length < 2 ||
        new Set(steps).size < 2
      )
        return undefined
      if (!input.sessionID || !input.directory || !Number.isFinite(input.completedAt)) return undefined
      const projectID = projectIdentifier(input.directory)
      const signature = createHash("sha256").update(JSON.stringify([projectID, input.skill, steps])).digest("hex")
      const id = `workflow-${signature}`
      db.exec("BEGIN IMMEDIATE")
      try {
        const suppressed = db
          .prepare("SELECT signature FROM workflow_suppression WHERE signature = ? AND project_id = ?")
          .get(signature, projectID)
        if (suppressed) {
          db.exec("COMMIT")
          return undefined
        }
        const old = db
          .prepare("SELECT signature FROM workflow_observation WHERE session_id = ?")
          .get(input.sessionID) as { signature: string } | undefined
        if (old?.signature === signature) {
          db.exec("COMMIT")
          return read(id)
        }
        db.prepare(
          "INSERT INTO workflow_observation (session_id, project_id, signature, completed_at) VALUES (?, ?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET project_id = excluded.project_id, signature = excluded.signature, completed_at = excluded.completed_at",
        ).run(input.sessionID, projectID, signature, input.completedAt)
        const rows = db
          .prepare(
            "SELECT session_id FROM workflow_observation WHERE signature = ? ORDER BY completed_at DESC, session_id DESC LIMIT 3",
          )
          .all(signature) as Array<{ session_id: string }>
        const count = db
          .prepare("SELECT count(*) AS total FROM workflow_observation WHERE signature = ?")
          .get(signature) as { total: number }
        const prior = read(id)
        if (count.total < 3 || prior?.status === "rejected" || prior?.status === "retired") {
          db.exec("COMMIT")
          return prior
        }
        const now = Date.now()
        const candidate: Candidate = {
          id,
          projectID,
          skill: input.skill,
          steps: prior && prior.version > 1 ? prior.steps : steps,
          evidenceSessions: rows.map((row) => row.session_id),
          sampleCount: count.total,
          status: prior?.status ?? "proposed",
          version: prior?.version ?? 1,
          createdAt: prior?.createdAt ?? now,
          updatedAt: now,
        }
        db.prepare(
          "INSERT INTO workflow_candidate (id, project_id, status, payload, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, payload = excluded.payload, updated_at = excluded.updated_at",
        ).run(id, projectID, candidate.status, JSON.stringify(candidate), now)
        db.exec("COMMIT")
        return candidate
      } catch (error) {
        db.exec("ROLLBACK")
        throw error
      }
    },
    decide(id: string, projectID: string, decision: "approved" | "rejected" | "retired") {
      db.exec("BEGIN IMMEDIATE")
      try {
        const card = read(id)
        if (!card || card.projectID !== projectID) throw new Error("当前工作区中找不到该工作流。")
        if (card.status === decision) {
          db.exec("COMMIT")
          return card
        }
        if (card.status !== "proposed" && !(card.status === "approved" && decision === "retired"))
          throw new Error("工作流状态已变化，请重新查看候选。")
        const sample = db
          .prepare("SELECT count(*) AS total FROM workflow_observation WHERE signature = ?")
          .get(id.slice("workflow-".length)) as { total: number }
        if (decision === "approved" && sample.total < 3) throw new Error("有效任务样本不足，请重新收集。")
        const result: Candidate = { ...card, status: decision, updatedAt: Date.now() }
        db.prepare("UPDATE workflow_candidate SET status = ?, payload = ?, updated_at = ? WHERE id = ?").run(
          decision,
          JSON.stringify(result),
          result.updatedAt,
          id,
        )
        db.exec("COMMIT")
        return result
      } catch (error) {
        db.exec("ROLLBACK")
        throw error
      }
    },
    revise(id: string, projectID: string, steps: string[]) {
      if (steps.length < 2 || steps.length > 16 || steps.some((step) => !validStep(step)))
        throw new Error("步骤只能使用已登记的本地业务技能和工具，且需 2 至 16 步。")
      db.exec("BEGIN IMMEDIATE")
      try {
        const card = read(id)
        if (!card || card.projectID !== projectID || card.status !== "proposed")
          throw new Error("只能修改当前工作区的待审核工作流。")
        const now = Date.now()
        const result: Candidate = { ...card, steps, version: card.version + 1, updatedAt: now }
        db.prepare("UPDATE workflow_candidate SET payload = ?, updated_at = ? WHERE id = ? AND status = 'proposed'").run(
          JSON.stringify(result),
          now,
          id,
        )
        db.exec("COMMIT")
        return result
      } catch (error) {
        db.exec("ROLLBACK")
        throw error
      }
    },
    forget(id: string, projectID: string) {
      db.exec("BEGIN IMMEDIATE")
      try {
        const card = read(id)
        if (!card || card.projectID !== projectID) throw new Error("当前工作区中找不到该工作流。")
        const signature = id.slice("workflow-".length)
        db.prepare("DELETE FROM workflow_candidate WHERE id = ? AND project_id = ?").run(id, projectID)
        db.prepare("DELETE FROM workflow_observation WHERE signature = ? AND project_id = ?").run(signature, projectID)
        db.prepare("INSERT OR IGNORE INTO workflow_suppression (signature, project_id) VALUES (?, ?)").run(
          signature,
          projectID,
        )
        db.exec("COMMIT")
        return { id, forgotten: true }
      } catch (error) {
        db.exec("ROLLBACK")
        throw error
      }
    },
  }
}

export function projectIdentifier(directory: string) {
  return createHash("sha256").update(path.resolve(directory).toLowerCase()).digest("hex")
}

function validStep(step: string) {
  if (businessTools.has(step)) return true
  if (step.startsWith("skill:")) return businessSkills.has(step.slice(6))
  if (step.startsWith("task:")) return ["office", "report", "document", "tender", "contract"].includes(step.slice(5))
  return false
}
