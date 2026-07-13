import type { XiaoxuePetState, XiaoxueState } from "../preload/types"

const states = new Set<XiaoxueState>([
  "idle",
  "listen",
  "thinking",
  "searching",
  "reading",
  "writing",
  "reviewing",
  "success",
  "warning",
  "error",
])

export function normalizePetState(value: unknown): XiaoxuePetState | undefined {
  if (!value || typeof value !== "object") return
  const input = value as Record<string, unknown>
  if (!states.has(input.state as XiaoxueState)) return
  return {
    event: "agent_state_changed",
    state: input.state as XiaoxueState,
    message: typeof input.message === "string" ? input.message : "",
    timestamp: typeof input.timestamp === "number" ? input.timestamp : Date.now(),
    agent: typeof input.agent === "string" ? input.agent : undefined,
    taskId: typeof input.taskId === "string" ? input.taskId : undefined,
    sessionId: typeof input.sessionId === "string" ? input.sessionId : undefined,
    progress: typeof input.progress === "number" ? Math.max(0, Math.min(100, input.progress)) : undefined,
    issueCount: typeof input.issueCount === "number" ? Math.max(0, Math.floor(input.issueCount)) : undefined,
  }
}
