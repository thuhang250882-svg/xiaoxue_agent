import type { XiaoxuePetAction, XiaoxuePetState } from "../preload/types"
import { normalizePetState } from "./PetStateMapper"

export function bindMainWindowPetBridge(onUnhandledAction?: (action: XiaoxuePetAction) => void) {
  const handleState = (event: Event) => {
    const state = normalizePetState((event as CustomEvent).detail)
    if (state) {
      window.api.xiaoxuePet.publishState(state)
      // Forward error/success results to pet window
      if (state.state === "error" && state.taskId) {
        window.api.xiaoxuePet.reportTaskResult({ taskId: state.taskId, success: false, error: state.message })
      }
    }
  }
  window.addEventListener("agent_state_changed", handleState)
  const handleAnswer = (event: Event) => {
    const detail = (event as CustomEvent).detail
    if (
      !detail ||
      typeof detail.taskId !== "string" ||
      typeof detail.answer !== "string" ||
      !detail.answer.trim()
    )
      return
    window.api.xiaoxuePet.reportTaskResult({
      taskId: detail.taskId,
      success: true,
      answer: detail.answer,
      partial: detail.partial === true,
    })
  }
  window.addEventListener("xiaoxue:assistant-answer", handleAnswer)
  const disposeAction = window.api.xiaoxuePet.onAction((action) => {
    const detail = { ...action, handled: false }
    window.dispatchEvent(new CustomEvent("xiaoxue:pet-action", { detail }))
    if (!detail.handled) onUnhandledAction?.(action)
  })
  return () => {
    window.removeEventListener("agent_state_changed", handleState)
    window.removeEventListener("xiaoxue:assistant-answer", handleAnswer)
    disposeAction()
  }
}

export function subscribePetWindowState(callback: (state: XiaoxuePetState) => void) {
  void window.api.xiaoxuePet.getState().then(callback)
  return window.api.xiaoxuePet.onState(callback)
}
