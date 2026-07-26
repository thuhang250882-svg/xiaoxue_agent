export * as TaskLedger from "./task-ledger"
export type { PendingPetTask } from "./task-ledger-core"

import { DatabaseSync } from "node:sqlite"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { enterprisePolicy } from "../main/enterprise-policy"
import { governanceDatabasePath } from "../main/governance-database"
import { TaskLedgerCore, type PendingPetTask } from "./task-ledger-core"

export function create(task: PendingPetTask) {
  const db = open()
  TaskLedgerCore.create(db, task)
  TaskLedgerCore.prune(db, Date.now() - enterprisePolicy().retentionDays * 24 * 60 * 60 * 1000)
  db.close()
}

export function recover() {
  const db = open()
  const task = TaskLedgerCore.recover(db)
  db.close()
  return task
}

export function delivered(taskId: string) {
  const db = open()
  TaskLedgerCore.delivered(db, taskId)
  db.close()
}

export function running(taskId: string) {
  const db = open()
  TaskLedgerCore.running(db, taskId)
  db.close()
}

export function result(taskId: string, input: { success: boolean; partial?: boolean; answer?: string; error?: string }) {
  const db = open()
  TaskLedgerCore.result(db, taskId, input)
  db.close()
}

function open() {
  const destination = process.env.XIAOXUE_GOVERNANCE_DB?.trim() || governanceDatabasePath()
  mkdirSync(dirname(destination), { recursive: true })
  const db = new DatabaseSync(destination)
  TaskLedgerCore.initialize(db)
  return db
}
