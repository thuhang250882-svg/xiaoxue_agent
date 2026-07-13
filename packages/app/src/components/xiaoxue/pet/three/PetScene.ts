/**
 * PetScene
 *
 * Three.js scene manager for the Xiaoxue pet renderer.
 * Handles scene, camera, renderer, lighting, and the render loop.
 *
 * Lighting setup:
 *   - HemisphereLight: soft ambient sky/ground
 *   - DirectionalLight (key): front-top, main illumination
 *   - DirectionalLight (rim): back-right, edge highlight
 *   - DirectionalLight (fill): left, softens shadows
 */

import * as THREE from "three"

export type PetSceneOptions = {
  width: number
  height: number
  /** Background alpha (0 = transparent) */
  alpha?: boolean
}

export type PetScene = {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  /** Call once per frame with requestAnimationFrame timestamp */
  tick: (time: number) => void
  /** Resize the viewport */
  resize: (width: number, height: number) => void
  /** Add an object to the scene root */
  add: (...objects: THREE.Object3D[]) => void
  /** Remove an object from the scene root */
  remove: (...objects: THREE.Object3D[]) => void
  /** Dispose all GPU resources */
  dispose: () => void
}

export function createPetScene(canvas: HTMLCanvasElement, options: PetSceneOptions): PetScene {
  const scene = new THREE.Scene()

  // Camera — close perspective for a pet-sized view
  const camera = new THREE.PerspectiveCamera(35, options.width / options.height, 0.1, 100)
  camera.position.set(0, 0.3, 4.5)
  camera.lookAt(0, 0, 0)

  // Renderer — transparent background for overlay use
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: options.alpha ?? true,
    antialias: true,
    powerPreference: "high-performance",
  })
  renderer.setSize(options.width, options.height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  renderer.setClearAlpha(0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0

  // ─── Lighting ────────────────────────────────────────────────────────────────

  // Hemisphere light — soft ambient (sky + ground)
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5)
  scene.add(hemiLight)

  // Key light — front-top, main illumination
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2)
  keyLight.position.set(2, 4, 3)
  scene.add(keyLight)

  // Rim light — back-right, edge highlight for silhouette
  const rimLight = new THREE.DirectionalLight(0x88aaff, 0.6)
  rimLight.position.set(-2, 2, -3)
  scene.add(rimLight)

  // Fill light — left, softens shadows
  const fillLight = new THREE.DirectionalLight(0xffeedd, 0.4)
  fillLight.position.set(-3, 1, 2)
  scene.add(fillLight)

  // ─── Shadow Plane (optional, subtle contact shadow) ───────────────────────────

  const shadowPlaneGeo = new THREE.PlaneGeometry(3, 3)
  const shadowPlaneMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
  })
  const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat)
  shadowPlane.rotation.x = -Math.PI / 2
  shadowPlane.position.y = -0.8
  scene.add(shadowPlane)

  // Render loop state
  let lastTime = 0

  // Cache update callbacks to avoid per-frame traverse
  const updateCallbacks = new Set<(delta: number, elapsed: number) => void>()

  function tick(time: number) {
    const delta = Math.min((time - lastTime) / 1000, 0.1) // cap at 100ms
    lastTime = time

    const elapsed = time / 1000

    // Call cached update callbacks
    for (const fn of updateCallbacks) {
      fn(delta, elapsed)
    }

    // Animate shadow plane opacity for breathing effect
    shadowPlaneMat.opacity = 0.06 + Math.sin(elapsed * 2) * 0.02

    renderer.render(scene, camera)
  }

  function resize(width: number, height: number) {
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
  }

  function add(...objects: THREE.Object3D[]) {
    for (const obj of objects) {
      scene.add(obj)
      // Register update callback if present
      if (obj.userData?.onUpdate && typeof obj.userData.onUpdate === "function") {
        updateCallbacks.add(obj.userData.onUpdate)
      }
      // Also check children recursively
      obj.traverse((child) => {
        if (child.userData?.onUpdate && typeof child.userData.onUpdate === "function") {
          updateCallbacks.add(child.userData.onUpdate)
        }
      })
    }
  }

  function remove(...objects: THREE.Object3D[]) {
    for (const obj of objects) {
      // Unregister update callbacks
      obj.traverse((child) => {
        if (child.userData?.onUpdate) {
          updateCallbacks.delete(child.userData.onUpdate)
        }
      })
      if (obj.userData?.onUpdate) {
        updateCallbacks.delete(obj.userData.onUpdate)
      }
      scene.remove(obj)
    }
  }

  function dispose() {
    renderer.dispose()
    updateCallbacks.clear()
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose())
        } else {
          child.material?.dispose()
        }
      }
      if (child instanceof THREE.Points) {
        child.geometry?.dispose()
        child.material?.dispose()
      }
      if (child instanceof THREE.Sprite) {
        child.material?.dispose()
      }
    })
  }

  return { scene, camera, renderer, tick, resize, add, remove, dispose }
}
