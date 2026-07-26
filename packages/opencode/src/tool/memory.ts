import { Config } from "@/config/config"
import { Memory } from "@/memory"
import { Effect, Schema } from "effect"
import { Tool } from "./tool"

const Parameters = Schema.Struct({
  action: Schema.Literals(["list", "add", "replace", "remove"]),
  target: Schema.optional(Schema.Literals(["memory", "user"])),
  content: Schema.optional(Schema.String),
  match: Schema.optional(Schema.String),
})

export const MemoryTool = Tool.define(
  "memory",
  Effect.gen(function* () {
    const config = yield* Config.Service
    return {
      description: [
        "管理小雪的本地长期记忆与用户画像。",
        "target=user 只保存稳定的用户身份、偏好和沟通习惯；target=memory 保存稳定的项目约定、环境事实和可复用经验。",
        "只保存简短的声明式事实，不保存临时任务、秘密、完整对话或未经用户确认的推断。",
        "当用户明确要求记住时应调用；定期复盘时仅保存真正长期有用的内容。",
        "add 新增，replace 用唯一 match 片段合并更新，remove 删除，list 查看。",
      ].join("\n"),
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>) =>
        Effect.gen(function* () {
          const info = yield* config.get()
          const result = yield* Effect.promise(() => Memory.execute(params, info.memory))
          return {
            title: "长期记忆",
            metadata: {},
            output: JSON.stringify(result, null, 2),
          }
        }),
    }
  }),
)
