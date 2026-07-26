import { Config } from "@/config/config"
import { XiaoxueMemory } from "@/xiaoxue/memory"
import { Session } from "@/session/session"
import { Effect, Schema } from "effect"
import { Tool } from "./tool"

const Parameters = Schema.Struct({
  action: Schema.Literals(["list", "add", "replace", "remove"]),
  target: Schema.optional(Schema.Literals(["memory", "user"])),
  content: Schema.optional(Schema.String),
  match: Schema.optional(Schema.String),
})

export const XiaoxueMemoryTool = Tool.define(
  "xiaoxue_memory",
  Effect.gen(function* () {
    const config = yield* Config.Service
    const session = yield* Session.Service
    return {
      description: [
        "管理小雪隔离的本地长期记忆与用户画像。",
        "target=user 只保存稳定的用户身份、偏好和沟通习惯；target=memory 保存当前项目的稳定约定、环境事实和可复用经验。",
        "只保存简短的声明式事实，不保存临时任务、秘密、完整对话或未经用户确认的推断。",
        "当用户明确要求记住时应调用；定期复盘时仅保存真正长期有用的内容。",
        "add 新增，replace 用唯一 match 片段合并更新，remove 删除，list 查看。",
      ].join("\n"),
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const info = yield* config.get()
          const current = yield* session.get(ctx.sessionID).pipe(Effect.orDie)
          const result = yield* Effect.promise(() =>
            XiaoxueMemory.execute(
              params,
              info.xiaoxue?.memory ?? info.memory,
              current.directory,
              undefined,
              current.projectID,
            ),
          )
          return {
            title: "小雪长期记忆",
            metadata: {},
            output: JSON.stringify(result, null, 2),
          }
        }),
    }
  }),
)
