import type { XiaoxueState } from "@opencode-ai/app"

export const XIAOXUE_STATE_VIEW: Record<XiaoxueState, { title: string; action: string; progress: number }> = {
  idle: { title: "小雪待命中", action: "等待你的任务", progress: 0 },
  listen: { title: "小雪正在倾听", action: "正在理解你的需求", progress: 8 },
  thinking: { title: "小雪正在思考", action: "正在整理判断和修改建议", progress: 72 },
  searching: { title: "小雪正在查资料", action: "正在检索制度、标准和历史资料", progress: 42 },
  reading: { title: "小雪正在读报告", action: "正在提取正文、表格和基础信息", progress: 24 },
  writing: { title: "小雪正在写材料", action: "正在组织公司常用文档结构", progress: 66 },
  reviewing: { title: "小雪正在审核", action: "正在检查结构、井号、层位和油气显示", progress: 55 },
  success: { title: "任务已完成", action: "结果已经整理完成", progress: 100 },
  warning: { title: "发现待确认内容", action: "部分专业判断需要人工确认", progress: 88 },
  error: { title: "任务遇到问题", action: "请检查文件、模型或输入资料", progress: 0 },
}
