import { describe, expect, test } from "bun:test"
import { BUSINESS_TASKS_METADATA_KEY, readBusinessTasks, removeBusinessTask, upsertBusinessTask } from "../../src/tool/business-task"

const task = (id: string, createdAt: string) => ({
  id,
  sessionId: "ses_test",
  taskType: "geology_report_review" as const,
  agent: "report",
  title: `${id}.docx`,
  status: "completed" as const,
  createdAt,
  sourceFiles: [],
  exportedFiles: [],
})

describe("xiaoxue business task metadata", () => {
  test("upserts tasks newest first without losing unrelated metadata", () => {
    const first = upsertBusinessTask({ owner: "xiaoxue" }, task("a", "2026-01-01T00:00:00.000Z"))
    const second = upsertBusinessTask(first, task("b", "2026-01-02T00:00:00.000Z"))

    expect((second as Record<string, unknown>).owner).toBe("xiaoxue")
    expect(readBusinessTasks(second).map((item) => item.id)).toEqual(["b", "a"])
  })

  test("replaces an existing task and supports metadata-only deletion", () => {
    const stored = upsertBusinessTask(undefined, task("a", "2026-01-01T00:00:00.000Z"))
    const completed = upsertBusinessTask(stored, { ...task("a", "2026-01-01T00:00:00.000Z"), title: "updated" })
    expect(readBusinessTasks(completed)).toHaveLength(1)
    expect(readBusinessTasks(completed)[0]?.title).toBe("updated")

    const removed = removeBusinessTask(completed, "a")
    expect(removed[BUSINESS_TASKS_METADATA_KEY]).toEqual([])
  })

  test("ignores malformed persisted entries", () => {
    expect(readBusinessTasks({ [BUSINESS_TASKS_METADATA_KEY]: [null, { id: "broken" }] })).toEqual([])
  })
})