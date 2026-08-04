import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { create, delivered, initialize, recover, result, running } from "./task-ledger-core"

describe("Xiaoxue pet SQLite task ledger", () => {
  test("recovers delivery across restart and completes idempotently", () => {
    const task = { taskId: "task-1", prompt: "检查合同", agent: "xiaoxue", autoSubmit: true }

    const db = new Database(":memory:")
    initialize(db)
    create(db, task)
    expect(recover(db)).toEqual(task)
    delivered(db, task.taskId)
    running(db, task.taskId)

    expect(recover(db)).toEqual(task)
    result(db, task.taskId, { success: true, answer: "检查完成" })
    expect(recover(db)).toBeUndefined()

    const row = db.query("SELECT status, attempts, output FROM task_ledger WHERE id = ?").get(task.taskId)
    db.close()
    expect(row).toEqual({
      status: "succeeded",
      attempts: 1,
      output: JSON.stringify({ answer: "检查完成" }),
    })
  })

  test("recover cancels stale backlog and only redelivers the newest task", () => {
    const older = { taskId: "task-old", prompt: "旧任务", agent: "xiaoxue", autoSubmit: true }
    const newest = { taskId: "task-new", prompt: "新任务", agent: "xiaoxue", autoSubmit: true }

    const db = new Database(":memory:")
    initialize(db)
    create(db, older)
    create(db, newest)
    // 显式拉开时间差，避免同毫秒下 ORDER BY updated_at 排序不确定
    db.run("UPDATE task_ledger SET updated_at = updated_at - 1000 WHERE id = ?", [older.taskId])

    expect(recover(db)).toEqual(newest)
    const olderRow = db.query("SELECT status FROM task_ledger WHERE id = ?").get(older.taskId)
    db.close()
    expect(olderRow).toEqual({ status: "cancelled" })
  })
})
