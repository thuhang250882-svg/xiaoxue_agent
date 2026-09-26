import { Global } from "@opencode-ai/core/global"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Effect, Schema } from "effect"
import path from "node:path"
import { strategyStore } from "../xiaoxue/review-strategy"
import { verifyRevisionEvidence } from "../xiaoxue/review-strategy-evidence"
import { latestUserAttachments, readAttachment } from "./xiaoxue-attachments"
import { Tool } from "./tool"

const Draft = Schema.Struct({
  title: Schema.String,
  problem: Schema.String,
  before: Schema.String,
  after: Schema.String,
  rationale: Schema.String,
  basis: Schema.String,
  reportType: Schema.String,
  section: Schema.String,
  region: Schema.String,
  scenario: Schema.String,
  exception: Schema.String,
  sourceFile: Schema.String,
  sourceHash: Schema.optional(Schema.String),
  sourceLocation: Schema.String,
  supersedes: Schema.optional(Schema.String),
})

const Parameters = Schema.Struct({
  action: Schema.Literals(["preview", "save", "remove", "list", "search"]),
  draft: Schema.optional(Draft),
  originalFileName: Schema.optional(Schema.String),
  revisedFileName: Schema.optional(Schema.String),
  id: Schema.optional(Schema.String),
  reportType: Schema.optional(Schema.String),
  section: Schema.optional(Schema.String),
  region: Schema.optional(Schema.String),
  query: Schema.optional(Schema.String),
})

export const ReviewStrategyTool = Tool.define(
  "review_strategy",
  Effect.succeed({
    description:
      "管理个人离线审核经验。用户上传原稿与人工定稿 DOCX 后，先用 preview 读取可信附件并核对唯一前后片段与真实 SHA-256，生成不会被检索到的待确认卡。preview 必须传顶层 originalFileName、revisedFileName 和嵌套 draft 对象；标题、问题、前后片段、依据、适用场景、例外、来源文件与位置等字段都放在 draft 内，不能平铺在顶层。让用户查看标题、修改、依据、适用场景和例外。只有用户本轮单独输入‘保存为审核经验 <id>’才用 save 保存该卡，不重新生成内容；不能从 AI 修改版自动保存。list/search 只显示有效经验，结果仍需人工判断适用性。用户本轮单独输入‘撤销审核经验 <id>’时可 remove。",
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
      Effect.tryPromise({
        try: () => executeReviewStrategy(path.join(Global.Path.data, "review-strategies"), params, ctx.messages),
        catch: (error) => (error instanceof Error ? error : new Error(String(error))),
      }).pipe(
        Effect.map((output) => ({ title: "审核策略回流", output: JSON.stringify(output), metadata: output })),
        Effect.catch((error) =>
          Effect.succeed({
            title: "审核策略回流失败",
            output: JSON.stringify({ type: "review_strategy_error", error: error.message }),
            metadata: { type: "review_strategy_error" },
          }),
        ),
      ),
  }),
)

export async function executeReviewStrategy(
  root: string,
  params: Schema.Schema.Type<typeof Parameters>,
  messages: SessionV1.WithParts[],
) {
  const store = await strategyStore(root)
  try {
    const latest = [...messages].reverse().find((message) => message.info.role === "user")
    const userText =
      latest?.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n")
        .trim() ?? ""
    if (params.action === "preview") {
      if (!params.draft) throw new Error("preview 需要嵌套的 draft 对象；审核经验字段不能平铺在顶层。")
      if (!params.originalFileName || !params.revisedFileName || params.originalFileName === params.revisedFileName)
        throw new Error("preview 需要分别指定原稿和人工定稿的不同文件名。")
      const message = [...messages]
        .reverse()
        .find((item) => item.info.role === "user" && item.parts.filter((part) => part.type === "file").length >= 2)
      const attachments = message ? latestUserAttachments([message]) : []
      const original = attachments.filter((item) => item.filename === params.originalFileName)
      const revised = attachments.filter((item) => item.filename === params.revisedFileName)
      if (original.length !== 1 || revised.length !== 1) throw new Error("原稿和人工定稿必须各有一份可信附件。")
      const [originalData, revisedData] = await Promise.all([readAttachment(original[0]), readAttachment(revised[0])])
      const evidence = await verifyRevisionEvidence({
        draft: params.draft,
        original: { name: original[0].filename, data: originalData },
        revised: { name: revised[0].filename, data: revisedData },
      })
      return result("preview", store.propose({ ...params.draft, ...evidence }))
    }
    if (params.action === "save") {
      if (!params.id) throw new Error("保存需要待确认经验 ID。")
      const phrase = `保存为审核经验 ${params.id}`
      if (userText !== phrase || latest?.parts.some((part) => part.type === "file"))
        throw new Error(`需要用户本轮不带附件、单独输入“${phrase}”。`)
      return result("save", store.decide(params.id, "approved", "本机用户"))
    }
    if (params.action === "list") return result("list", store.list("approved").slice(0, 50))
    if (params.action === "search")
      return result(
        "search",
        store.search({
          reportType: params.reportType,
          section: params.section,
          region: params.region,
          query: params.query,
        }),
      )
    if (!params.id) throw new Error("撤销需要经验 ID。")
    const phrase = `撤销审核经验 ${params.id}`
    if (userText !== phrase || latest?.parts.some((part) => part.type === "file"))
      throw new Error(`需要用户本轮不带附件、单独输入“${phrase}”。`)
    return result("remove", store.retire(params.id, "本机用户"))
  } finally {
    store.close()
  }
}

function result(action: string, value: unknown) {
  return { type: "review_strategy_result", action, value }
}
