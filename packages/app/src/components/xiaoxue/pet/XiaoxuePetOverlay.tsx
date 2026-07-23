/**
 * XiaoxuePetOverlay
 *
 * Desktop pet: transparent WebP character + chat input.
 * - Expanded: anchored WebP animation + minimize button + chat input at bottom
 * - Minimized: compact avatar circle (half-body portrait)
 * - No top menu — only bottom chat input
 */

import {
  createSignal,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js"
import { usePetState } from "./usePetState"
import { XiaoxueWebP } from "./XiaoxueWebP"
import { PET_ANIMATION_STYLES } from "./animations"
import { usePlatform } from "@/context/platform"

export function XiaoxuePetOverlay() {
  const platform = usePlatform()
  const { petState } = usePetState()
  if (platform.xiaoxuePet) return null
  const [minimized, setMinimized] = createSignal(false)
  const [chatInput, setChatInput] = createSignal("")
  const [chatFocused, setChatFocused] = createSignal(false)

  // ── Drag state ──
  const [pos, setPos] = createSignal({ x: 0, y: 0 })
  const [dragging, setDragging] = createSignal(false)
  let dragStart = { x: 0, y: 0 }
  let posStart = { x: 0, y: 0 }
  let dragMoved = false

  onMount(() => {
    const style = document.createElement("style")
    style.textContent = PET_ANIMATION_STYLES
    document.head.appendChild(style)
    onCleanup(() => style.remove())

    // Toggle expanded ↔ minimized
    const toggleHandler = () => setMinimized((prev) => !prev)
    window.addEventListener("xiaoxue:toggle-pet", toggleHandler)
    onCleanup(() => window.removeEventListener("xiaoxue:toggle-pet", toggleHandler))

    // Session start from chat
    const sessionHandler = ((e: CustomEvent) => {
      const d = e.detail as { prompt?: string; agent?: string; autoSubmit?: boolean }
      if (d.prompt) {
        window.dispatchEvent(new CustomEvent("xiaoxue:new-session", { detail: d }))
      }
    }) as EventListener
    window.addEventListener("xiaoxue:start-session", sessionHandler)
    onCleanup(() => window.removeEventListener("xiaoxue:start-session", sessionHandler))

    // Global drag
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging()) return
      dragMoved = true
      setPos({ x: posStart.x + (e.clientX - dragStart.x), y: posStart.y + (e.clientY - dragStart.y) })
    }
    const onMouseUp = () => { if (dragging()) setDragging(false) }
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    onCleanup(() => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    })
  })

  const onDragStart = (e: MouseEvent) => {
    e.preventDefault()
    dragMoved = false
    setDragging(true)
    dragStart = { x: e.clientX, y: e.clientY }
    posStart = { ...pos() }
  }

  const submitChat = () => {
    const text = chatInput().trim()
    if (!text) return
    window.dispatchEvent(
      new CustomEvent("xiaoxue:start-session", {
        detail: { prompt: text, agent: "xiaoxue", autoSubmit: true },
      }),
    )
    setChatInput("")
  }

  return (
    <Show
      when={!minimized()}
      fallback={
        /* ━━━ MINIMIZED ━━━ */
        <div
          class="fixed z-[9999] select-none"
          style={{ right: "16px", bottom: "16px", transform: `translate(${pos().x}px, ${pos().y}px)` }}
          onMouseDown={onDragStart}
        >
          <button
            type="button"
            class="group flex size-14 items-center justify-center rounded-full border-2 border-v2-border-border-muted bg-v2-background-bg-layer-01 shadow-[var(--v2-elevation-floating)] transition-all duration-200 hover:scale-110 overflow-hidden"
            onClick={() => { if (!dragMoved) setMinimized(false) }}
            title="展开小雪"
          >
            <img src="/assets/pet/xiaoxue-portrait-front.png" alt="录井小雪" class="size-full object-cover object-top"
              onError={(e) => { (e.target as HTMLImageElement).src = "/logo-xiaoxue.png" }} />
          </button>
          <span
            class="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-v2-background-bg-layer-01"
            classList={{
              "bg-v2-text-text-muted": petState().state === "idle",
              "bg-blue-500 animate-pulse": ["waiting","listen","speaking","thinking","searching","reading","writing"].includes(petState().state),
              "bg-orange-500 animate-pulse": petState().state === "reviewing",
              "bg-green-500": petState().state === "success" || petState().state === "celebrate",
              "bg-red-500 animate-pulse": petState().state === "error",
            }}
          />
        </div>
      }
    >
      /* ━━━ EXPANDED: character + chat ━━━ */
      <div
        class="fixed z-[9999] select-none"
        style={{ right: "16px", bottom: "0px", width: "220px", transform: `translate(${pos().x}px, ${pos().y}px)` }}
      >
        {/* Character — draggable, clickable to minimize */}
        <div
          class="relative"
          style={{ height: "320px" }}
          onMouseDown={onDragStart}
          onClick={() => { if (!dragMoved) setMinimized(true) }}
        >
          <XiaoxueWebP state={petState().state} />

          {/* Minimize button */}
          <button
            type="button"
            class="absolute top-1 right-1 z-10 flex size-6 items-center justify-center rounded-full border border-black/10 bg-white/80 text-gray-500 backdrop-blur-sm shadow-sm transition-all duration-150 hover:bg-white hover:text-gray-700 hover:scale-110"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setMinimized(true) }}
            title="最小化"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2 6h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>

          {/* Drag hint */}
          <Show when={petState().state === "idle" && !dragging()}>
            <div class="absolute bottom-1 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap rounded-full bg-black/30 px-2 py-0.5 text-[9px] text-white/70 backdrop-blur-sm pointer-events-none">
              拖动 · 点击收起
            </div>
          </Show>
        </div>

        {/* Chat input — bottom only */}
        <div
          class="rounded-xl border border-v2-border-border-muted bg-v2-background-bg-layer-01 shadow-[0_4px_16px_rgba(0,0,0,0.08)] transition-all duration-200"
          classList={{ "ring-1 ring-blue-400/20": chatFocused() }}
          onClick={(e) => e.stopPropagation()}
        >
          <div class="flex items-center gap-1.5 px-2.5 py-1.5">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" class="shrink-0 text-v2-text-text-muted" aria-hidden="true">
              <path d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v6a1.5 1.5 0 01-1.5 1.5H5.5L3 14V11H3.5A1.5 1.5 0 012 9.5v-6z" fill="currentColor"/>
            </svg>
            <input
              type="text"
              class="min-w-0 flex-1 bg-transparent text-[11px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint"
              placeholder="跟小雪说点什么..."
              value={chatInput()}
              onFocus={() => setChatFocused(true)}
              onBlur={() => setTimeout(() => setChatFocused(false), 150)}
              onInput={(e) => setChatInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); submitChat() }
              }}
            />
            <Show when={chatInput().trim()}>
              <button
                type="button"
                class="flex size-5 shrink-0 items-center justify-center rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                onMouseDown={(e) => { e.preventDefault(); submitChat() }}
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3.5 2.5l10 5.5-10 5.5 1-5.5-1-5.5z" fill="currentColor"/>
                </svg>
              </button>
            </Show>
          </div>
          <Show when={chatFocused() && !chatInput()}>
            <div class="px-2.5 pb-1.5 -mt-0.5 text-[9px] text-v2-text-text-faint">发送后将自动创建新对话</div>
          </Show>
        </div>
      </div>
    </Show>
  )
}
