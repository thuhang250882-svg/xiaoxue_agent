/**
 * AnimationController
 *
 * Drives all pet animations per frame. Manages state transitions,
 * color lerping, and per-object animation callbacks.
 *
 * Each object in the scene can have `userData.onUpdate(delta, elapsed)`
 * registered. The controller also maintains global state that the
 * FallbackAvatar reads to drive its animations.
 */

import * as THREE from "three"
import type { XiaoxueState } from "../state"
import { PET_VISUAL_MAP } from "../state"

export type AnimationState = {
  current: XiaoxueState
  previous: XiaoxueState
  /** 0-1 progress of transition (1 = fully arrived) */
  transition: number
  /** Elapsed time in current state */
  elapsed: number
  /** Current interpolated color */
  color: THREE.Color
  /** Current interpolated scale */
  scale: number
  /** Target color for lerp */
  targetColor: THREE.Color
}

export type AnimationController = {
  /** Current animation state (read by FallbackAvatar) */
  state: AnimationState
  /** Transition to a new pet state */
  setState: (next: XiaoxueState) => void
  /** Call once per frame */
  update: (delta: number) => void
  /** Dispose resources */
  dispose: () => void
}

const TRANSITION_SPEED = 4.0 // states per second for lerp
const STATE_IDLE_RETURN_MS: Partial<Record<XiaoxueState, number>> = {
  success: 5000,
  error: 8000,
}

export function createAnimationController(): AnimationController {
  const colorA = new THREE.Color()
  const colorB = new THREE.Color()

  const state: AnimationState = {
    current: "idle",
    previous: "idle",
    transition: 1,
    elapsed: 0,
    color: new THREE.Color(PET_VISUAL_MAP.idle.particleColor),
    scale: 1,
    targetColor: new THREE.Color(PET_VISUAL_MAP.idle.particleColor),
  }

  let autoIdleTimer: ReturnType<typeof setTimeout> | undefined

  function clearAutoIdle() {
    if (autoIdleTimer !== undefined) {
      clearTimeout(autoIdleTimer)
      autoIdleTimer = undefined
    }
  }

  function scheduleAutoIdle(next: XiaoxueState) {
    clearAutoIdle()
    const duration = STATE_IDLE_RETURN_MS[next]
    if (!duration) return
    autoIdleTimer = setTimeout(() => {
      if (state.current === next) {
        transitionTo("idle")
      }
    }, duration)
  }

  function transitionTo(next: XiaoxueState) {
    if (next === state.current && state.transition >= 1) return
    state.previous = state.current
    state.current = next
    state.transition = 0
    state.elapsed = 0
    state.targetColor = new THREE.Color(PET_VISUAL_MAP[next].particleColor)
    scheduleAutoIdle(next)
  }

  function update(delta: number) {
    // Advance elapsed time
    state.elapsed += delta

    // Lerp transition progress
    if (state.transition < 1) {
      state.transition = Math.min(1, state.transition + delta * TRANSITION_SPEED)
    }

    // Lerp color toward target
    colorA.copy(state.color)
    state.color.lerp(state.targetColor, Math.min(1, delta * 3))

    // Lerp scale toward target
    const targetScale = PET_VISUAL_MAP[state.current].scale
    state.scale = THREE.MathUtils.lerp(state.scale, targetScale, Math.min(1, delta * 4))
  }

  function dispose() {
    clearAutoIdle()
  }

  return { state, setState: transitionTo, update, dispose }
}
