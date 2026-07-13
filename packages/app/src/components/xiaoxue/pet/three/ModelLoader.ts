/**
 * ModelLoader
 *
 * Loads GLB/GLTF models for the pet avatar.
 * Dynamically imports Three.js addons (GLTFLoader) to keep
 * initial bundle size small.
 *
 * When no GLB file is found, the system silently falls back
 * to the FallbackAvatar geometric character.
 */

import * as THREE from "three"

export type LoadedModel = {
  scene: THREE.Group
  animations: THREE.AnimationClip[]
  mixer: THREE.AnimationMixer
}

export type ModelLoadResult = {
  success: boolean
  model?: LoadedModel
  error?: string
}

/**
 * Attempt to load a GLB model from the given URL.
 * Returns null if loading fails (file not found, parse error, etc.)
 */
export async function loadGLBModel(url: string): Promise<ModelLoadResult> {
  try {
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js")
    const loader = new GLTFLoader()

    const gltf = await new Promise<LoadedModel>((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          const mixer = new THREE.AnimationMixer(gltf.scene)
          resolve({
            scene: gltf.scene,
            animations: gltf.animations,
            mixer,
          })
        },
        undefined,
        (error) => reject(error),
      )
    })

    return { success: true, model: gltf }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

/**
 * Play an animation clip by name on the model mixer.
 * Returns the active action, or undefined if clip not found.
 */
export function playAnimation(
  mixer: THREE.AnimationMixer,
  clips: THREE.AnimationClip[],
  clipName: string,
  crossFadeDuration = 0.3,
): THREE.AnimationAction | undefined {
  const clip = clips.find((c) => c.name === clipName)
  if (!clip) return undefined

  const action = mixer.clipAction(clip)
  action.reset()
  action.fadeIn(crossFadeDuration)
  action.play()
  return action
}

/**
 * Dispose a loaded model's resources.
 */
export function disposeModel(model: LoadedModel) {
  model.mixer.stopAllAction()
  model.mixer.uncacheRoot(model.scene)
  model.scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose()
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose())
      } else {
        child.material?.dispose()
      }
    }
  })
}
