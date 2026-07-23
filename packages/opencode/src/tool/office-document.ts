import { mkdir } from "node:fs/promises"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { Effect, Schema } from "effect"
import { exportOfficeTaskResultToDocx } from "../../../../domains/office"
import type { OfficeTaskType } from "../../../../domains/office"
import { Tool } from "./tool"

const TaskType = Schema.Literals([
  "work_summary",
  "work_report",
  "meeting_minutes",
  "rectification_list",
  "work_plan",
  "technical_plan",
  "project_application",
  "document_polish",
  "table_summary",
])

const OutputFormat = Schema.Literals(["markdown", "docx", "xlsx"])

const Attachment = Schema.Struct({
  fileName: Schema.String,
  sourcePath: Schema.optional(Schema.String),
})

const Parameters = Schema.Struct({
  taskType: TaskType,
  title: Schema.optional(Schema.String),
  instructions: Schema.optional(Schema.String),
  attachments: Schema.optional(Schema.Array(Attachment)),
  templateId: Schema.optional(Schema.String),
  outputFormat: Schema.optional(OutputFormat),
})

export type OfficeDocumentInput = Schema.Schema.Type<typeof Parameters>

export type OfficeDocumentActionItem = {
  id: string
  task: string
  owner?: string
  deadline?: string
  status: "pending"
}

export type OfficeDocumentResult = {
  type: "office_document_result"
  taskId: string
  taskType: OfficeTaskType
  title: string
  content: string
  actionItems: OfficeDocumentActionItem[]
  sourceFiles: Array<{ fileName: string; sourcePath?: string }>
  exportedFile?: {
    filePath: string
    fileName: string
    format: "docx"
    mimeType: string
    size: number
  }
  warning?: string
}

const TASK_TITLES: Record<OfficeTaskType, string> = {
  work_summary: "工作总结",
  work_report: "工作汇报",
  meeting_minutes: "会议纪要",
  rectification_list: "整改清单",
  work_plan: "工作计划",
  technical_plan: "技术方案",
  project_application: "项目申报材料",
  document_polish: "材料润色稿",
  table_summary: "数据汇总",
}

export const OfficeDocumentTool = Tool.define<
  typeof Parameters,
  Record<string, unknown>,
  never,
  "office_document"
>(
  "office_document",
  Effect.succeed({
    description:
      "生成工作总结、工作汇报、会议纪要、整改清单、工作计划、技术方案、项目申报或润色稿，并可导出公司默认版式 DOCX。",
    parameters: Parameters,
    execute: (params: OfficeDocumentInput, ctx: Tool.Context) =>
      Effect.gen(function* () {
        const taskId = `office-${Date.now()}`
        const sourceFiles = mergeSourceFiles(params.attachments ?? [], latestUserAttachments(ctx.messages))
        const instructions = params.instructions?.trim() || latestUserText(ctx.messages) || "【待补充原始材料】"

        yield* ctx.metadata({
          title: "日常办公",
          metadata: officeState(ctx.sessionID, taskId, "listen", "小雪正在理解办公任务和材料用途..."),
        })
        yield* ctx.metadata({
          title: "日常办公",
          metadata: officeState(ctx.sessionID, taskId, "thinking", "小雪正在整理事实、结构和待办事项..."),
        })

        const result = createOfficeDocumentDraft(
          {
            ...params,
            instructions,
          },
          taskId,
          sourceFiles,
        )

        yield* ctx.metadata({
          title: "日常办公",
          metadata: officeState(ctx.sessionID, taskId, "writing", "小雪正在生成办公材料..."),
        })

        if ((params.outputFormat ?? "markdown") === "docx") {
          const outputPath = path.join(Global.Path.data, "exports", "office")
          yield* Effect.tryPromise({
            try: () => mkdir(outputPath, { recursive: true }),
            catch: toError,
          })
          result.exportedFile = yield* Effect.tryPromise({
            try: () => exportOfficeDocumentDraft(result, outputPath),
            catch: toError,
          })
        }
        if (params.outputFormat === "xlsx") {
          result.warning = "第一批 office_document 暂不生成 XLSX，已返回结构化内容；XLSX 导出将在后续阶段实现。"
        }

        yield* ctx.metadata({
          title: "日常办公",
          metadata: officeState(ctx.sessionID, taskId, "success", "办公材料已生成。"),
        })

        return {
          title: result.title,
          output: JSON.stringify(result),
          metadata: {
            type: result.type,
            taskId,
            taskType: result.taskType,
            actionItems: result.actionItems,
            sourceFiles: result.sourceFiles,
            exportedFile: result.exportedFile,
            state: "success",
            sessionId: ctx.sessionID,
          },
        }
      }).pipe(
        Effect.catch((error) => {
          const taskId = `office-${Date.now()}`
          const message = error instanceof Error ? error.message : String(error)
          return ctx
            .metadata({
              title: "日常办公失败",
              metadata: officeState(ctx.sessionID, taskId, "error", message),
            })
            .pipe(
              Effect.as({
                title: "日常办公失败",
                output: JSON.stringify({ type: "office_document_error", taskId, error: message }),
                metadata: officeState(ctx.sessionID, taskId, "error", message),
              }),
            )
        }),
      ),
  }),
)

export function createOfficeDocumentDraft(
  input: OfficeDocumentInput & { instructions: string },
  taskId = `office-${Date.now()}`,
  sourceFiles: Array<{ fileName: string; sourcePath?: string }> = [],
): OfficeDocumentResult {
  const title = input.title?.trim() || TASK_TITLES[input.taskType]
  const actionItems = input.taskType === "meeting_minutes" ? extractActionItems(input.instructions) : []
  return {
    type: "office_document_result",
    taskId,
    taskType: input.taskType,
    title,
    content: buildContent(input.taskType, title, input.instructions, actionItems),
    actionItems,
    sourceFiles,
  }
}

export async function exportOfficeDocumentDraft(result: OfficeDocumentResult, outputPath: string) {
  return exportOfficeTaskResultToDocx(
    {
      taskId: result.taskId,
      taskType: result.taskType,
      content: result.content,
    },
    {
      title: result.title,
      fileName: `${result.title}.docx`,
      outputPath,
    },
  )
}

function buildContent(
  taskType: OfficeTaskType,
  title: string,
  source: string,
  actionItems: OfficeDocumentActionItem[],
) {
  if (taskType === "meeting_minutes") return meetingMinutes(title, source, actionItems)
  if (taskType === "rectification_list") return rectificationList(title, source)
  if (taskType === "document_polish") return `# ${title}\n\n## 润色稿\n\n${source}`

  const sections: Record<Exclude<OfficeTaskType, "meeting_minutes" | "rectification_list" | "document_polish">, string[]> = {
    work_summary: ["基本情况", "主要工作", "取得成效", "存在问题", "下一步计划"],
    work_report: ["总体情况", "重点进展", "问题分析", "已采取措施", "下一步安排", "需协调事项"],
    work_plan: ["总体目标", "重点任务", "进度安排", "保障措施", "预期成果"],
    technical_plan: ["背景与目标", "需求分析", "总体方案", "实施内容", "进度计划", "保障措施", "验收标准"],
    project_application: ["项目背景", "必要性", "建设目标", "研究内容", "技术路线", "创新点", "实施计划", "预期成果"],
    table_summary: ["统计口径", "数据汇总", "异常事项", "主要结论"],
  }
  return [
    `# ${title}`,
    "",
    ...sections[taskType].flatMap((section, index) => [
      `## ${section}`,
      "",
      index === 0 ? source : "【待补充】",
      "",
    ]),
  ].join("\n").trim()
}

function meetingMinutes(title: string, source: string, actionItems: OfficeDocumentActionItem[]) {
  const date = taggedValue(source, ["时间", "日期"])
  const attendees = taggedValue(source, ["参会人员", "与会人员"])
  const topic = taggedValue(source, ["会议主题", "主题"])
  return [
    `# ${title}`,
    "",
    "## 会议基本信息",
    "",
    `- 会议主题：${topic ?? "【待补充】"}`,
    `- 时间：${date ?? "【待补充】"}`,
    `- 参会人员：${attendees ?? "【待补充】"}`,
    "",
    "## 主要议题与讨论",
    "",
    source,
    "",
    "## 会议结论",
    "",
    "【待确认会议正式结论】",
    "",
    "## 待办事项",
    "",
    ...(actionItems.length
      ? actionItems.map(
          (item, index) =>
            `${index + 1}. ${item.task}；责任人：${item.owner ?? "【待补充】"}；完成时限：${item.deadline ?? "【待补充】"}；状态：待办`,
        )
      : ["【待补充待办事项】"]),
  ].join("\n")
}

function rectificationList(title: string, source: string) {
  return [
    `# ${title}`,
    "",
    "| 编号 | 问题 | 原因 | 整改措施 | 责任人 | 完成期限 | 当前状态 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    `| 1 | ${singleLine(source)} | 【待分析】 | 【待补充】 | 【待补充】 | 【待补充】 | 待整改 |`,
  ].join("\n")
}

function extractActionItems(source: string): OfficeDocumentActionItem[] {
  return source
    .split(/\r?\n|。/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line, index) => {
      const task = line.match(/(?:待办事项|待办|任务)[:：]\s*([^，,；;]+)/)?.[1]?.trim()
      if (!task) return []
      return [
        {
          id: `ACTION-${String(index + 1).padStart(3, "0")}`,
          task,
          owner: line.match(/责任人[:：]\s*([^，,；;]+)/)?.[1]?.trim(),
          deadline: line.match(/(?:完成时限|截止时间|期限)[:：]\s*([^，,；;]+)/)?.[1]?.trim(),
          status: "pending" as const,
        },
      ]
    })
}

function taggedValue(source: string, labels: string[]) {
  return labels
    .map((label) => source.match(new RegExp(`${label}[:：]\\s*([^\\n；;]+)`))?.[1]?.trim())
    .find(Boolean)
}

function singleLine(value: string) {
  return value.replace(/\s+/g, " ").replaceAll("|", "｜").trim() || "【待补充】"
}

function latestUserText(messages: Tool.Context["messages"]) {
  const message = [...messages].reverse().find((item) => item.info.role === "user")
  if (!message) return ""
  return message.parts
    .filter((part): part is Extract<(typeof message.parts)[number], { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n")
}

function latestUserAttachments(messages: Tool.Context["messages"]) {
  const message = [...messages].reverse().find((item) => item.info.role === "user")
  if (!message) return []
  return message.parts
    .filter((part): part is Extract<(typeof message.parts)[number], { type: "file" }> => part.type === "file")
    .map((part) => ({
      fileName: part.filename ?? "未命名附件",
      sourcePath: part.source?.type === "file" ? part.source.path : undefined,
    }))
}

function mergeSourceFiles(
  configured: ReadonlyArray<{ fileName: string; sourcePath?: string }>,
  current: ReadonlyArray<{ fileName: string; sourcePath?: string }>,
) {
  return [
    ...new Map([...configured, ...current].map((item) => [`${item.fileName}\0${item.sourcePath ?? ""}`, item])).values(),
  ]
}

function officeState(
  sessionId: string,
  taskId: string,
  state: "listen" | "thinking" | "writing" | "success" | "error",
  message: string,
) {
  return {
    event: "agent_state_changed" as const,
    type: "xiaoxue.agent.state" as const,
    agent: "office" as const,
    sessionId,
    taskId,
    state,
    message,
    timestamp: Date.now(),
  }
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error))
}