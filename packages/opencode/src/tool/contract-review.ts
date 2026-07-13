import { mkdir } from "node:fs/promises"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { Effect, Schema } from "effect"
import { exportBusinessReviewToDocx } from "../../../../document_engine"
import type { ParsedDocument } from "../../../../document_engine"
import { Tool } from "./tool"
import { latestUserAttachments, parseAttachments } from "./xiaoxue-attachments"

const Stance = Schema.Literals(["party_a", "party_b", "balanced"])
const Parameters = Schema.Struct({
  stance: Stance,
  contractType: Schema.optional(Schema.String),
  focus: Schema.optional(Schema.String),
  fileName: Schema.optional(Schema.String),
  outputFormat: Schema.optional(Schema.Literals(["json", "docx"])),
})

export type ContractIssue = {
  id: string
  category: string
  location: string
  originalClause: string
  risk: string
  severity: "high" | "medium" | "low"
  suggestion: string
  basis: string
  needHumanConfirm: boolean
}

export type ContractReviewResult = {
  type: "contract_review_result"
  taskId: string
  fileName: string
  stance: Schema.Schema.Type<typeof Stance>
  contractType?: string
  summary: { total: number; high: number; medium: number; low: number }
  issues: ContractIssue[]
  negotiation: { must: string[]; important: string[]; optional: string[] }
  disclaimer: string
  exportedFile?: Awaited<ReturnType<typeof exportBusinessReviewToDocx>>
}

export const ContractReviewTool = Tool.define(
  "contract_review",
  Effect.succeed({
    description:
      "基于当前上传合同进行证据化风险审查。调用时必须明确我方立场 party_a、party_b 或 balanced；只引用当前合同原文，不使用历史案例替代合同事实。",
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) => {
      const taskId = `contract-${Date.now()}`
      return Effect.tryPromise({
        try: async () => {
          await Effect.runPromise(ctx.metadata({ title: "合同风险审核", metadata: state(ctx.sessionID, taskId, "reading", "正在读取当前合同条款...") }))
          const documents = await parseAttachments(latestUserAttachments(ctx.messages), [".docx", ".txt", ".md"])
          const document = selectContract(documents, params.fileName)
          await Effect.runPromise(ctx.metadata({ title: "合同风险审核", metadata: state(ctx.sessionID, taskId, "reviewing", "正在检查范围、验收、付款、违约、HSE和成果归属...") }))
          const result = reviewContractDocument(document, { ...params, taskId })
          if (params.outputFormat === "docx") {
            const outputPath = path.join(Global.Path.data, "exports", "contract")
            await mkdir(outputPath, { recursive: true })
            result.exportedFile = await exportContractReviewResult(result, outputPath)
          }
          await Effect.runPromise(ctx.metadata({ title: "合同风险审核", metadata: state(ctx.sessionID, taskId, "success", `合同审核完成，共识别 ${result.summary.total} 项需关注事项。`) }))
          return {
            title: "合同风险审核",
            output: JSON.stringify(result),
            metadata: { ...state(ctx.sessionID, taskId, "success", "合同审核完成。"), result },
          }
        },
        catch: toError,
      }).pipe(
        Effect.catch((error) =>
          ctx.metadata({ title: "合同风险审核失败", metadata: state(ctx.sessionID, taskId, "error", error.message) }).pipe(
            Effect.as({
              title: "合同风险审核失败",
              output: JSON.stringify({ type: "contract_review_error", taskId, error: error.message }),
              metadata: state(ctx.sessionID, taskId, "error", error.message),
            }),
          ),
        ),
      )
    },
  }),
)

export function reviewContractDocument(
  document: ParsedDocument,
  input: { stance: Schema.Schema.Type<typeof Stance>; contractType?: string; focus?: string; taskId?: string },
): ContractReviewResult {
  const found = document.paragraphs.flatMap((paragraph) =>
    riskPatterns(input.stance).flatMap((rule) => {
      if (!rule.pattern.test(paragraph.text)) return []
      return [{
        id: `CONTRACT-${rule.id}-${String(paragraph.index).padStart(3, "0")}`,
        category: rule.category,
        location: paragraph.location ?? `正文第 ${paragraph.index} 段`,
        originalClause: paragraph.text.slice(0, 700),
        risk: rule.risk,
        severity: rule.severity,
        suggestion: rule.suggestion,
        basis: `当前合同“${document.fileName}”${paragraph.location ?? `正文第 ${paragraph.index} 段`}原文`,
        needHumanConfirm: true,
      } satisfies ContractIssue]
    }),
  )
  const missing = requiredClauses(input.contractType).flatMap((rule) => {
    if (rule.pattern.test(document.rawText)) return []
    return [{
      id: `CONTRACT-MISSING-${rule.id}`,
      category: "缺失条款",
      location: "合同全文",
      originalClause: "",
      risk: `当前合同未识别到“${rule.label}”相关约定，权利义务边界可能不完整。`,
      severity: rule.severity,
      suggestion: rule.suggestion,
      basis: `对当前合同“${document.fileName}”全文进行关键词检查，未检索到对应条款；需人工复核。`,
      needHumanConfirm: true,
    } satisfies ContractIssue]
  })
  const focus = input.focus && !document.rawText.includes(input.focus) ? [{
    id: "CONTRACT-FOCUS-001",
    category: "用户关注点",
    location: "合同全文",
    originalClause: "",
    risk: `未在当前合同中直接定位用户关注点：“${input.focus}”。`,
    severity: "medium" as const,
    suggestion: "请确认合同是否使用了其他表述，或补充相关附件后再次审核。",
    basis: `当前合同“${document.fileName}”全文检索结果`,
    needHumanConfirm: true,
  }] : []
  const issues = deduplicate([...found, ...missing, ...focus])
  return {
    type: "contract_review_result",
    taskId: input.taskId ?? `contract-${Date.now()}`,
    fileName: document.fileName,
    stance: input.stance,
    contractType: input.contractType,
    summary: summarize(issues),
    issues,
    negotiation: {
      must: issues.filter((item) => item.severity === "high").map((item) => item.id),
      important: issues.filter((item) => item.severity === "medium").map((item) => item.id),
      optional: issues.filter((item) => item.severity === "low").map((item) => item.id),
    },
    disclaimer: "本结果仅为基于当前合同文本的智能辅助审查，不构成法律意见；签署、谈判和重大风险处置须由业务负责人、法务或执业律师复核。",
  }
}

export function exportContractReviewResult(result: ContractReviewResult, outputPath: string) {
  const stance = { party_a: "甲方", party_b: "乙方", balanced: "平衡审查" }[result.stance]
  return exportBusinessReviewToDocx(
    {
      title: "合同审核意见",
      subject: "合同风险智能辅助审核",
      fileName: result.fileName.replace(/\.[^.]+$/, "") + "_合同审核意见.docx",
      info: [
        ["审核文件", result.fileName],
        ["我方立场", stance],
        ["合同类型", result.contractType ?? "未指定"],
      ],
      summary:
        "共识别" +
        result.summary.total +
        "项需关注事项，其中高风险" +
        result.summary.high +
        "项、中风险" +
        result.summary.medium +
        "项、低风险" +
        result.summary.low +
        "项。",
      issues: result.issues.map((item) => ({
        id: item.id,
        category: item.category,
        location: item.location,
        severity: item.severity,
        originalText: item.originalClause,
        issue: item.risk,
        suggestion: item.suggestion,
        basis: item.basis,
      })),
      disclaimer: result.disclaimer,
    },
    outputPath,
  )
}
function selectContract(documents: ParsedDocument[], requested?: string) {
  if (!requested) return documents.find((document) => document.fileType === "docx") ?? documents[0]
  const selected = documents.find((document) => document.fileName.toLowerCase() === requested.toLowerCase())
  if (!selected) throw new Error(`没有找到指定合同附件“${requested}”。`)
  return selected
}

function riskPatterns(stance: Schema.Schema.Type<typeof Stance>) {
  return [
    { id: "PAYMENT", category: "付款条件", pattern: /付款.{0,20}(审计|结算).{0,20}(后|条件)|以上游付款|最终结算后付款|审计完成后付款|甲方资金到位后/, risk: "付款条件依赖第三方或甲方内部流程，回款时间不可控。", severity: "high" as const, suggestion: "改为明确付款节点和最迟付款期限，并约定逾期付款责任。" },
    { id: "ACCEPTANCE", category: "验收", pattern: /以甲方认可为准|甲方满意|无条件通过甲方验收/, risk: "验收标准带有较强主观性，可能导致验收或结算被无限延后。", severity: "high" as const, suggestion: "补充可量化验收指标、验收期限和逾期未反馈的处理机制。" },
    { id: "SCOPE", category: "服务范围", pattern: /甲方要求的其他工作|无条件配合|包括但不限于/, risk: "服务范围存在开放式表述，可能形成无偿增项。", severity: "medium" as const, suggestion: "锁定服务清单，并约定范围外工作须书面变更及调整费用和工期。" },
    { id: "TERMINATION", category: "解除与终止", pattern: /甲方有权随时解除|甲方可单方终止|无条件解除/, risk: "单方解除权缺少补偿和结算机制。", severity: "high" as const, suggestion: "增加提前通知、已完成工作结算、撤场费用及合理损失补偿。" },
    { id: "PENALTY", category: "违约责任", pattern: /违约金.{0,12}(30%|百分之三十|50%|百分之五十)|每日.{0,8}(千分之|1%)/, risk: "违约金比例可能偏高，需要结合合同金额、实际损失和双方责任对等性评估。", severity: "medium" as const, suggestion: "核算最大责任敞口，设置累计上限并保持双方违约责任基本对等。" },
    ...(stance === "party_b" || stance === "balanced" ? [{ id: "IP", category: "成果与知识产权", pattern: /全部成果.{0,20}归甲方|所有知识产权.{0,20}归甲方|源代码.{0,12}无偿交付/, risk: "条款可能将乙方背景知识、工具、算法和通用能力一并转让。", severity: "high" as const, suggestion: "区分原始数据、项目成果和乙方背景知识产权，明确使用许可范围。" }] : []),
  ]
}

function requiredClauses(contractType?: string) {
  const fieldService = /录井|钻井|驻井|技术服务|信息化|检测|导向/.test(contractType ?? "")
  return [
    { id: "NOTICE", label: "通知送达", pattern: /通知|送达/, severity: "medium" as const, suggestion: "补充有效送达地址、电子送达方式和变更通知机制。" },
    { id: "CHANGE", label: "变更与签证", pattern: /变更|签证/, severity: "medium" as const, suggestion: "补充工作范围、费用和工期变更的书面确认流程。" },
    { id: "CONFIDENTIAL", label: "保密与数据使用", pattern: /保密|秘密信息|数据安全/, severity: "medium" as const, suggestion: "明确保密范围、例外、期限、数据使用边界和违约责任。" },
    ...(fieldService ? [
      { id: "HSE", label: "HSE与安全责任", pattern: /HSE|安全生产|安全责任/, severity: "high" as const, suggestion: "补充双方安全管理边界、培训、事故报告、应急处置和保险要求。" },
      { id: "ACCEPTANCE", label: "量化验收标准", pattern: /验收标准|质量标准|考核指标/, severity: "high" as const, suggestion: "补充可量化的服务质量、资料交付和验收时限。" },
    ] : []),
  ]
}

function deduplicate(issues: ContractIssue[]) {
  return [...new Map(issues.map((item) => [`${item.category}\0${item.location}\0${item.risk}`, item])).values()]
}

function summarize(issues: ContractIssue[]) {
  return { total: issues.length, high: issues.filter((item) => item.severity === "high").length, medium: issues.filter((item) => item.severity === "medium").length, low: issues.filter((item) => item.severity === "low").length }
}

function state(sessionId: string, taskId: string, value: "reading" | "reviewing" | "success" | "error", message: string) {
  return { event: "agent_state_changed" as const, type: "xiaoxue.agent.state" as const, agent: "contract" as const, sessionId, taskId, state: value, message, timestamp: Date.now() }
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error))
}
