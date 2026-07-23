import type { AgentId } from "./constants"

export type AgentState = "idle" | "reading" | "reviewing" | "thinking" | "writing" | "searching" | "success" | "celebrate" | "warning" | "error"

export type AgentStateEvent = {
  event: "agent_state_changed"
  agent: AgentId
  state: AgentState
  message: string
  timestamp?: number
}

export type AgentEventHandler = (event: AgentStateEvent) => void
