export const PET_ANIMATION_CONFIG = {
  idleSpeed: 0.45,
  transitionSeconds: 0.35,
  interactionCooldownMs: 8000,
  ambientActionIntervalMinMs: 20000,
  ambientActionIntervalMaxMs: 45000,
} as const
export function petAnimationPlayback(id: string, once = false) {
  const repeat = !once && ["idle", "walk", "run", "sad", "thinking_cast"].includes(id)
  return {
    repeat,
    repetitions: repeat ? Infinity : 1,
    clampWhenFinished: false,
    timeScale: id === "idle" ? PET_ANIMATION_CONFIG.idleSpeed : 1,
  }
}

export function canPlayPetInteraction(state: string) {
  return state === "idle"
}