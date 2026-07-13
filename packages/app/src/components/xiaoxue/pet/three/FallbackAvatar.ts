/**
 * FallbackAvatar
 *
 * A polished geometric character built from Three.js primitives.
 * Used when no GLB model is available. Animates based on the
 * AnimationController state.
 *
 * Character composition:
 *   - Head sphere (main body, emissive glow)
 *   - Inner core (darker, adds depth)
 *   - Orbital ring (Torus, rotation animation)
 *   - Glow sprite (soft halo behind head)
 *   - Snowflake sprite (brand identifier)
 *   - Particle points (ambient floating particles)
 */

import * as THREE from "three"
import type { AnimationController } from "./AnimationController"

export type FallbackAvatar = {
  group: THREE.Group
  update: (delta: number, elapsed: number) => void
  dispose: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createGlowTexture(): THREE.Texture {
  const size = 128
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")!
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.8)")
  gradient.addColorStop(0.3, "rgba(255, 255, 255, 0.3)")
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)")
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

function createSnowflakeTexture(): THREE.Texture {
  const size = 64
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "rgba(255, 255, 255, 0)"
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)"
  ctx.font = `${size * 0.7}px serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("❄", size / 2, size / 2)
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function createFallbackAvatar(controller: AnimationController): FallbackAvatar {
  const group = new THREE.Group()
  const anim = controller.state

  // ── Head sphere ──
  const headGeo = new THREE.SphereGeometry(0.65, 48, 48)
  const headMat = new THREE.MeshStandardMaterial({
    color: 0x60a5fa,
    emissive: 0x60a5fa,
    emissiveIntensity: 0.25,
    roughness: 0.4,
    metalness: 0.1,
    transparent: true,
    opacity: 0.92,
  })
  const head = new THREE.Mesh(headGeo, headMat)
  head.position.y = 0.15
  group.add(head)

  // ── Inner core ──
  const coreGeo = new THREE.SphereGeometry(0.35, 32, 32)
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    emissive: 0x3b82f6,
    emissiveIntensity: 0.5,
    roughness: 0.6,
    metalness: 0.2,
    transparent: true,
    opacity: 0.7,
  })
  const core = new THREE.Mesh(coreGeo, coreMat)
  core.position.y = 0.15
  group.add(core)

  // ── Orbital ring ──
  const ringGeo = new THREE.TorusGeometry(0.9, 0.035, 16, 80)
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x60a5fa,
    emissive: 0x60a5fa,
    emissiveIntensity: 0.4,
    roughness: 0.3,
    metalness: 0.5,
    transparent: true,
    opacity: 0.7,
  })
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.position.y = 0.15
  ring.rotation.x = Math.PI * 0.35
  group.add(ring)

  // ── Glow sprite ──
  const glowTex = createGlowTexture()
  const glowMat = new THREE.SpriteMaterial({
    map: glowTex,
    color: 0x60a5fa,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const glow = new THREE.Sprite(glowMat)
  glow.scale.set(2.8, 2.8, 1)
  glow.position.y = 0.15
  group.add(glow)

  // ── Snowflake brand marker ──
  const sfTex = createSnowflakeTexture()
  const sfMat = new THREE.SpriteMaterial({
    map: sfTex,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  })
  const snowflake = new THREE.Sprite(sfMat)
  snowflake.scale.set(0.25, 0.25, 1)
  snowflake.position.set(0.55, 0.7, 0)
  group.add(snowflake)

  // ── Ambient particle points ──
  const PARTICLE_COUNT = 50
  const positions = new Float32Array(PARTICLE_COUNT * 3)
  const particleColors = new Float32Array(PARTICLE_COUNT * 3)
  const particleAlphas = new Float32Array(PARTICLE_COUNT)
  const particleSpeeds = new Float32Array(PARTICLE_COUNT)

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2
    const radius = 0.8 + Math.random() * 1.2
    positions[i * 3] = Math.cos(angle) * radius
    positions[i * 3 + 1] = (Math.random() - 0.5) * 2.0
    positions[i * 3 + 2] = Math.sin(angle) * radius
    particleAlphas[i] = Math.random()
    particleSpeeds[i] = 0.3 + Math.random() * 0.7
    // Initialize with blue-ish color
    particleColors[i * 3] = 0.37
    particleColors[i * 3 + 1] = 0.65
    particleColors[i * 3 + 2] = 0.98
  }

  const pointsGeo = new THREE.BufferGeometry()
  pointsGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  pointsGeo.setAttribute("color", new THREE.BufferAttribute(particleColors, 3))

  const pointsMat = new THREE.PointsMaterial({
    size: 0.06,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  })

  const particles = new THREE.Points(pointsGeo, pointsMat)
  group.add(particles)

  // ── Per-frame animation ──
  function update(delta: number, elapsed: number) {
    const state = anim.current
    const t = elapsed

    // --- Head animation ---
    switch (state) {
      case "idle":
        // Gentle breathing float
        head.position.y = 0.15 + Math.sin(t * 1.5) * 0.03
        core.position.y = head.position.y
        head.rotation.y = 0
        head.rotation.z = 0
        break
      case "listen":
        // Head tilt
        head.rotation.z = Math.sin(t * 1.2) * 0.08
        head.position.y = 0.15
        core.position.y = head.position.y
        break
      case "thinking":
        // Pulsing scale
        head.scale.setScalar(1 + Math.sin(t * 2.5) * 0.04)
        core.scale.setScalar(1 + Math.sin(t * 2.5 + 0.5) * 0.06)
        head.position.y = 0.15
        core.position.y = head.position.y
        head.rotation.y = 0
        head.rotation.z = 0
        break
      case "searching":
        // Side-to-side scan
        head.position.x = Math.sin(t * 2) * 0.08
        head.position.y = 0.15
        core.position.x = head.position.x
        core.position.y = head.position.y
        head.rotation.y = Math.sin(t * 2) * 0.1
        head.rotation.z = 0
        break
      case "reading":
        // Gentle vertical bob
        head.position.y = 0.15 + Math.sin(t * 1.0) * 0.02
        core.position.y = head.position.y
        head.position.x = 0
        core.position.x = 0
        head.rotation.y = 0
        head.rotation.z = 0
        break
      case "writing":
        // Micro jitter (high frequency, low amplitude)
        head.position.x = Math.sin(t * 12) * 0.015
        head.position.y = 0.15 + Math.sin(t * 8) * 0.01
        core.position.x = head.position.x
        core.position.y = head.position.y
        head.rotation.z = Math.sin(t * 10) * 0.02
        break
      case "reviewing":
        // Focused scale pulse
        head.scale.setScalar(1 + Math.sin(t * 1.8) * 0.05)
        core.scale.setScalar(1 + Math.sin(t * 1.8 + 0.3) * 0.07)
        head.position.y = 0.15
        core.position.y = head.position.y
        head.position.x = 0
        core.position.x = 0
        head.rotation.y = 0
        head.rotation.z = 0
        break
      case "success":
        // Celebration bounce
        head.position.y = 0.15 + Math.abs(Math.sin(t * 3.0)) * 0.15
        core.position.y = head.position.y
        head.scale.setScalar(1.08)
        core.scale.setScalar(1.1)
        head.position.x = 0
        core.position.x = 0
        head.rotation.y = 0
        head.rotation.z = 0
        break
      case "warning":
        // Horizontal shake
        head.position.x = Math.sin(t * 15) * 0.04
        head.position.y = 0.15
        core.position.x = head.position.x
        core.position.y = head.position.y
        head.rotation.z = Math.sin(t * 15) * 0.03
        break
      case "error":
        // Dim and shrink
        head.scale.setScalar(0.95 + Math.sin(t * 2) * 0.02)
        core.scale.setScalar(0.93)
        head.position.y = 0.15 - 0.03
        core.position.y = head.position.y
        head.position.x = 0
        core.position.x = 0
        head.rotation.y = 0
        head.rotation.z = 0
        break
    }

    // Reset unscaled states
    if (!["thinking", "reviewing", "success", "error"].includes(state)) {
      head.scale.setScalar(1)
      core.scale.setScalar(1)
    }

    // --- Ring animation ---
    switch (state) {
      case "idle":
        ring.rotation.z = t * 0.3
        ring.rotation.x = Math.PI * 0.35
        break
      case "listen":
        ring.rotation.z = t * 0.8
        ring.rotation.x = Math.PI * 0.35 + Math.sin(t * 1.2) * 0.1
        break
      case "thinking":
        ring.rotation.z = t * 1.5
        ring.rotation.x = Math.PI * 0.35
        break
      case "searching":
        ring.rotation.z = t * 0.5
        ring.rotation.x = Math.PI * 0.35 + Math.sin(t * 2) * 0.3
        break
      case "reading":
        ring.rotation.z = t * 0.5
        ring.rotation.x = Math.PI * 0.35
        break
      case "writing":
        ring.rotation.z = t * 2.0
        ring.rotation.x = Math.PI * 0.35
        break
      case "reviewing":
        ring.rotation.z = t * 0.4
        ring.rotation.x = Math.PI * 0.35 + Math.sin(t * 1.0) * 0.15
        break
      case "success":
        ring.rotation.z = t * 3.0
        ring.scale.setScalar(1 + Math.sin(t * 4) * 0.1)
        break
      case "warning":
        ring.rotation.z = t * 0.5 + Math.sin(t * 8) * 0.3
        ring.rotation.x = Math.PI * 0.35
        break
      case "error":
        ring.rotation.z = t * 0.1
        ring.rotation.x = Math.PI * 0.35
        break
    }

    if (state !== "success") ring.scale.setScalar(1)

    // --- Color updates ---
    const hex = anim.color.getHex()
    const threeColor = new THREE.Color(hex)
    headMat.color.copy(threeColor)
    headMat.emissive.copy(threeColor)
    coreMat.color.copy(threeColor).multiplyScalar(0.5)
    coreMat.emissive.copy(threeColor)
    ringMat.color.copy(threeColor)
    ringMat.emissive.copy(threeColor)
    glowMat.color.copy(threeColor)

    // Adjust emissive intensity based on state
    const emissiveMap: Record<string, number> = {
      idle: 0.25,
      listen: 0.35,
      thinking: 0.5,
      searching: 0.4,
      reading: 0.3,
      writing: 0.4,
      reviewing: 0.6,
      success: 0.8,
      warning: 0.5,
      error: 0.2,
    }
    headMat.emissiveIntensity = emissiveMap[state] ?? 0.25

    // Glow opacity
    const glowMap: Record<string, number> = {
      idle: 0.3,
      listen: 0.35,
      thinking: 0.4,
      searching: 0.35,
      reading: 0.3,
      writing: 0.35,
      reviewing: 0.45,
      success: 0.6,
      warning: 0.4,
      error: 0.2,
    }
    glowMat.opacity = glowMap[state] ?? 0.3

    // --- Particle animation ---
    const posAttr = pointsGeo.getAttribute("position") as THREE.BufferAttribute
    const colAttr = pointsGeo.getAttribute("color") as THREE.BufferAttribute

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const ix = i * 3
      let px = posAttr.array[ix] as number
      let py = posAttr.array[ix + 1] as number
      let pz = posAttr.array[ix + 2] as number

      // Float upward
      py += delta * particleSpeeds[i] * 0.3

      // Reset when too high
      if (py > 1.5) {
        const angle = Math.random() * Math.PI * 2
        const radius = 0.8 + Math.random() * 1.2
        px = Math.cos(angle) * radius
        py = -1.5
        pz = Math.sin(angle) * radius
      }

      // Orbit slightly
      const orbitSpeed = state === "thinking" ? 0.8 : state === "success" ? 1.2 : 0.3
      const cos = Math.cos(delta * orbitSpeed)
      const sin = Math.sin(delta * orbitSpeed)
      const newPx = px * cos - pz * sin
      const newPz = px * sin + pz * cos

      posAttr.array[ix] = newPx
      posAttr.array[ix + 1] = py
      posAttr.array[ix + 2] = newPz

      // Color particles
      colAttr.array[ix] = anim.color.r * 0.8 + 0.2
      colAttr.array[ix + 1] = anim.color.g * 0.8 + 0.2
      colAttr.array[ix + 2] = anim.color.b * 0.8 + 0.2
    }
    posAttr.needsUpdate = true
    colAttr.needsUpdate = true

    // Particle opacity
    const particleOpacityMap: Record<string, number> = {
      idle: 0.5,
      listen: 0.6,
      thinking: 0.7,
      searching: 0.65,
      reading: 0.55,
      writing: 0.6,
      reviewing: 0.75,
      success: 0.9,
      warning: 0.6,
      error: 0.4,
    }
    pointsMat.opacity = particleOpacityMap[state] ?? 0.5

    // Snowflake marker animation
    snowflake.position.y = 0.7 + Math.sin(t * 1.5) * 0.05
    snowflake.rotation.z = t * 0.3
    sfMat.opacity = state === "idle" ? 0.6 : 0.3

    // --- Global group scale from controller ---
    group.scale.setScalar(anim.scale)

    // Reset position.x for states that don't use it
    if (!["searching", "writing", "warning"].includes(state)) {
      head.position.x = 0
      core.position.x = 0
    }
  }

  function dispose() {
    headGeo.dispose()
    headMat.dispose()
    coreGeo.dispose()
    coreMat.dispose()
    ringGeo.dispose()
    ringMat.dispose()
    glowTex.dispose()
    glowMat.dispose()
    sfTex.dispose()
    sfMat.dispose()
    pointsGeo.dispose()
    pointsMat.dispose()
  }

  return { group, update, dispose }
}
