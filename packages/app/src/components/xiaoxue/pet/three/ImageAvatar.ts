/**
 * ImageAvatar
 *
 * Multi-angle 2.5D sprite avatar for the Xiaoxue pet.
 * Loads front/side/back AI-generated views and switches
 * angle based on the current agent state.
 *
 * State → Angle mapping:
 *   Front (正面): idle, listen, success, warning, error
 *   Side  (侧面): thinking, reading, reviewing, searching
 *   Back  (背面): writing
 */

import * as THREE from "three"
import type { AnimationController } from "./AnimationController"
import type { XiaoxueState } from "../state"

export type ImageAvatar = {
  group: THREE.Group
  update: (delta: number, elapsed: number) => void
  dispose: () => void
  loaded: boolean
}

// ─── State → Angle Mapping ────────────────────────────────────────────────────

type AvatarAngle = "front" | "side" | "back" | "quarterLeft" | "quarterRight" | "profile" | "topDown" | "heroLow" | "rightProfile"

const STATE_ANGLE_MAP: Record<XiaoxueState, AvatarAngle> = {
  idle: "front",
  listen: "front",
  thinking: "topDown",
  searching: "side",
  reading: "quarterRight",
  writing: "back",
  reviewing: "front",
  success: "heroLow",
  warning: "profile",
  error: "rightProfile",
}

const ANGLE_URLS: Record<AvatarAngle, string> = {
  front: "/assets/pet/xiaoxue-front-rock.png",
  side: "/assets/pet/xiaoxue-left-rock.png",
  back: "/assets/pet/xiaoxue-back-rock.png",
  quarterLeft: "/assets/pet/xiaoxue-front-left-rock.png",
  quarterRight: "/assets/pet/xiaoxue-front-right-rock.png",
  profile: "/assets/pet/xiaoxue-right-rock.png",
  topDown: "/assets/pet/xiaoxue-top-down-rock.png",
  heroLow: "/assets/pet/xiaoxue-hero-low-angle.png",
  rightProfile: "/assets/pet/xiaoxue-right-profile-rock.png",
}
// ─── Image Loading ────────────────────────────────────────────────────────────

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load ${url}`))
    img.src = url
  })
}

/**
 * Remove black/dark background from an image via Canvas pixel processing.
 */
function processImageRemoveBlack(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(img, 0, 0)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  const threshold = 28

  for (let i = 0; i < data.length; i += 4) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
    if (brightness < threshold) {
      data[i + 3] = 0
    } else if (brightness < threshold * 3) {
      data[i + 3] = Math.min(255, Math.round(((brightness - threshold) / (threshold * 2)) * 255))
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

/**
 * Create a Three.js texture from a Canvas with proper settings.
 */
function canvasToTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

// ─── Glow / Particle Helpers ──────────────────────────────────────────────────

function createGlowTexture(): THREE.Texture {
  const size = 256
  const c = document.createElement("canvas")
  c.width = size; c.height = size
  const ctx = c.getContext("2d")!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, "rgba(255,255,255,0.35)")
  g.addColorStop(0.4, "rgba(255,255,255,0.12)")
  g.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const t = new THREE.CanvasTexture(c)
  t.needsUpdate = true
  return t
}

function createSnowflakeTexture(): THREE.CanvasTexture {
  const size = 128
  const c = document.createElement("canvas")
  c.width = size; c.height = size
  const ctx = c.getContext("2d")!
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = "rgba(255,255,255,0.9)"
  ctx.font = `bold ${size * 0.65}px serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("❄", size / 2, size / 2)
  const t = new THREE.CanvasTexture(c)
  t.needsUpdate = true
  return t
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const PARTICLE_COUNT = 30
const CROSSFADE_SPEED = 3.0 // transitions per second

export async function createImageAvatar(
  controller: AnimationController,
): Promise<ImageAvatar> {
  const group = new THREE.Group()
  const anim = controller.state

  // ── Load all 3 angle images in parallel ──
  const angleTextures: Partial<Record<AvatarAngle, THREE.CanvasTexture>> = {}
  let anyLoaded = false

  const entries = Object.entries(ANGLE_URLS) as [AvatarAngle, string][]
  const results = await Promise.allSettled(
    entries.map(async ([angle, url]) => {
      const img = await loadImage(url)
      const processed = processImageRemoveBlack(img)
      const texture = canvasToTexture(processed)
      return { angle, texture, width: img.naturalWidth, height: img.naturalHeight }
    }),
  )

  for (const result of results) {
    if (result.status === "fulfilled") {
      angleTextures[result.value.angle] = result.value.texture
      anyLoaded = true
    }
  }

  if (!anyLoaded) {
    // Placeholder if all images fail
    const geo = new THREE.SphereGeometry(0.5, 32, 32)
    const mat = new THREE.MeshStandardMaterial({ color: 0x60a5fa, emissive: 0x60a5fa, emissiveIntensity: 0.3, transparent: true, opacity: 0.8 })
    group.add(new THREE.Mesh(geo, mat))
    return { group, update: () => {}, dispose: () => {}, loaded: false }
  }

  // ── Create sprites for each loaded angle ──
  const sprites: Partial<Record<AvatarAngle, THREE.Sprite>> = {}
  const spriteHeight = 2.4

  for (const [angle, texture] of Object.entries(angleTextures) as [AvatarAngle, THREE.CanvasTexture][]) {
    // Determine aspect from the texture's source image
    const img = texture.image as HTMLCanvasElement
    const aspect = img.width / img.height
    const spriteWidth = spriteHeight * aspect

    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.01,
      depthWrite: false,
      opacity: angle === "front" ? 1 : 0, // start with front visible
    })
    const sprite = new THREE.Sprite(mat)
    sprite.scale.set(spriteWidth, spriteHeight, 1)
    sprite.position.y = 0
    group.add(sprite)
    sprites[angle] = sprite
  }

  let currentAngle: AvatarAngle = "front"
  let targetAngle: AvatarAngle = "front"
  let crossfade = 1 // 0-1, 1 = fully arrived at target

  // ── Glow halo ──
  const glowTex = createGlowTexture()
  const glowMat = new THREE.SpriteMaterial({
    map: glowTex,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const glow = new THREE.Sprite(glowMat)
  glow.scale.set(3.0, 3.0, 1)
  glow.position.set(0, 0.2, -0.5)
  group.add(glow)

  // ── Snowflake marker ──
  const sfTex = createSnowflakeTexture()
  const sfMat = new THREE.SpriteMaterial({ map: sfTex, transparent: true, opacity: 0.5, depthWrite: false })
  const snowflake = new THREE.Sprite(sfMat)
  snowflake.scale.set(0.28, 0.28, 1)
  snowflake.position.set(1.05, 1.0, 0)
  group.add(snowflake)

  // ── Particles ──
  const positions = new Float32Array(PARTICLE_COUNT * 3)
  const pColors = new Float32Array(PARTICLE_COUNT * 3)
  const speeds = new Float32Array(PARTICLE_COUNT)

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2
    const radius = 0.5 + Math.random() * 1.4
    positions[i * 3] = Math.cos(angle) * radius
    positions[i * 3 + 1] = (Math.random() - 0.5) * 2.8
    positions[i * 3 + 2] = Math.sin(angle) * radius - 0.4
    pColors[i * 3] = 0.37; pColors[i * 3 + 1] = 0.65; pColors[i * 3 + 2] = 0.98
    speeds[i] = 0.2 + Math.random() * 0.45
  }

  const pointsGeo = new THREE.BufferGeometry()
  pointsGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  pointsGeo.setAttribute("color", new THREE.BufferAttribute(pColors, 3))
  const pointsMat = new THREE.PointsMaterial({
    size: 0.045,
    vertexColors: true,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  })
  group.add(new THREE.Points(pointsGeo, pointsMat))

  // ── Per-frame update ──
  function update(delta: number, elapsed: number) {
    const state = anim.current
    const t = elapsed

    // --- Angle switching with crossfade ---
    const desired = STATE_ANGLE_MAP[state]
    if (desired !== targetAngle && angleTextures[desired]) {
      targetAngle = desired
      crossfade = 0
    }

    if (crossfade < 1) {
      crossfade = Math.min(1, crossfade + delta * CROSSFADE_SPEED)

      // Fade out old, fade in new
      for (const [angle, sprite] of Object.entries(sprites) as [AvatarAngle, THREE.Sprite][]) {
        if (angle === targetAngle) {
          sprite.material.opacity = crossfade
        } else if (angle === currentAngle) {
          sprite.material.opacity = 1 - crossfade
        } else {
          sprite.material.opacity = 0
        }
      }

      if (crossfade >= 1) {
        currentAngle = targetAngle
      }
    }

    // --- Character movement ---
    switch (state) {
      case "idle":
        group.position.y = Math.sin(t * 1.2) * 0.03
        group.position.x = 0
        group.rotation.z = 0
        break
      case "listen":
        group.position.y = Math.sin(t * 1.5) * 0.02
        group.rotation.z = Math.sin(t * 1.0) * 0.015
        break
      case "thinking":
        group.position.y = Math.sin(t * 2.0) * 0.025
        group.position.x = 0
        break
      case "searching":
        group.position.x = Math.sin(t * 1.8) * 0.035
        group.position.y = Math.sin(t * 1.2) * 0.015
        break
      case "reading":
        group.position.y = Math.sin(t * 0.8) * 0.015
        group.position.x = 0
        break
      case "writing":
        group.position.x = 0
        group.position.y = Math.sin(t * 1.0) * 0.01
        break
      case "reviewing":
        group.position.y = Math.sin(t * 1.5) * 0.02
        group.position.x = 0
        break
      case "success":
        group.position.y = Math.abs(Math.sin(t * 3.0)) * 0.07
        group.position.x = 0
        break
      case "warning":
        group.position.x = Math.sin(t * 12) * 0.018
        group.position.y = 0
        break
      case "error":
        group.position.y = -0.015 + Math.sin(t * 2) * 0.008
        group.position.x = 0
        break
    }

    // --- Glow ---
    glowMat.color.copy(anim.color)
    const glowInt: Record<string, number> = {
      idle: 0.3, listen: 0.35, thinking: 0.4, searching: 0.38,
      reading: 0.32, writing: 0.35, reviewing: 0.45, success: 0.65,
      warning: 0.4, error: 0.2,
    }
    glowMat.opacity = (glowInt[state] ?? 0.3) + Math.sin(t * 2) * 0.04

    // --- Snowflake ---
    snowflake.position.y = 1.0 + Math.sin(t * 1.0) * 0.07
    snowflake.rotation.z = t * 0.2
    sfMat.opacity = state === "idle" ? 0.5 : 0.22

    // --- Particles ---
    const posAttr = pointsGeo.getAttribute("position") as THREE.BufferAttribute
    const colAttr = pointsGeo.getAttribute("color") as THREE.BufferAttribute
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const ix = i * 3
      let py = (posAttr.array[ix + 1] as number) + delta * speeds[i] * 0.22
      if (py > 1.6) {
        const a = Math.random() * Math.PI * 2
        const r = 0.5 + Math.random() * 1.4
        posAttr.array[ix] = Math.cos(a) * r
        py = -1.6
        posAttr.array[ix + 2] = Math.sin(a) * r - 0.4
      }
      posAttr.array[ix + 1] = py
      colAttr.array[ix] = anim.color.r * 0.7 + 0.3
      colAttr.array[ix + 1] = anim.color.g * 0.7 + 0.3
      colAttr.array[ix + 2] = anim.color.b * 0.7 + 0.3
    }
    posAttr.needsUpdate = true
    colAttr.needsUpdate = true

    const pAlpha: Record<string, number> = {
      idle: 0.4, listen: 0.5, thinking: 0.55, searching: 0.5,
      reading: 0.42, writing: 0.45, reviewing: 0.6, success: 0.75,
      warning: 0.45, error: 0.28,
    }
    pointsMat.opacity = pAlpha[state] ?? 0.4

    group.scale.setScalar(anim.scale)
  }

  function dispose() {
    group.traverse((child) => {
      if (child instanceof THREE.Sprite) {
        child.material.map?.dispose()
        child.material.dispose()
      }
      if (child instanceof THREE.Points) {
        child.geometry.dispose()
        child.material.dispose()
      }
    })
    glowTex.dispose()
    sfTex.dispose()
  }

  return { group, update, dispose, loaded: true }
}
