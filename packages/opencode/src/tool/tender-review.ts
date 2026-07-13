import { mkdir } from "node:fs/promises"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { Effect, Schema } from "effect"
import { exportBusinessReviewToDocx } from "../../../../document_engine"
import type { ParsedDocument } from "../../../../document_engine"
import { Tool } from "./tool"
import { latestUserAttachments, parseAttachments } from "./xiaoxue-attachments"

const Parameters = Schema.Struct({
  focus: Schema.optional(Schema.String),
  outputFormat: Schema.optional(Schema.Literals(["json", "docx"])),
})

export type TenderRequirement = {
  id: string
  category: "qualification" | "technical" | "commercial" | "scoring" | "rejection" | "evidence"
  location: string
  originalText: string
  severity: "high" | "medium" | "low"
  responseSuggestion: string
  needHumanConfirm: boolean
}

export type TenderReviewResult = {
  type: "tender_review_result"
  taskId: string
  files: string[]
  summary: { total: number; high: number; medium: number; low: number }
  requirements: TenderRequirement[]
  missingMaterials: string[]
  disclaimer: string
  exportedFile?: Awaited<ReturnType<typeof exportBusinessReviewToDocx>>
}

export const TenderReviewTool = Tool.define(
  "tender_review",
  Effect.succeed({
    description:
      "解析当前会话中的真实招标、投标或评分文件，提取资格条件、技术商务要求、评分点和废标风险，并为每项保留原文位置。",
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) => {
      const taskId = `tender-${Date.now()}`
      return Effect.tryPromise({
        try: async () => {
          await Effect.runPromise(ctx.metadata({ title: "标书智能审核", metadata: state(ctx.sessionID, taskId, "reading", "正在读取招投标文件和评分办法...") }))
          const documents = await parseAttachments(latestUserAttachments(ctx.messages))
          await Effect.runPromise(ctx.metadata({ title: "标书智能审核", metadata: state(ctx.sessionID, taskId, "reviewing", "正在提取硬性条件、评分点和废标风险...") }))
          const result = reviewTenderDocuments(documents, taskId, params.focus)
          if (params.outputFormat === "docx") {
            const outputPath = path.join(Global.Path.data, "exports", "tender")
            await mkdir(outputPath, { recursive: true })
            result.exportedFile = await exportTenderReviewResult(result, outputPath)
          }
          await Effect.runPromise(ctx.metadata({ title: "标书智能审核", metadata: state(ctx.sessionID, taskId, "success", `标书审核完成，共定位 ${result.summary.total} 项要求。`) }))
          return {
            title: "标书智能审核",
            output: JSON.stringify(result),
            metadata: { ...state(ctx.sessionID, taskId, "success", "标书审核完成。"), result },
          }
        },
        catch: toError,
      }).pipe(
        Effect.catch((error) =>
          ctx.metadata({ title: "标书智能审核失败", metadata: state(ctx.sessionID, taskId, "error", error.message) }).pipe(
            Effect.as({
              title: "标书智能审核失败",
              output: JSON.stringify({ type: "tender_review_error", taskId, error: error.message }),
              metadata: state(ctx.sessionID, taskId, "error", error.message),
            }),
          ),
        ),
      )
    },
  }),
)

export function reviewTenderDocuments(documents: ParsedDocument[], taskId = `tender-${Date.now()}`, focus?: string): TenderReviewResult {
  const requirements = documents.flatMap((document) =>
    document.rawText
      .split(/\n+|(?<=。)/)
      .map((text, index) => ({ index: index + 1, text: text.trim(), location: "正文第 " + (index + 1) + " 段" }))
      .filter((paragraph) => Boolean(paragraph.text))
      .flatMap((paragraph) => {
      const category = classify(paragraph.text)
      if (!category) return []
      const severity = /废标|否决投标|无效投标|必须|不得|不接受/.test(paragraph.text) ? "high" : /评分|加分|承诺|应当|须/.test(paragraph.text) ? "medium" : "low"
      return [{
        id: `TENDER-${String(paragraph.index).padStart(3, "0")}-${requirementsHash(document.fileName)}`,
        category,
        location: `${document.fileName} / ${paragraph.location ?? `正文第 ${paragraph.index} 段`}`,
        originalText: paragraph.text.slice(0, 600),
        severity,
        responseSuggestion: suggestion(category, severity),
        needHumanConfirm: severity !== "low",
      } satisfies TenderRequirement]
    }),
  )
  const text = documents.map((document) => document.rawText).join("\n")
  const missingMaterials = [
    !/评分办法|评标办法|评分标准/.test(text) ? "评分办法或评分标准" : undefined,
    !/技术规范|技术要求|服务要求/.test(text) ? "技术规范或服务要求" : undefined,
    !/合同条款|合同格式|合同条件/.test(text) ? "合同主要条款或合同格式" : undefined,
  ].filter((value): value is string => Boolean(value))
  if (focus && !text.includes(focus)) missingMaterials.push(`未在当前文件中直接定位关注点：“${focus}”`)
  return {
    type: "tender_review_result",
    taskId,
    files: documents.map((document) => document.fileName),
    summary: summarize(requirements),
    requirements,
    missingMaterials,
    disclaimer: "本结果仅基于当前上传文件进行智能辅助审查；投标决策、废标判断和商务承诺须由项目负责人及专业人员复核。",
  }
}

export function exportTenderReviewResult(result: TenderReviewResult, outputPath: string) {
  return exportBusinessReviewToDocx(
    {
      title: "招投标文件审核意见",
      subject: "招投标文件智能辅助审核",
      fileName: "招投标文件审核意见_" + result.taskId + ".docx",
      info: [
        ["审核文件", result.files.join("、")],
        ["问题数量", String(result.summary.total)],
      ],
      summary:
        "共定位" +
        result.summary.total +
        "项要求，其中高风险" +
        result.summary.high +
        "项、中风险" +
        result.summary.medium +
        "项、低风险" +
        result.summary.low +
        "项。",
      issues: result.requirements.map((item) => ({
        id: item.id,
        category: item.category,
        location: item.location,
        severity: item.severity,
        originalText: item.originalText,
        issue: "招投标文件要求或风险事项",
        suggestion: item.responseSuggestion,
      })),
      disclaimer: result.disclaimer,
    },
    outputPath,
  )
}
function classify(text: string): TenderRequirement["category"] | undefined {
  if (/废标|否决投标|无效投标/.test(text)) return "rejection"
  if (/评分|得分|加分|分值/.test(text)) return "scoring"
  if (/资质|资格|业绩|证书|社保|授权委托/.test(text)) return "qualification"
  if (/报价|限价|付款|保证金|履约|商务/.test(text)) return "commercial"
  if (/技术|设备|人员|HSE|质量|服务范围|工作量|接口/.test(text)) return "technical"
  if (/证明材料|响应文件|签字|盖章|签章/.test(text)) return "evidence"
  return undefined
}

function suggestion(category: TenderRequirement["category"], severity: TenderRequirement["severity"]) {
  if (category === "rejection") return "建立废标点逐项核对表，由两人交叉检查响应位置、签章和证明材料。"
  if (category === "scoring") return "将评分点拆成可验证响应项，明确对应证据、页码和得分支撑材料。"
  if (category === "qualification") return "核验投标主体、证书有效期、业绩范围及人员社保的一致性。"
  if (severity === "high") return "按硬性要求逐条响应并标注证据位置，不满足时立即提交项目负责人决策。"
  return "在投标响应中逐项说明满足方式，并附可定位的证明材料。"
}

function summarize(requirements: TenderRequirement[]) {
  return {
    total: requirements.length,
    high: requirements.filter((item) => item.severity === "high").length,
    medium: requirements.filter((item) => item.severity === "medium").length,
    low: requirements.filter((item) => item.severity === "low").length,
  }
}

function requirementsHash(value: string) {
  return String([...value].reduce((total, char) => (total * 31 + char.charCodeAt(0)) % 997, 0)).padStart(3, "0")
}

function state(sessionId: string, taskId: string, value: "reading" | "reviewing" | "success" | "error", message: string) {
  return { event: "agent_state_changed" as const, type: "xiaoxue.agent.state" as const, agent: "tender" as const, sessionId, taskId, state: value, message, timestamp: Date.now() }
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error))
}
