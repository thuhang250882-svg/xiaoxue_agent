import { describe, expect, test } from "bun:test"
import { Database } from "@opencode-ai/core/database/database"
import { sql } from "drizzle-orm"
import { Effect } from "effect"
import os from "node:os"
import { XiaoxueMemoryReview } from "../../src/xiaoxue/memory-review"
import { latestUser } from "../../src/tool/workflow-learning"

describe("XiaoxueMemoryReview", () => {
  test("collects completed V1 and V2 tool steps from a Xiaoxue task without their arguments", async () => {
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { db } = yield* Database.Service
          yield* db.run(sql`
            INSERT INTO project (id, worktree, time_created, time_updated, sandboxes)
            VALUES ('project-workflow', ${os.tmpdir()}, 1, 1, '[]')
          `)
          yield* db.run(sql`
            INSERT INTO session (id, project_id, parent_id, slug, directory, title, version, agent, time_created, time_updated)
            VALUES
              ('session-workflow', 'project-workflow', NULL, 'root', ${os.tmpdir()}, 'Root', '1', 'xiaoxue', 1, 1000000),
              ('session-workflow-child', 'project-workflow', 'session-workflow', 'child', ${os.tmpdir()}, 'Child', '1', 'office', 1, 1000000)
          `)
          yield* db.run(sql`
            INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data)
            VALUES ('msg_workflow', 'session-workflow', 'assistant', 1, 100, 100,
              ${JSON.stringify({
                content: [
                  { type: "tool", name: "skill", state: { status: "completed", input: { name: "weekly-report" } } },
                  { type: "tool", name: "shell", state: { status: "completed", input: { command: "private" } } },
                ],
              })})
          `)
          yield* db.run(sql`
            INSERT INTO message (id, session_id, time_created, time_updated, data)
            VALUES ('msg_workflow_v1', 'session-workflow-child', 200, 200, ${JSON.stringify({ role: "assistant" })})
          `)
          yield* db.run(sql`
            INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
            VALUES ('part_workflow', 'msg_workflow_v1', 'session-workflow-child', 201, 201,
              ${JSON.stringify({
                type: "tool",
                tool: "office_document",
                state: { status: "completed", input: { content: "private" } },
              })})
          `)
          return yield* XiaoxueMemoryReview.collectWorkflowTraces(db, 2000000)
        }).pipe(Effect.provide(Database.layerFromPath(":memory:"))),
      ),
    )
    expect(result.map((row) => [row.name, row.skillName])).toEqual([
      ["skill", "weekly-report"],
      ["shell", null],
      ["office_document", null],
    ])
    expect(JSON.stringify(result)).not.toContain("private")
  })

  test("collects top-level V1 and V2 user text after the durable cursor", async () => {
    const directory = os.tmpdir()
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { db } = yield* Database.Service
          yield* db.run(sql`
            INSERT INTO project (id, worktree, time_created, time_updated, sandboxes)
            VALUES ('project-review', ${directory}, 1, 1, '[]')
          `)
          yield* db.run(sql`
            INSERT INTO session (id, project_id, parent_id, slug, directory, title, version, time_created, time_updated)
            VALUES
              ('session-root', 'project-review', NULL, 'root', ${directory}, 'Root', '1', 1, 1),
              ('session-child', 'project-review', 'session-root', 'child', ${directory}, 'Child', '1', 1, 1)
          `)
          yield* db.run(sql`
            INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data)
            VALUES
              ('msg_v2_root', 'session-root', 'user', 1, 100, 100, ${JSON.stringify({ text: "V2 用户偏好中文。" })}),
              ('msg_v2_child', 'session-child', 'user', 1, 110, 110, ${JSON.stringify({ text: "子代理噪声。" })}),
              ('msg_v2_assistant', 'session-root', 'assistant', 2, 120, 120, ${JSON.stringify({ text: "助手回复。" })})
          `)
          yield* db.run(sql`
            INSERT INTO message (id, session_id, time_created, time_updated, data)
            VALUES ('msg_v1_root', 'session-root', 200, 200, ${JSON.stringify({ role: "user" })})
          `)
          yield* db.run(sql`
            INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
            VALUES
              ('part_v1_a', 'msg_v1_root', 'session-root', 201, 201, ${JSON.stringify({ type: "text", text: "V1 第一段。" })}),
              ('part_v1_b', 'msg_v1_root', 'session-root', 202, 202, ${JSON.stringify({ type: "text", text: "V1 第二段。" })})
          `)

          const all = yield* XiaoxueMemoryReview.collect(db, { observedAt: 0, key: "" })
          const after = yield* XiaoxueMemoryReview.collect(db, {
            observedAt: 100,
            key: "v2:session-root:msg_v2_root",
          })
          const latest = yield* latestUser(db, "session-root")
          return { all, after, latest }
        }).pipe(Effect.provide(Database.layerFromPath(":memory:"))),
      ),
    )

    expect(result.all).toEqual([
      {
        source: "v2",
        sessionID: "session-root",
        messageID: "msg_v2_root",
        directory: os.tmpdir(),
        observedAt: 100,
        text: "V2 用户偏好中文。",
      },
      {
        source: "v1",
        sessionID: "session-root",
        messageID: "msg_v1_root",
        directory: os.tmpdir(),
        observedAt: 200,
        text: "V1 第一段。\nV1 第二段。",
      },
    ])
    expect(result.after).toEqual([result.all[1]])
    expect(result.latest.text).toBe("V1 第一段。\nV1 第二段。")
  })
})

