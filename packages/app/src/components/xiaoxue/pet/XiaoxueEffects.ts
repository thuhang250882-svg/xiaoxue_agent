/**
 * XiaoxueEffects
 *
 * Canvas-based 2D effects layered on top of the sprite:
 * - Ambient particles (colored by state)
 * - State-specific effects (thinking dots, scan lines, success sparkles)
 * - Glow aura behind character
 */

import * as THREE from "three"
import type { XiaoxueState } from "./state"

const PARTICLE_COUNT = 25

type Particle = {
  x: number; y: number; vx: number; vy: number
  radius: number; alpha: number; life: number; maxLife: number
}

export type PetEffects = {
  scene: THREE.Scene
  update: (delta: number, state: XiaoxueState, elapsed: number) => void
  dispose: () => void
}

const STATE_COLORS: Record<string, number> = {
  idle: 0x60a5fa, listen: 0xa78bfa, thinking: 0xf59e0b,
  searching: 0x06b6d4, reading: 0x8b5cf6, writing: 0x10b981,
  reviewing: 0xf97316, success: 0x22c55e, celebrate: 0xf59e0b, warning: 0xeab308, error: 0xef4444,
}

const STATE_PARTICLE_ALPHA: Record<string, number> = {
  idle: 0.35, listen: 0.45, thinking: 0.55, searching: 0.5,
  reading: 0.4, writing: 0.45, reviewing: 0.6, success: 0.8, celebrate: 0.9, warning: 0.5, error: 0.3,
}

function hexToRgb(hex: number) {
  return { r: ((hex >> 16) & 0xff) / 255, g: ((hex >> 8) & 0xff) / 255, b: (hex & 0xff) / 255 }
}

export function createPetEffects(): PetEffects {
  const scene = new THREE.Scene()

  // ── Glow sprite ──
  const glowSize = 256
  const glowCanvas = document.createElement("canvas")
  glowCanvas.width = glowSize; glowCanvas.height = glowSize
  const gCtx = glowCanvas.getContext("2d")!
  const grad = gCtx.createRadialGradient(glowSize / 2, glowSize / 2, 0, glowSize / 2, glowSize / 2, glowSize / 2)
  grad.addColorStop(0, "rgba(255,255,255,0.3)")
  grad.addColorStop(0.5, "rgba(255,255,255,0.08)")
  grad.addColorStop(1, "rgba(0,0,0,0)")
  gCtx.fillStyle = grad; gCtx.fillRect(0, 0, glowSize, glowSize)
  const glowTex = new THREE.CanvasTexture(glowCanvas); glowTex.needsUpdate = true

  const glowMat = new THREE.SpriteMaterial({
    map: glowTex, transparent: true, opacity: 0.3,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })
  const glow = new THREE.Sprite(glowMat)
  glow.scale.set(3.5, 3.5, 1); glow.position.set(0, 0.3, -0.3)
  scene.add(glow)

  // ── Particles ──
  const positions = new Float32Array(PARTICLE_COUNT * 3)
  const colors = new Float32Array(PARTICLE_COUNT * 3)
  const speeds = new Float32Array(PARTICLE_COUNT)
  const particles: Particle[] = []

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2
    const radius = 0.5 + Math.random() * 1.3
    positions[i * 3] = Math.cos(angle) * radius
    positions[i * 3 + 1] = (Math.random() - 0.5) * 2.5
    positions[i * 3 + 2] = Math.sin(angle) * radius - 0.3
    colors[i * 3] = 0.37; colors[i * 3 + 1] = 0.65; colors[i * 3 + 2] = 0.98
    speeds[i] = 0.15 + Math.random() * 0.4
    particles.push({
      x: positions[i * 3], y: positions[i * 3 + 1], z: positions[i * 3 + 2],
      vx: 0, vy: speeds[i] * 0.2, vz: 0,
      radius: 1.5 + Math.random() * 2, alpha: 0.3 + Math.random() * 0.3,
      life: Math.random() * 100, maxLife: 80 + Math.random() * 120,
    } as any)
  }

  const pointsGeo = new THREE.BufferGeometry()
  pointsGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  pointsGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
  const pointsMat = new THREE.PointsMaterial({
    size: 0.04, vertexColors: true, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  })
  scene.add(new THREE.Points(pointsGeo, pointsMat))

  function update(delta: number, state: XiaoxueState, elapsed: number) {
    const t = elapsed
    const color = hexToRgb(STATE_COLORS[state] ?? 0x60a5fa)

    // Glow
    glowMat.color.setRGB(color.r, color.g, color.b)
    const glowAlpha: Record<string, number> = {
      idle: 0.25, listen: 0.3, thinking: 0.35, searching: 0.32,
      reading: 0.28, writing: 0.3, reviewing: 0.4, success: 0.6, celebrate: 0.7, warning: 0.35, error: 0.2,
    }
    glowMat.opacity = (glowAlpha[state] ?? 0.25) + Math.sin(t * 2) * 0.03

    // Particles
    const posAttr = pointsGeo.getAttribute("position") as THREE.BufferAttribute
    const colAttr = pointsGeo.getAttribute("color") as THREE.BufferAttribute
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const ix = i * 3
      let py = posAttr.array[ix + 1] as number
      py += delta * speeds[i] * 0.25
      if (py > 1.5) {
        const a = Math.random() * Math.PI * 2
        const r = 0.5 + Math.random() * 1.3
        posAttr.array[ix] = Math.cos(a) * r
        py = -1.5
        posAttr.array[ix + 2] = Math.sin(a) * r - 0.3
      }
      posAttr.array[ix + 1] = py
      colAttr.array[ix] = color.r * 0.7 + 0.3
      colAttr.array[ix + 1] = color.g * 0.7 + 0.3
      colAttr.array[ix + 2] = color.b * 0.7 + 0.3
    }
    posAttr.needsUpdate = true
    colAttr.needsUpdate = true

    pointsMat.opacity = STATE_PARTICLE_ALPHA[state] ?? 0.35
  }

  function dispose() {
    glowTex.dispose(); glowMat.dispose()
    pointsGeo.dispose(); pointsMat.dispose()
  }

  return { scene, update, dispose }
}
