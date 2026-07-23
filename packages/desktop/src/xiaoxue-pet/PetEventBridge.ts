import type { XiaoxuePetAction, XiaoxuePetState } from "../preload/types"
import { normalizePetState } from "./PetStateMapper"

export function bindMainWindowPetBridge(onUnhandledAction?: (action: XiaoxuePetAction) => void) {
  const handleState = (event: Event) => {
    const state = normalizePetState((event as CustomEvent).detail)
    if (state) {
      window.api.xiaoxuePet.publishState(state)
      // Forward error/success results to pet window
      if (state.state === "error") {
        window.api.xiaoxuePet.reportTaskResult({ success: false, error: state.message })
      } else if (state.state === "success" || state.state === "celebrate") {
        window.api.xiaoxuePet.reportTaskResult({ success: true })
      }
    }
  }
  window.addEventListener("agent_state_changed", handleState)
  const disposeAction = window.api.xiaoxuePet.onAction((action) => {
    const detail = { ...action, handled: false }
    window.dispatchEvent(new CustomEvent("xiaoxue:pet-action", { detail }))
    if (!detail.handled) onUnhandledAction?.(action)
  })
  return () => {
    window.removeEventListener("agent_state_changed", handleState)
    disposeAction()
  }
}

export function subscribePetWindowState(callback: (state: XiaoxuePetState) => void) {
  void window.api.xiaoxuePet.getState().then(callback)
  return window.api.xiaoxuePet.onState(callback)
}