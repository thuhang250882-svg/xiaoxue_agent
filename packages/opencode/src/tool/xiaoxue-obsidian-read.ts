import { Config } from "@/config/config"
import { XiaoxueObsidian } from "@/xiaoxue/obsidian"
import { Effect, Schema } from "effect"
import { Tool } from "./tool"

const Parameters = Schema.Struct({
  path: Schema.String,
  max_characters: Schema.optional(Schema.Number),
})

export const XiaoxueObsidianReadTool = Tool.define(
  "xiaoxue_obsidian_read",
  Effect.gen(function* () {
    const config = yield* Config.Service
    return {
      description:
        "读取 Obsidian 检索结果中的单个 Markdown 笔记。path 必须是 Vault 内相对路径，只读且受排除目录与字符上限保护。",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>) =>
        Effect.gen(function* () {
          const info = yield* config.get()
          const result = yield* Effect.promise(() =>
            XiaoxueObsidian.read(params.path, info.xiaoxue?.obsidian, params.max_characters),
          )
          return {
            title: result.title,
            output: JSON.stringify(result),
            metadata: { path: result.path, truncated: result.truncated },
          }
        }),
    }
  }),
)
