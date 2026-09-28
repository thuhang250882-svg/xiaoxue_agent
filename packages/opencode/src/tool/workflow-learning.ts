import { Database } from "@opencode-ai/core/database/database"
import { Global } from "@opencode-ai/core/global"
import { sql } from "drizzle-orm"
import { Effect, Schema } from "effect"
import path from "node:path"
import { Session } from "@/session/session"
import { WorkflowLearning } from "@/xiaoxue/workflow-learning"
import { Tool } from "./tool"

const Parameters = Schema.Struct({
  action: Schema.Literals(["list", "show", "approve", "reject", "retire", "revise", "forget"]),
  id: Schema.optional(Schema.String),
  steps: Schema.optional(Schema.Array(Schema.String)),
})

export const WorkflowLearningTool = Tool.define(
  "workflow_learning",
  Effect.gen(function* () {
    const session = yield* Session.Service
    const database = yield* Database.Service
    return {
      description:
        "查看小雪在当前工作区自动发现的重复操作工作流候选。list/show 为只读；候选至少来自三个不同任务，只记录技能和工具步骤，不保存文档正文或工具参数。approve、reject、retire、revise、forget 仅在用户本轮单独输入工具返回的精确确认短句时执行。forget 清除该候选及其观察记录，并阻止同一模式再次自动生成。批准仅让候选可供后续任务参考，不能自动运行或放宽当前权限。",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const current = yield* session.get(ctx.sessionID)
          const projectID = WorkflowLearning.projectIdentifier(current.directory)
          const user =
            params.action === "list" || params.action === "show"
              ? { text: "", files: 0 }
              : yield* latestUser(database.db, ctx.sessionID)
          const store = yield* Effect.tryPromise(() =>
            WorkflowLearning.workflowStore(path.join(Global.Path.data, "xiaoxue", "workflows")),
          )
          return yield* Effect.tryPromise({
            try: async () => {
              try {
                if (params.action === "list")
                  return { action: "list", candidates: store.list(projectID).slice(0, 50) }
                if (!params.id) throw new Error("需要工作流 ID。")
                const card = store.read(params.id)
                if (!card || card.projectID !== projectID) throw new Error("当前工作区中找不到该工作流。")
                if (params.action === "show") return { action: "show", candidate: card }
                requireWorkflowConfirmation(params.action, params.id, params.steps, user)
                if (params.action === "forget")
                  return { action: "forget", value: store.forget(params.id, projectID) }
                if (params.action === "revise") {
                  if (!params.steps) throw new Error("修改工作流需要完整步骤。")
                  return { action: "revise", candidate: store.revise(params.id, projectID, [...params.steps]) }
                }
                return {
                  action: params.action,
                  candidate: store.decide(
                    params.id,
                    projectID,
                    params.action === "approve" ? "approved" : params.action === "reject" ? "rejected" : "retired",
                  ),
                }
              } finally {
                store.close()
              }
            },
            catch: (error) => (error instanceof Error ? error : new Error(String(error))),
          }).pipe(
            Effect.map((result) => ({
              title: "小雪工作流学习",
              output: JSON.stringify(result),
              metadata: {},
            })),
            Effect.catch((error) =>
              Effect.succeed({
                title: "小雪工作流学习失败",
                output: JSON.stringify({ error: error.message }),
                metadata: {},
              }),
            ),
          )
        }).pipe(
          Effect.catchCause(() =>
            Effect.succeed({
              title: "小雪工作流学习失败",
              output: JSON.stringify({ error: "无法读取当前任务或工作流记录。" }),
              metadata: {},
            }),
          ),
        ),
    }
  }),
)

export function requireWorkflowConfirmation(
  action: "approve" | "reject" | "retire" | "revise" | "forget",
  id: string,
  steps: readonly string[] | undefined,
  user: { text: string; files: number },
) {
  const phrase =
    action === "approve"
      ? `批准工作流 ${id}`
      : action === "reject"
        ? `拒绝工作流 ${id}`
        : action === "retire"
          ? `停用工作流 ${id}`
          : action === "forget"
            ? `忘记工作流 ${id}`
          : `修改工作流 ${id}：${steps?.join("、") ?? ""}`
  if (user.text !== phrase || user.files > 0) throw new Error(`需要用户本轮不带附件、单独输入“${phrase}”。`)
}

function latestUser(db: Database.Interface["db"], sessionID: string) {
  return Effect.gen(function* () {
    const v2 = yield* db.all<{ text: string; files: number }>(sql`
      SELECT json_extract(data, '$.text') AS text,
        COALESCE(json_array_length(json_extract(data, '$.files')), 0) AS files
      FROM session_message
      WHERE session_id = ${sessionID} AND type = 'user'
      ORDER BY seq DESC LIMIT 1
    `)
    if (v2[0]) return v2[0]
    const v1 = yield* db.all<{ text: string; files: number }>(sql`
      SELECT
        COALESCE((SELECT group_concat(json_extract(part.data, '$.text'), char(10)) FROM part
          WHERE part.message_id = message.id AND json_extract(part.data, '$.type') = 'text'), '') AS text,
        (SELECT count(*) FROM part WHERE part.message_id = message.id
          AND json_extract(part.data, '$.type') = 'file') AS files
      FROM message
      WHERE message.session_id = ${sessionID} AND json_extract(message.data, '$.role') = 'user'
      ORDER BY message.time_created DESC, message.id DESC LIMIT 1
    `)
    return v1[0] ?? { text: "", files: 0 }
  })
}
