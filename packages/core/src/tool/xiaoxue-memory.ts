export * as XiaoxueMemoryTool from "./xiaoxue-memory"

import { ToolFailure } from "@opencode-ai/llm"
import { Effect, Layer, Schema } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { MemoryContext } from "../memory-context"
import { PermissionV2 } from "../permission"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"

export const name = "xiaoxue_memory"

export const Input = Schema.Struct({
  action: Schema.Literals(["list", "add", "replace", "remove"]),
  target: Schema.Literals(["memory", "user"]).pipe(Schema.optional),
  content: Schema.String.pipe(Schema.optional),
  match: Schema.String.pipe(Schema.optional),
})

export const Output = Schema.Struct({
  success: Schema.Boolean,
  message: Schema.String,
  id: Schema.String.pipe(Schema.optional),
  entries: Schema.Array(Schema.String).pipe(Schema.optional),
  store: Schema.Struct({
    user: Schema.Array(Schema.String),
    shared: Schema.Array(Schema.String),
    project: Schema.Array(Schema.String),
  }).pipe(Schema.optional),
})

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const memory = yield* MemoryContext.Service
    const permission = yield* PermissionV2.Service

    yield* tools
      .register({
        [name]: Tool.make({
          description: [
            "管理小雪隔离的本地长期记忆与用户画像。",
            "target=user 只保存稳定的用户身份、偏好和沟通习惯；target=memory 保存当前项目的稳定约定、环境事实和可复用经验。",
            "只保存简短的声明式事实，不保存临时任务、秘密、完整对话或未经用户确认的推断。",
            "当用户明确要求记住时应调用；定期复盘时仅保存真正长期有用的内容。",
            "add 新增，replace 用唯一 match 片段合并更新，remove 删除，list 查看。",
          ].join("\n"),
          input: Input,
          output: Output,
          toModelOutput: ({ output }) => [{ type: "text", text: JSON.stringify(output, null, 2) }],
          execute: (input, context) =>
            permission
              .assert({
                action: name,
                resources: ["*"],
                save: ["*"],
                sessionID: context.sessionID,
                agent: context.agent,
                source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
              })
              .pipe(
                Effect.mapError(() => new ToolFailure({ message: "Permission denied: xiaoxue_memory" })),
                Effect.andThen(memory.manage(input)),
                Effect.mapError(() => new ToolFailure({ message: "Unable to update Xiaoxue memory" })),
              ),
        }),
      })
      .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/xiaoxue-memory",
  layer,
  deps: [ToolRegistry.node, MemoryContext.node, PermissionV2.node],
})

