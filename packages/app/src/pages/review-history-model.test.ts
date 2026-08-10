import { describe, expect, test } from "bun:test"
import { loadReviewHistory } from "./review-history-model"

const task = (id: string, createdAt: string, status: "completed" | "failed" = "completed") => ({
  id,
  sessionId: `session-${id}`,
  taskType: "geology_report_review",
  agent: "report",
  title: `审核 ${id}`,
  status,
  createdAt,
  sourceFiles: [],
  exportedFiles: [],
})

describe("review history model", () => {
  test("loads root sessions globally without a directory filter", async () => {
    const queries: unknown[] = []
    const records = await loadReviewHistory(async (query) => {
      queries.push(query)
      return {
        data: [
          { metadata: { xiaoxue_business_tasks: [task("project-a", "2026-08-09T01:00:00Z")] } },
          { metadata: { xiaoxue_business_tasks: [task("project-b", "2026-08-10T01:00:00Z")] } },
        ],
      }
    })

    expect(queries).toEqual([{ roots: true, limit: 200, cursor: undefined }])
    expect(records.map((record) => record.task.id)).toEqual(["project-b", "project-a"])
  })

  test("follows global pagination until it has enough review records", async () => {
    const cursors: Array<number | undefined> = []
    const records = await loadReviewHistory(async (query) => {
      cursors.push(query.cursor)
      if (query.cursor === undefined) return { data: [{ metadata: {} }], cursor: "100" }
      return { data: [{ metadata: { xiaoxue_business_tasks: [task("older", "2026-08-08T01:00:00Z")] } }] }
    })

    expect(cursors).toEqual([undefined, 100])
    expect(records.map((record) => record.task.id)).toEqual(["older"])
  })

  test("does not expose failed business tasks", async () => {
    const records = await loadReviewHistory(async () => ({
      data: [{ metadata: { xiaoxue_business_tasks: [task("failed", "2026-08-10T01:00:00Z", "failed")] } }],
    }))

    expect(records).toEqual([])
  })
})
