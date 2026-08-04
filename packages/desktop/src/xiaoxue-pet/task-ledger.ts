export type { PendingPetTask } from "./task-ledger-core"

import { DatabaseSync } from "node:sqlite"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { enterprisePolicy } from "../main/enterprise-policy"
import { governanceDatabasePath } from "../main/governance-database"
import { create, delivered, initialize, prune, recover, result, running, type PendingPetTask } from "./task-ledger-core"

export function createPetTask(task: PendingPetTask) {
  const db = open()
  create(db, task)
  prune(db, Date.now() - enterprisePolicy().retentionDays * 24 * 60 * 60 * 1000)
  db.close()
}

export function recoverPetTask() {
  const db = open()
  const task = recover(db)
  db.close()
  return task
}

export function markPetTaskDelivered(taskId: string) {
  const db = open()
  delivered(db, taskId)
  db.close()
}

export function markPetTaskRunning(taskId: string) {
  const db = open()
  running(db, taskId)
  db.close()
}

export function recordPetTaskResult(
  taskId: string,
  input: { success: boolean; partial?: boolean; answer?: string; error?: string },
) {
  const db = open()
  result(db, taskId, input)
  db.close()
}

function open() {
  const destination = process.env.XIAOXUE_GOVERNANCE_DB?.trim() || governanceDatabasePath()
  mkdirSync(dirname(destination), { recursive: true })
  const db = new DatabaseSync(destination)
  initialize(db)
  return db
}
