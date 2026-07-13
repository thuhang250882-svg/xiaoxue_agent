import * as THREE from "three"
import type { AnimationId, LoadedPetModel, Pet3DModelManager } from "./Pet3DModelManager"
import type { XiaoxueState } from "../state"
import { PET_ANIMATION_CONFIG, petAnimationPlayback } from "./config"

export type PetAnimationController = {
  play: (id: AnimationId, force?: boolean) => void
  playOnce: (id: AnimationId) => void
  setAgentState: (state: XiaoxueState) => void
  ensurePlaying: () => void
  current: () => AnimationId | null
  update: (delta: number) => void
  activeScene: () => THREE.Group | null
  activeMixer: () => THREE.AnimationMixer | null
  dispose: () => void
}

const STATE_ANIMATION_MAP: Record<XiaoxueState, AnimationId> = {
  idle: "idle", listen: "thinking_cast", thinking: "thinking_cast", searching: "walk", reading: "idle",
  writing: "idle", reviewing: "thinking_cast", success: "dance", warning: "sad", error: "sad",
}
const LOOPING = new Set<AnimationId>(["idle", "walk", "run", "sad", "thinking_cast"])

export function createPetAnimationController(manager: Pet3DModelManager): PetAnimationController {
  let currentId: AnimationId | null = null
  let currentAction: THREE.AnimationAction | null = null
  let model: LoadedPetModel | null = null

  function ensureModel() {
    if (!model) model = manager.getModel() ?? null
    return model
  }

  function play(id: AnimationId, force = false, once = false) {
    const loaded = ensureModel()
    if (!loaded) return
    if (!force && id === currentId && currentAction?.isRunning()) return
    const clip = loaded.clips.get(id)
    if (!clip) {
      if (id !== "idle") play("idle", true)
      return
    }
    const next = loaded.mixer.clipAction(clip)
    currentAction?.fadeOut(PET_ANIMATION_CONFIG.transitionSeconds)
    next.reset()
    next.enabled = true
    const playback = petAnimationPlayback(id, once)
    next.clampWhenFinished = playback.clampWhenFinished
    next.setEffectiveTimeScale(playback.timeScale)
    next.setEffectiveWeight(1)
    next.setLoop(playback.repeat ? THREE.LoopRepeat : THREE.LoopOnce, playback.repetitions)
    next.fadeIn(PET_ANIMATION_CONFIG.transitionSeconds)
    next.play()
    currentAction = next
    currentId = id
  }

  function onFinished(event: { action: THREE.AnimationAction }) {
    if (event.action !== currentAction || !currentId) return
    play("idle", true)
  }

  function bindMixer() {
    ensureModel()?.mixer.addEventListener("finished", onFinished)
  }

  function setAgentState(state: XiaoxueState) {
    bindMixer()
    play(STATE_ANIMATION_MAP[state] ?? "idle")
  }

  function ensurePlaying() {
    bindMixer()
    if (currentAction?.isRunning()) return
    play(currentId ?? "idle", true)
  }

  function dispose() {
    if (model) model.mixer.removeEventListener("finished", onFinished)
    currentAction = null
    currentId = null
    model = null
  }

  return {
    play: (id, force) => { bindMixer(); play(id, force) },
    playOnce: (id) => { bindMixer(); play(id, true, true) },
    setAgentState,
    ensurePlaying,
    current: () => currentId,
    update: (delta) => ensureModel()?.mixer.update(delta),
    activeScene: () => ensureModel()?.scene ?? null,
    activeMixer: () => ensureModel()?.mixer ?? null,
    dispose,
  }
}