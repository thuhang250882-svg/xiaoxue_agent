/**
 * usePetState
 *
 * Composable that provides a reactive pet state backed by the event bridge.
 * Used by the floating pet overlay and any component that needs pet state.
 */

import { createSignal } from "solid-js"
import type { XiaoxueState } from "./state"
import { PET_DEFAULT_MESSAGES } from "./state"
import { createPetEventBridge } from "./PetEventBridge"

let globalPetBridge: ReturnType<typeof createPetEventBridge> | undefined

function getGlobalPetBridge() {
  if (!globalPetBridge) {
    globalPetBridge = createPetEventBridge()
  }
  return globalPetBridge
}

export function usePetState() {
  const bridge = getGlobalPetBridge()

  return {
    /** Current pet state */
    petState: bridge.state,
    /** Manually override the pet state */
    setPetState: (state: XiaoxueState, message?: string) => {
      bridge.setState({
        state,
        message: message || PET_DEFAULT_MESSAGES[state],
        timestamp: Date.now(),
      })
    },
    /** Reset to idle */
    reset: bridge.reset,
  }
}

/**
 * Local-only pet state (for components that need isolated state)
 */
export function useLocalPetState(initial: XiaoxueState = "idle") {
  const [state, setState] = createSignal<XiaoxueState>(initial)
  const [message, setMessage] = createSignal(PET_DEFAULT_MESSAGES[initial])

  return {
    state,
    message,
    setState: (s: XiaoxueState, msg?: string) => {
      setState(s)
      setMessage(msg || PET_DEFAULT_MESSAGES[s])
    },
  }
}
