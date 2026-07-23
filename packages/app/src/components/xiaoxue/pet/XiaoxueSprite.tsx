/**
 * XiaoxueSprite — 2.5D Pet Renderer
 *
 * Renders the Xiaoxue character as a sprite with:
 * - Crossfade between pose images on state change
 * - Breathing animation (translateY + scale)
 * - Micro sway (rotateZ)
 * - Mouse parallax
 * - Ground shadow ellipse
 * - State-colored glow particles (Three.js)
 * - Status text bubble (auto-fade)
 *
 * This is the default rendering mode (replaces GLB).
 */

import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js"
import type { XiaoxueState } from "./state"
import { PET_VISUAL_MAP, PET_DEFAULT_MESSAGES } from "./state"
import { getPoseForState, samePose } from "./XiaoxuePoseMapper"
import { XIAOXUE_POSE_ASSETS } from "./asset-manifest"
import { createSpriteController } from "./XiaoxueSpriteController"
import { createPetEffects } from "./XiaoxueEffects"

// ─── Image Cache ──────────────────────────────────────────────────────────────

const imageCache = new Map<string, HTMLImageElement>()
const imageLoadPromises = new Map<string, Promise<HTMLImageElement>>()

function getCachedImage(src: string): HTMLImageElement | undefined {
  return imageCache.get(src)
}

function preloadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src)
  if (cached) return Promise.resolve(cached)

  const existing = imageLoadPromises.get(src)
  if (existing) return existing

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      imageCache.set(src, img)
      resolve(img)
    }
    img.onerror = () => reject(new Error(`Failed to load ${src}`))
    img.src = src
  })

  imageLoadPromises.set(src, promise)
  return promise
}

// ─── Component ────────────────────────────────────────────────────────────────

export function XiaoxueSprite(props: {
  state: XiaoxueState
  width?: number
  height?: number
  showBubble?: boolean
}) {
  let canvasRef: HTMLCanvasElement | undefined
  let ctx: CanvasRenderingContext2D | undefined
  let rafId: number | undefined
  let petEffects: ReturnType<typeof createPetEffects> | undefined

  const w = () => props.width ?? 240
  const h = () => props.height ?? 360

  const controller = createSpriteController()
  const [currentState, setCurrentState] = createSignal<XiaoxueState>("idle")
  const [prevImage, setPrevImage] = createSignal<HTMLImageElement | null>(null)
  const [curImage, setCurImage] = createSignal<HTMLImageElement | null>(null)
  const [crossfade, setCrossfade] = createSignal(1) // 0=old, 1=new
  const [bubbleText, setBubbleText] = createSignal("")
  const [bubbleOpacity, setBubbleOpacity] = createSignal(0)
  const [mousePos, setMousePos] = createSignal({ x: 0, y: 0 })

  let lastState: XiaoxueState = "idle"
  let crossfadeTimer: ReturnType<typeof setTimeout> | undefined
  let bubbleTimer: ReturnType<typeof setTimeout> | undefined

  // ── Preload all images on mount ──
  onMount(() => {
    // Preload all pose images
    for (const asset of XIAOXUE_POSE_ASSETS) {
      void preloadImage(asset.file).catch(() => {})
    }
    // Set initial image
    const mapping = getPoseForState("idle")
    const img = getCachedImage(mapping.asset.file)
    if (img) setCurImage(img)
    else {
      void preloadImage(mapping.asset.file).then(setCurImage).catch(() => {})
    }
  })

  // ── React to state changes ──
  createEffect(
    on(
      () => props.state,
      (newState) => {
        if (newState === lastState) return
        lastState = newState
        setCurrentState(newState)

        const mapping = getPoseForState(newState)

        // Trigger controller effects
        if (newState === "success" || newState === "celebrate") controller.triggerBounce()
        if (newState === "warning" || newState === "error") controller.triggerShake()

        // Update bubble
        setBubbleText(PET_DEFAULT_MESSAGES[newState])
        setBubbleOpacity(1)
        clearTimeout(bubbleTimer)
        bubbleTimer = setTimeout(() => {
          if (newState !== "idle") setBubbleOpacity(0.3)
          else setBubbleOpacity(0)
        }, 3500)

        // Crossfade if different pose
        if (!samePose(newState, lastState) || !curImage()) {
          const img = getCachedImage(mapping.asset.file)
          if (img) {
            setPrevImage(curImage())
            setCurImage(img)
            setCrossfade(0)
            // Animate crossfade
            const startTime = performance.now()
            const duration = 220 // ms
            const animate = () => {
              const progress = Math.min(1, (performance.now() - startTime) / duration)
              setCrossfade(progress)
              if (progress < 1) requestAnimationFrame(animate)
            }
            requestAnimationFrame(animate)
          } else {
            void preloadImage(mapping.asset.file).then((img) => {
              setPrevImage(curImage())
              setCurImage(img)
              setCrossfade(0)
              const startTime = performance.now()
              const animate = () => {
                const progress = Math.min(1, (performance.now() - startTime) / 220)
                setCrossfade(progress)
                if (progress < 1) requestAnimationFrame(animate)
              }
              requestAnimationFrame(animate)
            }).catch(() => {})
          }
        }
      },
    ),
  )

  // ── Mouse tracking for parallax ──
  onMount(() => {
    const handler = (e: MouseEvent) => {
      const cx = window.innerWidth / 2
      const cy = window.innerHeight / 2
      setMousePos({ x: (e.clientX - cx) / cx, y: (e.clientY - cy) / cy })
    }
    window.addEventListener("mousemove", handler)
    onCleanup(() => window.removeEventListener("mousemove", handler))
  })

  // ── Render loop ──
  onMount(() => {
    if (!canvasRef) return
    ctx = canvasRef.getContext("2d")!
    canvasRef.width = w()
    canvasRef.height = h()

    const mp = mousePos()
    controller.setMousePosition(mp.x, mp.y)

    function loop() {
      controller.update(1 / 60)
      draw()
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)
  })

  createEffect(
    on(mousePos, (pos) => {
      controller.setMousePosition(pos.x, pos.y)
    }),
  )

  createEffect(
    on([w, h], ([newW, newH]) => {
      if (canvasRef && ctx) {
        canvasRef.width = newW
        canvasRef.height = newH
      }
    }),
  )

  function draw() {
    if (!ctx) return
    const cw = w()
    const ch = h()
    const frame = controller.state
    const mapping = getPoseForState(currentState())

    ctx.clearRect(0, 0, cw, ch)

    // ── Ground shadow ──
    const shadowY = ch * 0.92
    const shadowWidth = cw * 0.35 * frame.shadowScale
    const shadowHeight = 8 * frame.shadowScale
    ctx.save()
    ctx.globalAlpha = frame.shadowOpacity
    ctx.fillStyle = "#000"
    ctx.beginPath()
    ctx.ellipse(cw / 2, shadowY, shadowWidth, shadowHeight, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // ── Draw sprite images ──
    const old = prevImage()
    const cur = curImage()
    const cf = crossfade()

    // Calculate draw area
    const drawSprite = (img: HTMLImageElement, alpha: number) => {
      if (alpha <= 0 || !img) return
      const imgAspect = img.naturalWidth / img.naturalHeight
      const maxH = ch * 0.88
      const maxW = cw * 0.9
      let drawW: number, drawH: number
      if (imgAspect > maxW / maxH) {
        drawW = maxW
        drawH = maxW / imgAspect
      } else {
        drawH = maxH
        drawW = maxH * imgAspect
      }

      const drawX = (cw - drawW) / 2 + frame.parallaxX
      const drawY = (ch - drawH) - ch * 0.04 + frame.translateY + frame.parallaxY

      ctx!.save()
      ctx!.globalAlpha = alpha
      ctx!.translate(cw / 2, ch / 2)
      ctx!.rotate((frame.rotateZ * Math.PI) / 180)
      ctx!.scale(frame.scale, frame.scale)
      ctx!.translate(-cw / 2, -ch / 2)
      ctx!.drawImage(img, drawX, drawY, drawW, drawH)
      ctx!.restore()
    }

    if (old && cf < 1) drawSprite(old, 1 - cf)
    if (cur) drawSprite(cur, cf >= 1 ? 1 : cf)

    // ── Status bubble ──
    const bOpacity = bubbleOpacity()
    if (bOpacity > 0 && bubbleText()) {
      const text = bubbleText()
      const maxLines = 2
      const lineLen = 14
      const lines: string[] = []
      for (let i = 0; i < text.length && lines.length < maxLines; i += lineLen) {
        lines.push(text.slice(i, i + lineLen))
      }

      ctx.save()
      ctx.globalAlpha = bOpacity
      const fontSize = 11
      ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
      const lineHeight = fontSize + 4
      const padding = 8
      const maxWidth = Math.max(...lines.map((l) => ctx!.measureText(l).width))
      const bubbleW = maxWidth + padding * 2
      const bubbleH = lines.length * lineHeight + padding * 2
      const bubbleX = (cw - bubbleW) / 2
      const bubbleY = 8

      // Bubble background
      ctx.fillStyle = "rgba(255, 255, 255, 0.92)"
      ctx.strokeStyle = "rgba(0, 0, 0, 0.08)"
      ctx.lineWidth = 1
      ctx.beginPath()
      const r = 8
      ctx.moveTo(bubbleX + r, bubbleY)
      ctx.lineTo(bubbleX + bubbleW - r, bubbleY)
      ctx.quadraticCurveTo(bubbleX + bubbleW, bubbleY, bubbleX + bubbleW, bubbleY + r)
      ctx.lineTo(bubbleX + bubbleW, bubbleY + bubbleH - r)
      ctx.quadraticCurveTo(bubbleX + bubbleW, bubbleY + bubbleH, bubbleX + bubbleW - r, bubbleY + bubbleH)
      ctx.lineTo(bubbleX + r, bubbleY + bubbleH)
      ctx.quadraticCurveTo(bubbleX, bubbleY + bubbleH, bubbleX, bubbleY + bubbleH - r)
      ctx.lineTo(bubbleX, bubbleY + r)
      ctx.quadraticCurveTo(bubbleX, bubbleY, bubbleX + r, bubbleY)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      // Text
      ctx.fillStyle = "#374151"
      ctx.textAlign = "center"
      ctx.textBaseline = "top"
      lines.forEach((line, i) => {
        ctx!.fillText(line, cw / 2, bubbleY + padding + i * lineHeight)
      })
      ctx.restore()
    }
  }

  onCleanup(() => {
    if (rafId !== undefined) cancelAnimationFrame(rafId)
    clearTimeout(crossfadeTimer)
    clearTimeout(bubbleTimer)
    petEffects?.dispose()
  })

  return (
    <canvas
      ref={canvasRef}
      width={w()}
      height={h()}
      class="pointer-events-none absolute inset-0 z-0"
      style={{ width: `${w()}px`, height: `${h()}px` }}
      aria-hidden="true"
    />
  )
}
