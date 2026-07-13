import type { OfficeTaskInput, OfficeTaskResult, OfficeAgentState } from "./types"
import { COMPANY_WRITING_STYLE, getTemplate, DEFAULT_STRUCTURE } from "./templates"
import { ReviewError } from "../shared"

const STATE_MESSAGES: Record<OfficeAgentState, string> = {
  idle: "等待办公任务",
  listen: "正在理解办公任务和材料用途...",
  reading: "正在读取资料...",
  writing: "正在起草办公材料...",
  thinking: "正在整理结构和措辞...",
  searching: "正在查询制度和历史材料...",
  success: "办公任务已完成。",
  error: "办公任务处理失败，请稍后重试。",
}

export async function processOfficeTask(input: OfficeTaskInput): Promise<OfficeTaskResult> {
  try {
    emit(input, "reading")
    const context = gatherContext(input)

    emit(input, "thinking")
    const template = getTemplate(input.taskType)

    emit(input, "writing")
    const content = generateContent(input.taskType, context, template)

    emit(input, "success")

    return {
      taskId: `office-${Date.now()}`,
      taskType: input.taskType,
      content,
      metadata: {
        template: template.id,
        style: template.style.tone,
        documentFormat: "company_reporting_default",
        exporter: "exportOfficeTaskResultToDocx",
      },
    }
  } catch (error) {
    emit(input, "error", error instanceof Error ? error.message : "未知错误")
    throw new ReviewError(error instanceof Error ? error.message : "办公任务处理失败", "RULE_ERROR", error)
  }
}

function gatherContext(input: OfficeTaskInput): Record<string, unknown> {
  const context: Record<string, unknown> = {
    ...input.context,
  }

  if (input.document) {
    context.documentContent = input.document.rawText
    context.tables = input.document.tables
    context.paragraphs = input.document.paragraphs
  }

  return context
}

function generateContent(
  taskType: string,
  context: Record<string, unknown>,
  template: { sections: string[]; style: typeof COMPANY_WRITING_STYLE },
): string {
  const sections = template.sections

  const contentParts = sections.map((section) => {
    const sectionContent = extractSectionContent(section, context)
    return `## ${section}\n\n${sectionContent}`
  })

  return contentParts.join("\n\n")
}

function extractSectionContent(section: string, context: Record<string, unknown>): string {
  const sectionKey = section.toLowerCase().replace(/\s+/g, "_")

  if (context[sectionKey]) {
    return String(context[sectionKey])
  }

  // Generate placeholder based on section type
  switch (section) {
    case "背景":
      return generateBackground(context)
    case "主要工作":
    case "现状":
      return generateCurrentStatus(context)
    case "存在问题":
    case "挑战":
      return generateProblems(context)
    case "下一步计划":
      return generateNextSteps(context)
    case "会议决议":
    case "待办事项":
      return generateActionItems(context)
    default:
      return `[待补充${section}内容]`
  }
}

function generateBackground(context: Record<string, unknown>): string {
  if (context.documentContent) {
    const content = String(context.documentContent)
    const firstParagraph = content.split("\n").find((p) => p.trim().length > 20)
    return firstParagraph ?? "[待补充背景信息]"
  }
  return "[待补充背景信息]"
}

function generateCurrentStatus(context: Record<string, unknown>): string {
  if (context.documentContent) {
    const content = String(context.documentContent)
    const paragraphs = content.split("\n").filter((p) => p.trim().length > 10)
    return paragraphs.slice(0, 3).join("\n\n") || "[待补充现状描述]"
  }
  return "[待补充现状描述]"
}

function generateProblems(context: Record<string, unknown>): string {
  if (context.issues && Array.isArray(context.issues)) {
    return (context.issues as Array<{ issue: string }>).map((item, index) => `${index + 1}. ${item.issue}`).join("\n")
  }
  return "[待补充存在问题]"
}

function generateNextSteps(context: Record<string, unknown>): string {
  if (context.nextSteps && Array.isArray(context.nextSteps)) {
    return (context.nextSteps as string[]).map((step, index) => `${index + 1}. ${step}`).join("\n")
  }
  return "[待补充下一步计划]"
}

function generateActionItems(context: Record<string, unknown>): string {
  if (context.actionItems && Array.isArray(context.actionItems)) {
    return (context.actionItems as Array<{ task: string; owner: string; deadline?: string }>)
      .map(
        (item, index) =>
          `${index + 1}. **${item.task}** - 负责人：${item.owner}${item.deadline ? `，截止时间：${item.deadline}` : ""}`,
      )
      .join("\n")
  }
  return "[待补充待办事项]"
}

function emit(input: OfficeTaskInput, state: OfficeAgentState, errorMessage?: string) {
  const event = {
    event: "agent_state_changed" as const,
    agent: "office" as const,
    state,
    message: state === "error" && errorMessage ? errorMessage : STATE_MESSAGES[state],
  }
  input.onEvent?.(event)
}

export function getWritingStyle() {
  return COMPANY_WRITING_STYLE
}

export function getDefaultStructure() {
  return DEFAULT_STRUCTURE
}
