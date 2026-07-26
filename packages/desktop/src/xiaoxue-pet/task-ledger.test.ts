import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { TaskLedgerCore } from "./task-ledger-core"

describe("Xiaoxue pet SQLite task ledger", () => {
  test("recovers delivery across restart and completes idempotently", () => {
    const task = { taskId: "task-1", prompt: "检查合同", agent: "xiaoxue", autoSubmit: true }

    const db = new Database(":memory:")
    TaskLedgerCore.initialize(db)
    TaskLedgerCore.create(db, task)
    expect(TaskLedgerCore.recover(db)).toEqual(task)
    TaskLedgerCore.delivered(db, task.taskId)
    TaskLedgerCore.running(db, task.taskId)

    expect(TaskLedgerCore.recover(db)).toEqual(task)
    TaskLedgerCore.result(db, task.taskId, { success: true, answer: "检查完成" })
    expect(TaskLedgerCore.recover(db)).toBeUndefined()

    const row = db.query("SELECT status, attempts, output FROM task_ledger WHERE id = ?").get(task.taskId)
    db.close()
    expect(row).toEqual({
      status: "succeeded",
      attempts: 1,
      output: JSON.stringify({ answer: "检查完成" }),
    })
  })
})
