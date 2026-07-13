import * as THREE from "three"
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js"
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js"

export type AnimationId = "idle" | "walk" | "run" | "dance" | "sad" | "thinking_cast"

export type LoadedPetModel = {
  scene: THREE.Group
  clips: Map<string, THREE.AnimationClip>
  mixer: THREE.AnimationMixer
  bounds: THREE.Box3
  size: THREE.Vector3
}

export type Pet3DModelManager = {
  load: () => Promise<LoadedPetModel>
  isLoaded: () => boolean
  getModel: () => LoadedPetModel | undefined
  getClip: (name: AnimationId) => THREE.AnimationClip | undefined
  dispose: () => void
}

const GLB_PATH = "/assets/models/xiaoxue/xiaoxue.glb"
const loader = new GLTFLoader()
let sourcePromise: Promise<GLTF> | undefined

function loadSource() {
  if (sourcePromise) return sourcePromise
  sourcePromise = new Promise<GLTF>((resolve, reject) => loader.load(GLB_PATH, resolve, undefined, reject)).catch((error) => {
    sourcePromise = undefined
    throw error
  })
  return sourcePromise
}

function createInstance(gltf: GLTF): LoadedPetModel {
  const scene = clone(gltf.scene) as THREE.Group
  scene.updateMatrixWorld(true)
  const sourceBounds = new THREE.Box3().setFromObject(scene)
  const center = sourceBounds.getCenter(new THREE.Vector3())
  scene.position.set(-center.x, -sourceBounds.min.y, -center.z)
  scene.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(scene)
  return {
    scene,
    clips: new Map(gltf.animations.map((clip) => [clip.name, clip])),
    mixer: new THREE.AnimationMixer(scene),
    bounds,
    size: bounds.getSize(new THREE.Vector3()),
  }
}

export function createPet3DModelManager(): Pet3DModelManager {
  let model: LoadedPetModel | undefined
  let instancePromise: Promise<LoadedPetModel> | undefined

  function load() {
    if (model) return Promise.resolve(model)
    if (instancePromise) return instancePromise
    instancePromise = loadSource().then((gltf) => {
      model = createInstance(gltf)
      instancePromise = undefined
      return model
    })
    return instancePromise
  }

  function dispose() {
    if (!model) return
    model.mixer.stopAllAction()
    model.mixer.uncacheRoot(model.scene)
    model.scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.geometry?.dispose()
      if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose())
      else child.material?.dispose()
    })
    model = undefined
    instancePromise = undefined
  }

  return {
    load,
    isLoaded: () => model !== undefined,
    getModel: () => model,
    getClip: (name) => model?.clips.get(name),
    dispose,
  }
}