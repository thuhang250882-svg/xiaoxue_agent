/**
 * ParticleCanvas
 *
 * Lightweight Canvas-based particle system that renders ambient particles
 * behind the pet avatar. Particle color and intensity change with the
 * pet's current state.
 */

import { createEffect, onCleanup, onMount } from "solid-js"
import type { XiaoxueState } from "./state"
import { PET_VISUAL_MAP } from "./state"

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  alpha: number
  color: string
  life: number
  maxLife: number
}

const MAX_PARTICLES = 40

export function ParticleCanvas(props: {
  state: XiaoxueState
  width?: number
  height?: number
}) {
  let canvas: HTMLCanvasElement | undefined
  let ctx: CanvasRenderingContext2D | undefined
  let animationId: number | undefined
  let particles: Particle[] = []

  const w = () => props.width ?? 320
  const h = () => props.height ?? 320

  function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (!match) return null
    return {
      r: parseInt(match[1], 16),
      g: parseInt(match[2], 16),
      b: parseInt(match[3], 16),
    }
  }

  function spawnParticle(config: { color: string; intensity: number }) {
    const rgb = hexToRgb(config.color)
    if (!rgb) return

    const count = Math.ceil(config.intensity * 3)
    for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 0.15 + Math.random() * 0.4
      particles.push({
        x: w() / 2 + (Math.random() - 0.5) * 80,
        y: h() / 2 + (Math.random() - 0.5) * 80,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.2,
        radius: 1.5 + Math.random() * 2.5,
        alpha: 0.3 + Math.random() * 0.4,
        color: `${rgb.r}, ${rgb.g}, ${rgb.b}`,
        life: 0,
        maxLife: 80 + Math.random() * 120,
      })
    }
  }

  function draw() {
    if (!ctx) return

    ctx.clearRect(0, 0, w(), h())

    const config = PET_VISUAL_MAP[props.state]

    // Spawn new particles
    if (particles.length < MAX_PARTICLES * config.particleIntensity) {
      spawnParticle({ color: config.particleColor, intensity: config.particleIntensity })
    }

    // Update and draw
    const alive: Particle[] = []
    for (const p of particles) {
      p.life++
      p.x += p.vx
      p.y += p.vy
      p.vx *= 0.99
      p.vy *= 0.99

      const lifeRatio = p.life / p.maxLife
      const fadeAlpha = lifeRatio < 0.2 ? lifeRatio / 0.2 : lifeRatio > 0.7 ? (1 - lifeRatio) / 0.3 : 1
      const finalAlpha = p.alpha * fadeAlpha

      if (p.life < p.maxLife && finalAlpha > 0.01) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${p.color}, ${finalAlpha})`
        ctx.fill()
        alive.push(p)
      }
    }
    particles = alive

    animationId = requestAnimationFrame(draw)
  }

  onMount(() => {
    if (!canvas) return
    ctx = canvas.getContext("2d") ?? undefined
    if (ctx) {
      canvas.width = w()
      canvas.height = h()
      animationId = requestAnimationFrame(draw)
    }
  })

  onCleanup(() => {
    if (animationId !== undefined) cancelAnimationFrame(animationId)
    particles = []
  })

  createEffect(() => {
    // Re-init canvas size on prop change
    if (canvas && ctx) {
      canvas.width = w()
      canvas.height = h()
    }
  })

  return (
    <canvas
      ref={canvas}
      width={w()}
      height={h()}
      class="pointer-events-none absolute inset-0 z-0"
      aria-hidden="true"
    />
  )
}
