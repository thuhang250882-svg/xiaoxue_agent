import type { XiaoxueCompletionScope, XiaoxuePetState, XiaoxueState } from "../preload/types"

const states = new Set<XiaoxueState>([
  "idle",
  "waiting",
  "listen",
  "speaking",
  "thinking",
  "searching",
  "reading",
  "writing",
  "reviewing",
  "success",
  "celebrate",
  "warning",
  "error",
])

const completionScopes = new Set<XiaoxueCompletionScope>(["task", "milestone", "project"])

export function normalizePetState(value: unknown): XiaoxuePetState | undefined {
  if (!value || typeof value !== "object") return
  const input = value as Record<string, unknown>
  if (!states.has(input.state as XiaoxueState)) return
  const completionScope = completionScopes.has(input.completionScope as XiaoxueCompletionScope)
    ? (input.completionScope as XiaoxueCompletionScope)
    : undefined
  const state = input.state === "success" && completionScope !== "task" && completionScope
    ? "celebrate"
    : input.state as XiaoxueState
  return {
    event: "agent_state_changed",
    state,
    message: typeof input.message === "string" ? input.message : "",
    timestamp: typeof input.timestamp === "number" ? input.timestamp : Date.now(),
    agent: typeof input.agent === "string" ? input.agent : undefined,
    taskId: typeof input.taskId === "string" ? input.taskId : undefined,
    sessionId: typeof input.sessionId === "string" ? input.sessionId : undefined,
    completionScope,
    progress: typeof input.progress === "number" ? Math.max(0, Math.min(100, input.progress)) : undefined,
    issueCount: typeof input.issueCount === "number" ? Math.max(0, Math.floor(input.issueCount)) : undefined,
  }
}
