import { createEffect, createSignal, onCleanup } from "solid-js"
import type { XiaoxueState } from "./state"

const IDLE_PRIMARY_ASSET = "/assets/pet/xiaoxue-idle.webp"
const IDLE_RANDOM_ASSET = "/assets/pet/xiaoxue-idle-random.webp"
const IDLE_RANDOM_DURATION_MS = 5_100
const IDLE_RANDOM_MIN_DELAY_MS = 18_000
const IDLE_RANDOM_DELAY_RANGE_MS = 22_000

type WebPView = {
  src: string
  x: number
  y: number
  scale: number
}

const IDLE_RANDOM_VIEW: WebPView = { src: IDLE_RANDOM_ASSET, x: 6, y: -5.4, scale: 0.52 }

// Event-triggered states are one-shot reactions, not ongoing activities. Their
// WebP clips loop forever, so hold them long enough for roughly 3 loops and
// then fall back to the idle animation instead of looping indefinitely.
const TERMINAL_STATES: ReadonlySet<XiaoxueState> = new Set(["success", "celebrate", "warning", "error"])
const TERMINAL_HOLD_MS = 9_000

// Each animation has a different amount of transparent padding and may include
// asymmetric props or effects. Anchor the red-suited character instead of the
// full frame so state changes keep the character's feet and body in place.
export const XIAOXUE_WEBP_VIEWS: Record<XiaoxueState, WebPView> = {
  idle: { src: IDLE_PRIMARY_ASSET, x: -16.5, y: 0.1, scale: 0.58 },
  waiting: { src: "/assets/pet/xiaoxue-waiting.webp", x: -11.3, y: 5.7, scale: 0.65 },
  listen: { src: "/assets/pet/xiaoxue-listen.webp", x: -9.4, y: 15, scale: 1 },
  speaking: { src: "/assets/pet/xiaoxue-speaking.webp", x: -10.2, y: 7.6, scale: 0.76 },
  thinking: { src: "/assets/pet/xiaoxue-thinking.webp", x: -7.1, y: 12.3, scale: 0.74 },
  searching: { src: "/assets/pet/xiaoxue-searching.webp", x: -1.6, y: 4.4, scale: 0.63 },
  reading: { src: "/assets/pet/xiaoxue-reading.webp", x: -0.4, y: 0.3, scale: 0.6 },
  writing: { src: "/assets/pet/xiaoxue-writing.webp", x: -16.8, y: 4.7, scale: 0.73 },
  reviewing: { src: "/assets/pet/xiaoxue-reading.webp", x: -0.4, y: 0.3, scale: 0.6 },
  success: { src: "/assets/pet/xiaoxue-success.webp", x: -1.6, y: 8.6, scale: 0.73 },
  celebrate: { src: "/assets/pet/xiaoxue-celebrate.webp", x: -15.5, y: -2, scale: 0.58 },
  warning: { src: "/assets/pet/xiaoxue-waiting.webp", x: -11.3, y: 5.7, scale: 0.65 },
  error: { src: "/assets/pet/xiaoxue-error.webp", x: -20.3, y: -0.4, scale: 0.57 },
}

export function XiaoxueWebP(props: { state: XiaoxueState; class?: string }) {
  const [idleAsset, setIdleAsset] = createSignal(IDLE_PRIMARY_ASSET)
  const [display, setDisplay] = createSignal<XiaoxueState>(props.state)
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let terminalTimer: ReturnType<typeof setTimeout> | undefined

  const clearIdleTimer = () => {
    if (idleTimer !== undefined) clearTimeout(idleTimer)
    idleTimer = undefined
  }

  const clearTerminalTimer = () => {
    if (terminalTimer !== undefined) clearTimeout(terminalTimer)
    terminalTimer = undefined
  }

  const scheduleIdleVariation = () => {
    idleTimer = setTimeout(() => {
      setIdleAsset(IDLE_RANDOM_ASSET)
      idleTimer = setTimeout(() => {
        setIdleAsset(IDLE_PRIMARY_ASSET)
        scheduleIdleVariation()
      }, IDLE_RANDOM_DURATION_MS)
    }, IDLE_RANDOM_MIN_DELAY_MS + Math.random() * IDLE_RANDOM_DELAY_RANGE_MS)
  }

  createEffect(() => {
    const state = props.state
    clearTerminalTimer()
    setDisplay(state)
    if (TERMINAL_STATES.has(state)) terminalTimer = setTimeout(() => setDisplay("idle"), TERMINAL_HOLD_MS)
  })

  createEffect(() => {
    const state = display()
    clearIdleTimer()
    setIdleAsset(IDLE_PRIMARY_ASSET)
    if (state === "idle") scheduleIdleVariation()
  })

  onCleanup(() => {
    clearIdleTimer()
    clearTerminalTimer()
  })

  const view = () =>
    display() === "idle" && idleAsset() === IDLE_RANDOM_ASSET ? IDLE_RANDOM_VIEW : XIAOXUE_WEBP_VIEWS[display()]

  return (
    <img
      src={view().src}
      alt="录井小雪状态动画"
      class={props.class ?? "h-full w-full object-contain object-bottom"}
      style={{
        transform: `translate(${view().x}%, ${view().y}%) scale(${view().scale})`,
        "transform-origin": "center bottom",
      }}
      draggable={false}
    />
  )
}
