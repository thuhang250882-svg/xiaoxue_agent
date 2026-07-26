import { Config } from "@/config/config"
import { Session } from "@/session/session"
import { XiaoxueObsidian } from "@/xiaoxue/obsidian"
import { XiaoxueGovernance } from "@/xiaoxue/governance"
import { XiaoxueEnterprisePolicy } from "@/xiaoxue/enterprise-policy"
import { Effect, Schema } from "effect"
import { Tool } from "./tool"

const Parameters = Schema.Struct({
  title: Schema.String,
  content: Schema.String,
  tags: Schema.optional(Schema.Array(Schema.String)),
  sources: Schema.optional(Schema.Array(Schema.String)),
})

export const XiaoxueObsidianArchiveTool = Tool.define(
  "xiaoxue_obsidian_archive",
  Effect.gen(function* () {
    const config = yield* Config.Service
    const session = yield* Session.Service
    return {
      description: [
        "把已验证且可复用的任务结论归档到 Obsidian。manual 模式只在用户明确要求归档时调用；confirm 模式可提出归档并等待用户确认；auto 模式只创建待审核草稿。",
        "归档内容应包括关键结论、修改文件、验证结果、风险和后续；禁止保存密钥、临时闲聊、未经验证的推断或完整对话。",
        "采用 Karpathy LLM Wiki 原则：原始资料只读，值得保留的综合结论以 Markdown 和 WikiLink 增量沉淀。",
      ].join("\n"),
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const info = yield* config.get()
          const obsidian = yield* awaitSettings(info.xiaoxue?.obsidian)
          XiaoxueEnterprisePolicy.require("archive", obsidian.archiveMode)
          if (obsidian.archiveMode !== "auto") {
            yield* ctx.ask({
              permission: "xiaoxue_obsidian_archive",
              patterns: [params.title],
              always: ["*"],
              metadata: {
                title: params.title,
                archiveDirectory: obsidian.archiveDirectory,
                archiveMode: obsidian.archiveMode,
              },
            })
          }
          const current = yield* session.get(ctx.sessionID).pipe(Effect.orDie)
          const result = yield* Effect.promise(() =>
            XiaoxueObsidian.archive(
              {
                title: params.title,
                content: params.content,
                project: current.directory,
                sessionID: ctx.sessionID,
                tags: params.tags ? [...params.tags] : undefined,
                sources: params.sources ? [...params.sources] : undefined,
                status: obsidian.archiveMode === "auto" ? "pending_review" : "published",
              },
              info.xiaoxue?.obsidian,
            ),
          )
          yield* Effect.promise(() =>
            XiaoxueGovernance.audit({
              action: "knowledge.archive",
              resource: result.path,
              outcome: "succeeded",
              sessionID: ctx.sessionID,
              projectID: current.projectID,
              metadata: { status: result.status, title: result.title },
            }),
          )
          return {
            title: `已归档：${result.title}`,
            output: JSON.stringify(result),
            metadata: result,
          }
        }),
    }
  }),
)

function awaitSettings(value: Parameters<typeof XiaoxueObsidian.settings>[0]) {
  return Effect.promise(() => XiaoxueObsidian.settings(value))
}
