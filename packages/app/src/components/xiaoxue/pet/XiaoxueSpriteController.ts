/**
 * XiaoxueSpriteController
 *
 * Manages per-frame animation state for the 2.5D sprite:
 * - Breathing (idle vertical oscillation + micro scale)
 * - Center-of-gravity sway (micro rotation)
 * - Mouse parallax (position offset based on cursor)
 * - Ground shadow (ellipse that breathes with character)
 * - Crossfade between pose images
 */

export type SpriteFrameState = {
  /** Vertical offset in px */
  translateY: number
  /** Scale factor (1.0 = normal) */
  scale: number
  /** Rotation in degrees */
  rotateZ: number
  /** Parallax offset in px */
  parallaxX: number
  parallaxY: number
  /** Shadow opacity (0-1) */
  shadowOpacity: number
  /** Shadow scale */
  shadowScale: number
  /** Crossfade: old image opacity (0-1) */
  crossfadeOld: number
  /** Crossfade: new image opacity (0-1) */
  crossfadeNew: number
}

export type SpriteController = {
  /** Current interpolated frame state */
  state: SpriteFrameState
  /** Call once per frame with delta time (seconds) */
  update: (delta: number) => void
  /** Set the mouse position relative to the window center (-1 to 1) */
  setMousePosition: (nx: number, ny: number) => void
  /** Trigger a one-shot success bounce */
  triggerBounce: () => void
  /** Trigger a one-shot warning shake */
  triggerShake: () => void
  /** Set animation intensity: 0=off, 1=simple, 2=full */
  setIntensity: (level: 0 | 1 | 2) => void
}

const BREATH_PERIOD = 4.0 // seconds
const BREATH_AMPLITUDE_Y = 3.0 // px
const BREATH_SCALE_MIN = 0.997
const BREATH_SCALE_MAX = 1.003
const SWAY_MAX_DEG = 0.6
const SWAY_PERIOD = 5.5 // seconds
const PARLAX_MAX_PX = 6.0
const PARLAX_EASE = 4.0 // lerp speed
const SHADOW_BASE_OPACITY = 0.18
const SHADOW_BREATHE_RANGE = 0.04
const CROSSFADE_SPEED = 4.0 // transitions per second

export function createSpriteController(): SpriteController {
  const frame: SpriteFrameState = {
    translateY: 0,
    scale: 1,
    rotateZ: 0,
    parallaxX: 0,
    parallaxY: 0,
    shadowOpacity: SHADOW_BASE_OPACITY,
    shadowScale: 1,
    crossfadeOld: 1,
    crossfadeNew: 0,
  }

  let elapsed = 0
  let mouseX = 0
  let mouseY = 0
  let targetParallaxX = 0
  let targetParallaxY = 0
  let intensity: 0 | 1 | 2 = 2

  // One-shot animations
  let bounceTime = -10 // seconds since last bounce
  let shakeTime = -10

  function update(delta: number) {
    elapsed += delta
    const t = elapsed

    if (intensity === 0) {
      // All animations off
      frame.translateY = 0
      frame.scale = 1
      frame.rotateZ = 0
      frame.parallaxX = 0
      frame.parallaxY = 0
      frame.shadowOpacity = SHADOW_BASE_OPACITY
      frame.shadowScale = 1
      return
    }

    const breathAmp = intensity === 1 ? BREATH_AMPLITUDE_Y * 0.5 : BREATH_AMPLITUDE_Y

    // ── Breathing ──
    const breathCycle = Math.sin((t / BREATH_PERIOD) * Math.PI * 2)
    frame.translateY = breathCycle * breathAmp

    // ── Scale breathing ──
    const scaleRange = (BREATH_SCALE_MAX - BREATH_SCALE_MIN) / 2
    const scaleCenter = (BREATH_SCALE_MAX + BREATH_SCALE_MIN) / 2
    frame.scale = scaleCenter + breathCycle * scaleRange * (intensity === 1 ? 0.5 : 1)

    // ── Sway ──
    const swayCycle = Math.sin((t / SWAY_PERIOD) * Math.PI * 2)
    frame.rotateZ = swayCycle * SWAY_MAX_DEG * (intensity === 1 ? 0.5 : 1)

    // ── Parallax (smooth follow) ──
    targetParallaxX = mouseX * PARLAX_MAX_PX
    targetParallaxY = mouseY * PARLAX_MAX_PX * 0.5
    frame.parallaxX += (targetParallaxX - frame.parallaxX) * Math.min(1, delta * PARLAX_EASE)
    frame.parallaxY += (targetParallaxY - frame.parallaxY) * Math.min(1, delta * PARLAX_EASE)

    // ── Shadow ──
    frame.shadowOpacity = SHADOW_BASE_OPACITY + breathCycle * SHADOW_BREATHE_RANGE
    frame.shadowScale = 1.0 + breathCycle * 0.03

    // ── Bounce (one-shot) ──
    const bounceDelta = t - bounceTime
    if (bounceDelta < 0.6) {
      const bounceProgress = bounceDelta / 0.6
      const bounceCurve = Math.sin(bounceProgress * Math.PI)
      frame.translateY -= bounceCurve * 12
      frame.scale += bounceCurve * 0.03
    }

    // ── Shake (one-shot) ──
    const shakeDelta = t - shakeTime
    if (shakeDelta < 0.5) {
      const shakeProgress = shakeDelta / 0.5
      const shakeCurve = Math.sin(shakeProgress * Math.PI * 6) * (1 - shakeProgress)
      frame.rotateZ += shakeCurve * 3
    }
  }

  function setMousePosition(nx: number, ny: number) {
    mouseX = Math.max(-1, Math.min(1, nx))
    mouseY = Math.max(-1, Math.min(1, ny))
  }

  function triggerBounce() {
    bounceTime = elapsed
  }

  function triggerShake() {
    shakeTime = elapsed
  }

  function setIntensity(level: 0 | 1 | 2) {
    intensity = level
  }

  return { state: frame, update, setMousePosition, triggerBounce, triggerShake, setIntensity }
}
