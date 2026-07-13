/**
 * ThreePetRenderer — WebGL Pet Renderer with GLB Animation
 *
 * Renders the Xiaoxue character via Three.js:
 * - Loads single GLB with multiple animation clips (idle/walk/run/dance/sad/thinking_cast)
 * - Auto-fits model to container via ResizeObserver
 * - Camera-distance based model framing (not pixel-based scaling)
 * - Mouse-driven 3D perspective tilt
 * - Smooth crossfade animation transitions
 * - Transparent background
 */

import { createEffect, on, onCleanup, onMount, createSignal } from "solid-js"
import * as THREE from "three"
import type { XiaoxueState } from "./state"
import type { PetScene } from "./three/PetScene"
import { createPetScene } from "./three/PetScene"
import { createPet3DModelManager } from "./three/Pet3DModelManager"
import { createPetAnimationController } from "./three/PetAnimationController"
import { createFallbackAvatar } from "./three/FallbackAvatar"
import { createImageAvatar, type ImageAvatar } from "./three/ImageAvatar"
import { createAnimationController } from "./three/AnimationController"
import { PET_ANIMATION_CONFIG, canPlayPetInteraction } from "./three/config"

export function ThreePetRenderer(props: {
  state: XiaoxueState
  width?: number
  height?: number
  mode?: "avatar" | "expanded"
}) {
  let canvasRef: HTMLCanvasElement | undefined
  let containerRef: HTMLDivElement | undefined

  let petScene: PetScene | undefined
  let modelManager: ReturnType<typeof createPet3DModelManager> | undefined
  let animController: ReturnType<typeof createPetAnimationController> | undefined
  let fallbackAvatar: ReturnType<typeof createFallbackAvatar> | undefined
  let imageAvatar: ImageAvatar | undefined
  let fallbackCtrl: ReturnType<typeof createAnimationController> | undefined
  let rafId: number | undefined
  let isVisible = true
  let webglContextLost = false
  let resizeObserver: ResizeObserver | undefined

  // 3D perspective
  let targetRotX = 0
  let targetRotY = 0
  let currentRotX = 0
  let currentRotY = 0

  // Reactive container size (driven by ResizeObserver or props)
  const [containerSize, setContainerSize] = createSignal({ w: 220, h: 320 })

  const w = () => containerSize().w
  const h = () => containerSize().h

  // Camera-distance based model fitting
  const fitModelToCamera = () => {
    if (!petScene) return
    const model = modelManager?.getModel()
    if (!model) return

    const scene = model.scene
    const size = model.size
    const center = new THREE.Vector3()
    new THREE.Box3().setFromObject(scene).getCenter(center)

    // Calculate camera distance to fit the model in view
    const fov = petScene.camera.fov * (Math.PI / 180)
    const aspect = petScene.camera.aspect
    const margin = 1.15

    if (props.mode === "avatar") {
      // Closeup: frame head and shoulders only
      const headCenterY = center.y + size.y * 0.25
      const headHeight = size.y * 0.5
      const distanceV = (headHeight * margin) / (2 * Math.tan(fov / 2))
      const distanceH = (size.x * margin * 0.8) / (2 * Math.tan((fov * aspect) / 2))
      const distance = Math.max(distanceV, distanceH, 1.5)
      petScene.camera.position.set(0, headCenterY + 0.1, distance)
      petScene.camera.lookAt(0, headCenterY, 0)
    } else {
      // Full body framing
      const modelHeight = size.y * margin
      const modelWidth = size.x * margin
      const distanceV = modelHeight / (2 * Math.tan(fov / 2))
      const distanceH = modelWidth / (2 * Math.tan((fov * aspect) / 2))
      const distance = Math.max(distanceV, distanceH, 2.5)
      petScene.camera.position.set(0, center.y + 0.2, distance)
      petScene.camera.lookAt(center.x, center.y, center.z)
    }

    petScene.camera.updateProjectionMatrix()
    scene.scale.setScalar(1)
  }

  onMount(() => {
    if (!canvasRef || !containerRef) return

    // Compute initial size from container or props
    const rect = containerRef.getBoundingClientRect()
    const initialW = rect.width > 0 ? rect.width : (props.width ?? 220)
    const initialH = rect.height > 0 ? rect.height : (props.height ?? 320)
    setContainerSize({ w: initialW, h: initialH })

    // Create Three.js scene
    petScene = createPetScene(canvasRef, { width: initialW, height: initialH, alpha: true })
    modelManager = createPet3DModelManager()
    animController = createPetAnimationController(modelManager)

    // Render loop
    function loop(time: number) {
      rafId = undefined
      if (!isVisible || webglContextLost) return

      const delta = 1 / 60
      animController?.update(delta)
      fallbackCtrl?.update(delta)
      petScene?.tick(time)

      // Smooth 3D perspective
      currentRotX += (targetRotX - currentRotX) * 0.08
      currentRotY += (targetRotY - currentRotY) * 0.08
      if (containerRef) {
        containerRef.style.transform =
          `perspective(600px) rotateX(${currentRotX}deg) rotateY(${currentRotY}deg)`
      }

      rafId = requestAnimationFrame(loop)
    }
    const startLoop = () => {
      if (rafId !== undefined || !isVisible || webglContextLost) return
      rafId = requestAnimationFrame(loop)
    }
    const pauseLoop = () => {
      if (rafId !== undefined) cancelAnimationFrame(rafId)
      rafId = undefined
    }
    const resumeRendering = () => {
      isVisible = true
      const rect = containerRef?.getBoundingClientRect()
      if (rect && rect.width >= 64 && rect.height >= 64) {
        petScene?.resize(rect.width, rect.height)
        fitModelToCamera()
      }
      animController?.ensurePlaying()
      startLoop()
    }
    startLoop()

    // Mouse tracking
    const onMouseMove = (e: MouseEvent) => {
      const rect = containerRef?.getBoundingClientRect()
      if (!rect) return
      const nx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2)
      const ny = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2)
      targetRotY = Math.max(-8, Math.min(8, nx * 8))
      targetRotX = Math.max(-5, Math.min(5, -ny * 5))
    }
    const onMouseLeave = () => { targetRotX = 0; targetRotY = 0 }
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseleave", onMouseLeave)

    // Visibility API and Electron hide/show keep the same scene and GLB instance.
    const onVisChange = () => {
      if (document.hidden) {
        isVisible = false
        pauseLoop()
        return
      }
      resumeRendering()
    }
    const onPetVisibility = (event: Event) => {
      const visible = (event as CustomEvent<{ visible?: boolean }>).detail?.visible !== false
      if (!visible) {
        isVisible = false
        pauseLoop()
        return
      }
      resumeRendering()
    }
    const onContextLost = (event: Event) => {
      event.preventDefault()
      webglContextLost = true
      pauseLoop()
    }
    const onContextRestored = () => {
      webglContextLost = false
      resumeRendering()
    }
    document.addEventListener("visibilitychange", onVisChange)
    window.addEventListener("xiaoxue:pet-visibility", onPetVisibility)
    canvasRef.addEventListener("webglcontextlost", onContextLost)
    canvasRef.addEventListener("webglcontextrestored", onContextRestored)

    const onInteraction = () => {
      if (!canPlayPetInteraction(props.state)) return
      animController?.playOnce("thinking_cast")
    }
    let ambientTimer: ReturnType<typeof setTimeout> | undefined
    const scheduleAmbient = () => {
      const range = PET_ANIMATION_CONFIG.ambientActionIntervalMaxMs - PET_ANIMATION_CONFIG.ambientActionIntervalMinMs
      ambientTimer = setTimeout(() => {
        if (canPlayPetInteraction(props.state) && isVisible && !webglContextLost) animController?.playOnce("thinking_cast")
        scheduleAmbient()
      }, PET_ANIMATION_CONFIG.ambientActionIntervalMinMs + Math.random() * range)
    }
    window.addEventListener("xiaoxue:pet-interaction", onInteraction)
    scheduleAmbient()

    // ResizeObserver — detect container size changes (throttled)
    let resizeTimeout: ReturnType<typeof setTimeout> | undefined
    resizeObserver = new ResizeObserver((entries) => {
      if (resizeTimeout) return
      resizeTimeout = setTimeout(() => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect
          if (width >= 64 && height >= 64) {
            setContainerSize({ w: width, h: height })
            petScene?.resize(width, height)
            // Re-fit model using camera distance (not scale)
            fitModelToCamera()
          }
        }
        resizeTimeout = undefined
      }, 100)
    })
    resizeObserver.observe(containerRef)

    onCleanup(() => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseleave", onMouseLeave)
      document.removeEventListener("visibilitychange", onVisChange)
      window.removeEventListener("xiaoxue:pet-visibility", onPetVisibility)
      canvasRef?.removeEventListener("webglcontextlost", onContextLost)
      canvasRef?.removeEventListener("webglcontextrestored", onContextRestored)
      window.removeEventListener("xiaoxue:pet-interaction", onInteraction)
      if (ambientTimer) clearTimeout(ambientTimer)
      resizeObserver?.disconnect()
      if (resizeTimeout) clearTimeout(resizeTimeout)
    })

    // Load model
    void loadInitialModel()
  })

  async function loadInitialModel() {
    if (!modelManager || !petScene) return

    try {
      // Load the single GLB with all animations
      const model = await modelManager.load()

      // Add model scene to pet scene
      petScene.add(model.scene)

      // Fit model using camera distance (not pixel-based scaling)
      fitModelToCamera()

      // Start idle animation
      animController?.play("idle")
    } catch {
      // GLB failed — try image avatar
      await tryLoadImageAvatar()
    }
  }

  async function tryLoadImageAvatar() {
    if (!petScene) return
    fallbackCtrl = createAnimationController()
    const result = await createImageAvatar(fallbackCtrl)
    if (result.loaded && petScene) {
      imageAvatar = result
      petScene.add(imageAvatar.group)
    } else {
      // Last resort: geometric fallback
      fallbackAvatar = createFallbackAvatar(fallbackCtrl)
      petScene.add(fallbackAvatar.group)
    }
  }

  // React to state changes
  createEffect(
    on(() => props.state, (newState) => {
      animController?.setAgentState(newState)
    }),
  )

  // Re-fit camera when mode changes (avatar closeup vs expanded full body)
  createEffect(
    on(() => props.mode, () => {
      if (petScene && modelManager?.isLoaded()) {
        fitModelToCamera()
      }
    }),
  )

  // Handle prop-based width/height (backward compatible with explicit props)
  createEffect(
    on([() => props.width, () => props.height], ([newW, newH]) => {
      if (newW !== undefined && newH !== undefined) {
        setContainerSize({ w: newW, h: newH })
        petScene?.resize(newW, newH)
        fitModelToCamera()
      }
    }),
  )

  onCleanup(() => {
    if (rafId !== undefined) cancelAnimationFrame(rafId)
    animController?.dispose()
    modelManager?.dispose()
    fallbackAvatar?.dispose()
    imageAvatar?.dispose()
    fallbackCtrl?.dispose()
    petScene?.dispose()
  })

  return (
    <div
      ref={containerRef}
      class="relative z-0 h-full w-full"
      style={{
        "transform-style": "preserve-3d",
        "will-change": "transform",
      }}
    >
      <canvas
        ref={canvasRef}
        width={w()}
        height={h()}
        class="pointer-events-none absolute inset-0"
        style={{
          width: `${w()}px`,
          height: `${h()}px`,
          background: "transparent",
        }}
        aria-hidden="true"
      />
    </div>
  )
}
