/**
 * PetEventBridge
 *
 * Bridges the agent state event bus to the pet state system.
 * Listens for `agent_state_changed` CustomEvents on the window and
 * provides a reactive signal of the current pet state.
 */

import { createSignal, onCleanup, onMount } from "solid-js"
import type { XiaoxueState } from "./state"
import { STATE_AUTO_IDLE_MS, PET_DEFAULT_MESSAGES } from "./state"

export type PetEventBridgeState = {
  state: XiaoxueState
  message: string
  timestamp: number
  taskId?: string
  agent?: string
}

export function createPetEventBridge() {
  const [state, setState] = createSignal<PetEventBridgeState>({
    state: "idle",
    message: PET_DEFAULT_MESSAGES.idle,
    timestamp: Date.now(),
  })

  let autoIdleTimer: ReturnType<typeof setTimeout> | undefined

  const clearAutoIdle = () => {
    if (autoIdleTimer !== undefined) {
      clearTimeout(autoIdleTimer)
      autoIdleTimer = undefined
    }
  }

  const scheduleAutoIdle = (petState: XiaoxueState) => {
    clearAutoIdle()
    const duration = STATE_AUTO_IDLE_MS[petState]
    if (!duration) return
    autoIdleTimer = setTimeout(() => {
      setState((prev) => {
        // Only auto-idle if the state hasn't changed since we scheduled
        if (prev.state !== petState) return prev
        return {
          state: "idle",
          message: PET_DEFAULT_MESSAGES.idle,
          timestamp: Date.now(),
          taskId: undefined,
          agent: undefined,
        }
      })
    }, duration)
  }

  onMount(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        event?: string
        state?: XiaoxueState
        message?: string
        timestamp?: number
        taskId?: string
        agent?: string
      } | undefined

      if (!detail || detail.event !== "agent_state_changed") return
      if (!detail.state) return

      const petState: PetEventBridgeState = {
        state: detail.state,
        message: detail.message || PET_DEFAULT_MESSAGES[detail.state],
        timestamp: detail.timestamp || Date.now(),
        taskId: detail.taskId,
        agent: detail.agent,
      }

      setState(petState)
      scheduleAutoIdle(detail.state)
    }

    window.addEventListener("agent_state_changed", handler)
    onCleanup(() => {
      window.removeEventListener("agent_state_changed", handler)
      clearAutoIdle()
    })
  })

  return {
    state,
    setState,
    /** Manually set the pet to idle */
    reset: () => {
      clearAutoIdle()
      setState({
        state: "idle",
        message: PET_DEFAULT_MESSAGES.idle,
        timestamp: Date.now(),
      })
    },
  }
}
