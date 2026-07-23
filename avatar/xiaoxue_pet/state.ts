export type XiaoxueState =
  | "idle"
  | "waiting"
  | "listen"
  | "speaking"
  | "thinking"
  | "searching"
  | "reading"
  | "writing"
  | "reviewing"
  | "success"
  | "celebrate"
  | "warning"
  | "error"

export const XIAOXUE_ACTION_MAP: Record<XiaoxueState, string> = {
  idle: "等待任务",
  waiting: "等待结果",
  listen: "倾听需求",
  speaking: "说明结果",
  thinking: "整理判断",
  searching: "检索资料",
  reading: "读取资料",
  writing: "撰写材料",
  reviewing: "执行审核",
  success: "任务完成",
  celebrate: "庆祝成果",
  warning: "需要确认",
  error: "处理失败",
}

export type XiaoxueAgentStateEvent = {
  event: "agent_state_changed"
  type?: "xiaoxue.agent.state"
  taskId?: string
  sessionId?: string
  agent: "office" | "report" | "knowledge" | "xiaoxue"
  state: XiaoxueState
  message: string
  timestamp?: number
}