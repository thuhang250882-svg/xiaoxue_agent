import type { DocumentTemplate, WritingStyle } from "./types"

export const COMPANY_WRITING_STYLE: WritingStyle = {
  tone: "稳健、专业、清晰、适合公司内部流转",
  preference: [
    "先讲事实和背景，再讲问题和措施",
    "使用公司汇报常见表达，避免空泛口号",
    "重要结论前置，关键数据保留",
    "对外材料保持正式，对内材料保持简洁可执行",
  ],
}

export const DEFAULT_TEMPLATES: Record<string, DocumentTemplate> = {
  work_summary: {
    id: "work_summary",
    name: "工作总结",
    sections: ["背景", "主要工作", "取得成效", "存在问题", "下一步计划"],
    style: COMPANY_WRITING_STYLE,
  },
  work_report: {
    id: "work_report",
    name: "工作汇报",
    sections: ["总体情况", "重点进展", "问题分析", "已采取措施", "下一步安排", "需协调事项"],
    style: COMPANY_WRITING_STYLE,
  },
  work_plan: {
    id: "work_plan",
    name: "工作计划",
    sections: ["总体目标", "重点任务", "进度安排", "保障措施", "预期成果"],
    style: COMPANY_WRITING_STYLE,
  },
  technical_plan: {
    id: "technical_plan",
    name: "技术方案",
    sections: ["背景与目标", "需求分析", "总体方案", "实施内容", "进度计划", "保障措施", "验收标准"],
    style: COMPANY_WRITING_STYLE,
  },
  project_application: {
    id: "project_application",
    name: "项目申报材料",
    sections: ["项目背景", "必要性", "建设目标", "研究内容", "技术路线", "创新点", "实施计划", "预期成果"],
    style: COMPANY_WRITING_STYLE,
  },
  table_summary: {
    id: "table_summary",
    name: "数据汇总",
    sections: ["统计口径", "数据汇总", "异常事项", "主要结论"],
    style: COMPANY_WRITING_STYLE,
  },  meeting_minutes: {
    id: "meeting_minutes",
    name: "会议纪要",
    sections: ["会议基本信息", "会议议题", "讨论内容", "会议决议", "待办事项"],
    style: COMPANY_WRITING_STYLE,
  },
  rectification_list: {
    id: "rectification_list",
    name: "整改清单",
    sections: ["问题描述", "责任单位", "整改措施", "完成时限", "验收标准"],
    style: COMPANY_WRITING_STYLE,
  },
  project_proposal: {
    id: "project_proposal",
    name: "立项背景",
    sections: ["项目背景", "现状分析", "必要性", "预期目标", "实施计划", "资源需求"],
    style: COMPANY_WRITING_STYLE,
  },
  technical_report: {
    id: "technical_report",
    name: "技术报告",
    sections: ["概述", "技术方案", "实施过程", "测试结果", "结论与建议"],
    style: COMPANY_WRITING_STYLE,
  },
}

export const DEFAULT_STRUCTURE = [
  "背景",
  "现状",
  "存在问题",
  "原因分析",
  "采取措施",
  "下一步计划",
  "预期效果",
]

export function getTemplate(taskType: string): DocumentTemplate {
  return DEFAULT_TEMPLATES[taskType] ?? DEFAULT_TEMPLATES.work_summary
}
