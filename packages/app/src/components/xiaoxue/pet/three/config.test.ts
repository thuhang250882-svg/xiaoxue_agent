import { describe, expect, test } from "bun:test"
import { canPlayPetInteraction, PET_ANIMATION_CONFIG, petAnimationPlayback } from "./config"

describe("xiaoxue pet animation policy", () => {
  test("idle repeats forever at the configured slow speed", () => {
    expect(petAnimationPlayback("idle")).toEqual({
      repeat: true,
      repetitions: Infinity,
      clampWhenFinished: false,
      timeScale: PET_ANIMATION_CONFIG.idleSpeed,
    })
    expect(PET_ANIMATION_CONFIG.idleSpeed).toBe(0.45)
  })

  test("one-shot actions do not clamp", () => {
    expect(petAnimationPlayback("thinking_cast", true)).toEqual({
      repeat: false,
      repetitions: 1,
      clampWhenFinished: false,
      timeScale: 1,
    })
  })

  test("ambient interaction cannot override business states", () => {
    expect(canPlayPetInteraction("idle")).toBe(true)
    for (const state of ["listen", "thinking", "reading", "reviewing", "writing", "searching", "warning", "error"]) {
      expect(canPlayPetInteraction(state)).toBe(false)
    }
  })
})
