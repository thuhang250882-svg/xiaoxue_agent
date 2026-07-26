import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import type { PetWindowMode, XiaoxuePetAction, XiaoxuePetState } from "../preload/types"
import { XIAOXUE_STATE_VIEW } from "./AnimationController"
import { subscribePetWindowState } from "./PetEventBridge"
import { XiaoxueModel } from "./XiaoxueModel"
import { createChineseSpeechRecognition, XiaoxueVoicePlayback } from "./VoiceController"

const AVATAR_IMG = "/assets/pet/xiaoxue-portrait-front.png"

const initialState: XiaoxuePetState = {
  event: "agent_state_changed",
  state: "idle",
  message: "你好，我是录井小雪。今天需要我帮你做什么？",
  timestamp: Date.now(),
}

export function XiaoxuePetWindow() {
  const [state, setState] = createSignal(initialState)
  const [expanded, setExpanded] = createSignal(false)
  const [input, setInput] = createSignal("")
  const [hovered, setHovered] = createSignal(false)
  const [listening, setListening] = createSignal(false)
  const [autoSpeak, setAutoSpeak] = createSignal(localStorage.getItem("xiaoxue.pet.auto-speak") !== "false")
  const [mode, setMode] = createSignal<PetWindowMode>("expanded")
  const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number } | null>(null)
  const view = createMemo(() => XIAOXUE_STATE_VIEW[state().state])
  let inputRef: HTMLTextAreaElement | undefined
  let clickTimer: ReturnType<typeof setTimeout> | undefined
  let taskTimeoutId: ReturnType<typeof setTimeout> | undefined
  let disposeTaskResult: (() => void) | undefined
  let speechRecognition: ReturnType<typeof createChineseSpeechRecognition>
  let submittedTranscript = ""
  let stateBeforeInput: XiaoxuePetState | undefined
  let pendingDragPointer: number | undefined
  let drag: { pointerId: number; startX: number; startY: number; windowX: number; windowY: number } | undefined
  let dragMoved = false
  let dragFrame: number | undefined
  let dragTarget: { x: number; y: number } | undefined
  let voiceSpeaking = false
  const voicePlayback = new XiaoxueVoicePlayback(
    () => {
      voiceSpeaking = true
      setState({
        event: "agent_state_changed",
        state: "speaking",
        message: "小雪正在语音回答。",
        timestamp: Date.now(),
      })
    },
    () => {
      voiceSpeaking = false
      setState({
        event: "agent_state_changed",
        state: "success",
        message: "回答完成，可继续向小雪提问。",
        timestamp: Date.now(),
      })
    },
    (message) => {
      voiceSpeaking = false
      setState({
        event: "agent_state_changed",
        state: "warning",
        message,
        timestamp: Date.now(),
      })
    },
  )
  const resetVoicePlayback = () => {
    voiceSpeaking = false
    voicePlayback.reset()
  }

  onMount(() => {
    document.documentElement.style.background = "transparent"
    document.documentElement.style.colorScheme = "normal"
    document.body.style.background = "transparent"
    document.body.style.margin = "0"
    document.body.style.overflow = "hidden"
    const root = document.getElementById("root")
    if (root) {
      root.style.background = "transparent"
      root.style.position = "absolute"
      root.style.inset = "0"
      root.style.overflow = "hidden"
    }
    const styleOverride = document.createElement("style")
    styleOverride.textContent = `
      html, body, #root {
        background: transparent !important;
        background-color: transparent !important;
        margin: 0 !important;
      }
    `
    document.head.appendChild(styleOverride)

    const disposeState = subscribePetWindowState((next) => {
      if (voiceSpeaking && next.state !== "error") return
      setState(next)
    })
    const disposeVisibility = window.api.xiaoxuePet.onVisibility((visible) => {
      window.dispatchEvent(new CustomEvent("xiaoxue:pet-visibility", { detail: { visible } }))
    })
    const disposeMode = window.api.xiaoxuePet.onModeChanged?.((newMode) => {
      setMode(newMode)
      if (newMode === "expanded") setExpanded(false)
    })
    void window.api.xiaoxuePet.getMode().then(setMode)

    disposeTaskResult = window.api.xiaoxuePet.onTaskResult?.((result) => {
      if (!result.success) {
        if (taskTimeoutId) clearTimeout(taskTimeoutId)
        resetVoicePlayback()
        setState({
          event: "agent_state_changed",
          state: "error",
          message: result.error || "模型连接失败，请检查 Provider 或网络设置。",
          timestamp: Date.now(),
        })
        return
      }
      if (!result.answer) return
      if (!result.partial && taskTimeoutId) clearTimeout(taskTimeoutId)
      voicePlayback.update(result.answer, result.partial === true, autoSpeak())
      if (autoSpeak()) return
      setState({
        event: "agent_state_changed",
        state: result.partial ? "thinking" : "success",
        message: result.partial ? "小雪正在生成回答…" : result.answer.slice(0, 120),
        timestamp: Date.now(),
      })
    })

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      setContextMenu({ x: e.clientX, y: e.clientY })
    }
    document.addEventListener("contextmenu", onContextMenu)

    onCleanup(() => {
      styleOverride.remove()
      disposeState()
      disposeVisibility()
      disposeMode?.()
      disposeTaskResult?.()
      document.removeEventListener("contextmenu", onContextMenu)
      if (clickTimer) clearTimeout(clickTimer)
      if (taskTimeoutId) clearTimeout(taskTimeoutId)
      if (dragFrame !== undefined) cancelAnimationFrame(dragFrame)
      speechRecognition?.abort()
      resetVoicePlayback()
    })
  })

  const closeInput = () => {
    speechRecognition?.abort()
    speechRecognition = undefined
    setListening(false)
    setExpanded(false)
    if (state().state === "listen" && stateBeforeInput) setState(stateBeforeInput)
    stateBeforeInput = undefined
  }

  const toggleInput = () => {
    if (expanded()) {
      closeInput()
      return
    }
    stateBeforeInput = state()
    setExpanded(true)
    queueMicrotask(() => inputRef?.focus())
  }

  const toggleMode = async () => {
    const current = await window.api.xiaoxuePet.getMode()
    await window.api.xiaoxuePet.setMode(current === "avatar" ? "expanded" : "avatar")
  }

  const openMain = async (action: XiaoxuePetAction) => {
    const opened = await window.api.xiaoxuePet.openMain(action)
    if (opened) return true
    setState({
      event: "agent_state_changed",
      state: "error",
      message: "无法创建新任务，请打开录井小雪工作台后重试。",
      timestamp: Date.now(),
    })
    return false
  }

  const send = async (value = input()) => {
    const prompt = value.trim()
    if (!prompt) return
    resetVoicePlayback()
    setState({
      event: "agent_state_changed",
      state: "thinking",
      message: "正在创建新任务…",
      timestamp: Date.now(),
    })

    if (window.api.xiaoxuePet.setPendingTask) {
      const ok = await window.api.xiaoxuePet.setPendingTask({
        prompt,
        agent: "xiaoxue",
        autoSubmit: true,
      })
      if (!ok) {
        setState({
          event: "agent_state_changed",
          state: "error",
          message: "任务发送失败，请确保工作台已打开。",
          timestamp: Date.now(),
        })
        return
      }
    } else {
      const opened = await openMain({
        id: "new-task",
        action: "new-task",
        label: "新任务",
        agent: "xiaoxue",
        prompt,
        autoSubmit: true,
        source: "xiaoxue-pet",
      })
      if (!opened) return
    }

    setInput("")
    setExpanded(false)

    if (taskTimeoutId) clearTimeout(taskTimeoutId)
    taskTimeoutId = setTimeout(() => {
      setState((prev) => {
        if (prev.state !== "thinking") return prev
        return {
          ...prev,
          state: "warning",
          message: "任务处理时间较长，请在工作台查看进度。",
        }
      })
    }, 90_000)
  }

  const toggleListening = () => {
    const active = speechRecognition
    if (active) {
      // Detach before stopping: Electron's speech service may never fire
      // onend after stop(), which would leave the button stuck in listening.
      speechRecognition = undefined
      setListening(false)
      active.stop()
      // Force-release the microphone if stop() hangs waiting for a final result.
      setTimeout(() => active.abort(), 1200)
      if (!submittedTranscript && state().state === "listen" && !input().trim() && stateBeforeInput)
        setState(stateBeforeInput)
      return
    }
    submittedTranscript = ""
    const recognition = createChineseSpeechRecognition({
      onText: setInput,
      onFinal: (text) => {
        if (!text || text === submittedTranscript) return
        submittedTranscript = text
        setListening(false)
        void send(text)
      },
      onError: (message) => {
        if (speechRecognition !== recognition) return
        submittedTranscript = ""
        setListening(false)
        setState({
          event: "agent_state_changed",
          state: "warning",
          message,
          timestamp: Date.now(),
        })
      },
      onEnd: () => {
        if (speechRecognition !== recognition) return
        speechRecognition = undefined
        setListening(false)
        if (submittedTranscript) return
        if (state().state !== "listen" || input().trim()) return
        if (stateBeforeInput) setState(stateBeforeInput)
      },
    })
    if (!recognition) {
      setState({
        event: "agent_state_changed",
        state: "warning",
        message: "当前系统不支持语音识别，请使用文字输入或更新桌面运行环境。",
        timestamp: Date.now(),
      })
      return
    }
    speechRecognition = recognition
    setListening(true)
    setState({
      event: "agent_state_changed",
      state: "listen",
      message: "小雪正在听，请直接说出问题。",
      timestamp: Date.now(),
    })
    recognition.start()
  }

  const toggleAutoSpeak = () => {
    const enabled = !autoSpeak()
    setAutoSpeak(enabled)
    localStorage.setItem("xiaoxue.pet.auto-speak", String(enabled))
    if (!enabled) resetVoicePlayback()
  }

  const onCharacterClick = () => {
    if (dragMoved) {
      dragMoved = false
      return
    }
    if (mode() === "avatar") {
      void toggleMode()
      return
    }
    if (state().state === "idle") window.dispatchEvent(new CustomEvent("xiaoxue:pet-interaction"))
    if (clickTimer) clearTimeout(clickTimer)
    clickTimer = setTimeout(toggleInput, 220)
  }

  const onCharacterDoubleClick = () => {
    if (dragMoved) {
      dragMoved = false
      return
    }
    if (clickTimer) clearTimeout(clickTimer)
    void openMain({ id: "open-main", label: "打开工作台", agent: "xiaoxue" })
  }

  const onDragStart = (event: PointerEvent & { currentTarget: HTMLElement }) => {
    if (event.button !== 0) return
    const pointerId = event.pointerId
    const startX = event.screenX
    const startY = event.screenY
    pendingDragPointer = pointerId
    dragMoved = false
    event.currentTarget.setPointerCapture(pointerId)
    void window.api.xiaoxuePet.getPosition().then((position) => {
      if (!position || pendingDragPointer !== pointerId) return
      drag = { pointerId, startX, startY, windowX: position.x, windowY: position.y }
    })
  }

  const onDragMove = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return
    const x = drag.windowX + event.screenX - drag.startX
    const y = drag.windowY + event.screenY - drag.startY
    if (Math.hypot(event.screenX - drag.startX, event.screenY - drag.startY) >= 4) dragMoved = true
    if (!dragMoved) return
    dragTarget = { x, y }
    if (dragFrame !== undefined) return
    dragFrame = requestAnimationFrame(() => {
      dragFrame = undefined
      const target = dragTarget
      dragTarget = undefined
      if (target) void window.api.xiaoxuePet.setPosition(target.x, target.y)
    })
  }

  const onDragEnd = (event: PointerEvent & { currentTarget: HTMLElement }) => {
    if (pendingDragPointer !== event.pointerId) return
    pendingDragPointer = undefined
    drag = undefined
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault()
      if (contextMenu()) {
        setContextMenu(null)
        return
      }
      closeInput()
      return
    }
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return
    event.preventDefault()
    void send()
  }

  const STATUS_DOT_COLORS: Record<string, string> = {
    idle: "#9ca3af",
    waiting: "#64748b",
    listen: "#3b82f6",
    speaking: "#8b5cf6",
    thinking: "#3b82f6",
    searching: "#3b82f6",
    reading: "#3b82f6",
    writing: "#3b82f6",
    reviewing: "#f97316",
    success: "#22c55e",
    celebrate: "#22c55e",
    warning: "#f59e0b",
    error: "#ef4444",
  }

  return (
    <>
      {/* ─── Avatar mode: 2D halfbody circular icon ─── */}
      <Show when={mode() === "avatar"}>
        <main
          data-testid="xiaoxue-pet-avatar"
          style={{
            position: "relative",
            width: "100vw",
            height: "100vh",
            overflow: "hidden",
            background: "transparent",
            "border-radius": "50%",
            margin: "0",
            padding: "0",
          }}
        >
          <div
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
            onClick={onCharacterClick}
            onDblClick={onCharacterDoubleClick}
            style={{
              position: "absolute",
              inset: "0",
              "border-radius": "50%",
              overflow: "hidden",
              cursor: "pointer",
              "touch-action": "none",
              "-webkit-app-region": "no-drag",
              background: "rgba(20,22,28,0.28)",
              border: "1.5px solid rgba(255,255,255,0.18)",
              "box-shadow": "0 8px 24px rgba(0,0,0,0.35)",
            }}
          >
            <img
              src={AVATAR_IMG}
              alt="录井小雪"
              style={{
                width: "100%",
                height: "100%",
                "object-fit": "cover",
                "pointer-events": "none",
              }}
              draggable={false}
            />
          </div>
          {/* Status dot */}
          <div
            style={{
              position: "absolute",
              bottom: "3px",
              right: "3px",
              width: "12px",
              height: "12px",
              "border-radius": "50%",
              border: "2px solid white",
              background: STATUS_DOT_COLORS[state().state] || "#9ca3af",
              "box-shadow": "0 1px 3px rgba(0,0,0,0.4)",
            }}
          />
        </main>
      </Show>

      {/* ─── Expanded mode: 3D model + input ─── */}
      <Show when={mode() !== "avatar"}>
        <main
          data-testid="xiaoxue-pet-shell"
          data-expanded={expanded() ? "true" : "false"}
          style={{
            position: "relative",
            width: "100vw",
            height: "100vh",
            overflow: "hidden",
            background: "transparent",
            margin: "0",
            padding: "0",
          }}
        >
          {/* Drag bar: manual drag via IPC — native app-region drag grows
              transparent resizable windows on Windows DPI scaling */}
          <div
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
            style={{
              position: "absolute",
              left: "0",
              right: "0",
              top: "0",
              height: "20px",
              "z-index": "40",
              cursor: "grab",
              "touch-action": "none",
              "-webkit-app-region": "no-drag",
            }}
            title="拖动小雪"
          />
          {/* 3D model area */}
          <div
            data-testid="xiaoxue-pet-model"
            style={{
              position: "absolute",
              left: "0",
              right: "0",
              top: "20px",
              bottom: expanded() ? "64px" : "12px",
              "z-index": "10",
              cursor: "pointer",
              "touch-action": "none",
              background: "transparent",
            }}
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            onClick={onCharacterClick}
            onDblClick={onCharacterDoubleClick}
          >
            <XiaoxueModel state={state().state} mode="expanded" />
          </div>
          {/* Hover tooltip */}
          <Show when={hovered() && !expanded()}>
            <div
              style={{
                "pointer-events": "none",
                position: "absolute",
                left: "24px",
                right: "24px",
                top: "32px",
                "z-index": "30",
                "border-radius": "10px",
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(24,26,32,0.95)",
                padding: "10px 14px",
                "box-shadow": "0 8px 24px rgba(0,0,0,0.4)",
                "backdrop-filter": "blur(12px)",
              }}
            >
              <div style={{ "font-size": "12px", "font-weight": "600", color: "rgba(255,255,255,0.95)" }}>
                {view().title}
              </div>
              <div
                style={{
                  "margin-top": "2px",
                  "font-size": "11px",
                  "line-height": "16px",
                  color: "rgba(255,255,255,0.60)",
                }}
              >
                {state().message || view().action}
              </div>
            </div>
          </Show>
          {/* Chat input panel */}
          <Show when={expanded()}>
            <section
              data-testid="xiaoxue-pet-chat"
              style={{
                position: "absolute",
                bottom: "12px",
                left: "12px",
                right: "12px",
                "z-index": "100",
                display: "flex",
                "align-items": "flex-end",
                gap: "8px",
                "border-radius": "14px",
                border: "1px solid rgba(255,255,255,0.22)",
                background: "rgba(20,22,28,0.92)",
                padding: "10px",
                "box-shadow": "0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)",
                "backdrop-filter": "blur(12px)",
                "-webkit-app-region": "no-drag",
                "pointer-events": "auto",
              }}
            >
              <button
                type="button"
                title={listening() ? "停止语音输入" : "语音提问"}
                aria-label={listening() ? "停止语音输入" : "语音提问"}
                onClick={toggleListening}
                style={{
                  height: "32px",
                  width: "32px",
                  flex: "0 0 auto",
                  "border-radius": "8px",
                  border: "none",
                  cursor: "pointer",
                  background: listening() ? "rgba(239,68,68,0.24)" : "rgba(255,255,255,0.10)",
                  color: listening() ? "#fca5a5" : "#ffffff",
                  "-webkit-app-region": "no-drag",
                  "pointer-events": "auto",
                }}
              >
                {listening() ? "■" : "🎙"}
              </button>
              <textarea
                ref={inputRef}
                rows={1}
                value={input()}
                placeholder="跟小雪说点什么……"
                style={{
                  "max-height": "58px",
                  "min-height": "32px",
                  "min-width": "0",
                  flex: "1",
                  resize: "none",
                  overflow: "auto",
                  "border-radius": "8px",
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "rgba(8,10,14,0.82)",
                  padding: "8px 12px",
                  "font-size": "12px",
                  "line-height": "16px",
                  color: "#f7f8fa",
                  outline: "none",
                  "caret-color": "#ffffff",
                  "scrollbar-width": "none",
                  "-webkit-app-region": "no-drag",
                  "font-family": "inherit",
                }}
                onFocus={() =>
                  setState({
                    event: "agent_state_changed",
                    state: "listen",
                    message: "小雪正在听你说。",
                    timestamp: Date.now(),
                  })
                }
                onInput={(event) => setInput(event.currentTarget.value)}
                onKeyDown={onKeyDown}
              />
              <button
                type="button"
                title={autoSpeak() ? "关闭自动播报" : "开启自动播报"}
                aria-label={autoSpeak() ? "关闭自动播报" : "开启自动播报"}
                onClick={toggleAutoSpeak}
                style={{
                  height: "32px",
                  width: "32px",
                  flex: "0 0 auto",
                  "border-radius": "8px",
                  border: "none",
                  cursor: "pointer",
                  background: autoSpeak() ? "rgba(59,130,246,0.22)" : "rgba(255,255,255,0.06)",
                  color: autoSpeak() ? "#bfdbfe" : "rgba(255,255,255,0.45)",
                  "-webkit-app-region": "no-drag",
                  "pointer-events": "auto",
                }}
              >
                {autoSpeak() ? "🔊" : "🔇"}
              </button>
              <button
                type="button"
                disabled={!input().trim()}
                onClick={() => void send()}
                style={{
                  height: "32px",
                  flex: "0 0 auto",
                  "border-radius": "8px",
                  border: "none",
                  padding: "0 12px",
                  "font-size": "12px",
                  "font-weight": "500",
                  cursor: input().trim() ? "pointer" : "default",
                  background: input().trim() ? "rgba(255,255,255,0.13)" : "rgba(255,255,255,0.06)",
                  color: input().trim() ? "#ffffff" : "rgba(255,255,255,0.35)",
                  "-webkit-app-region": "no-drag",
                  "pointer-events": "auto",
                  "font-family": "inherit",
                }}
              >
                发送
              </button>
            </section>
          </Show>
        </main>
      </Show>

      {/* ─── Context menu ─── */}
      <Show when={contextMenu()}>
        <div
          style={{
            position: "fixed",
            left: `${contextMenu()!.x}px`,
            top: `${contextMenu()!.y}px`,
            "min-width": "180px",
            padding: "6px",
            background: "rgba(24,26,32,0.97)",
            color: "#f7f8fa",
            border: "1px solid rgba(255,255,255,0.16)",
            "border-radius": "12px",
            "box-shadow": "0 14px 42px rgba(0,0,0,0.5)",
            "backdrop-filter": "blur(14px)",
            "z-index": "9999",
            "-webkit-app-region": "no-drag",
            "pointer-events": "auto",
          }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <button
            onClick={() => {
              setContextMenu(null)
              void toggleMode()
            }}
            style={{
              display: "block",
              width: "100%",
              padding: "8px 12px",
              border: "none",
              background: "transparent",
              color: "rgba(255,255,255,0.95)",
              "text-align": "left",
              "font-size": "13px",
              cursor: "pointer",
              "border-radius": "8px",
              "font-family": "inherit",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {mode() === "avatar" ? "展开小雪" : "收起为头像"}
          </button>
          <button
            onClick={() => {
              setContextMenu(null)
              void openMain({ id: "open-main", label: "打开工作台", agent: "xiaoxue" })
            }}
            style={{
              display: "block",
              width: "100%",
              padding: "8px 12px",
              border: "none",
              background: "transparent",
              color: "rgba(255,255,255,0.95)",
              "text-align": "left",
              "font-size": "13px",
              cursor: "pointer",
              "border-radius": "8px",
              "font-family": "inherit",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            打开工作台
          </button>
          <div style={{ margin: "4px 12px", "border-top": "1px solid rgba(255,255,255,0.12)" }} />
          <button
            onClick={() => {
              setContextMenu(null)
              window.api.xiaoxuePet.setMode?.("hidden")
            }}
            style={{
              display: "block",
              width: "100%",
              padding: "8px 12px",
              border: "none",
              background: "transparent",
              color: "#ff8d8d",
              "text-align": "left",
              "font-size": "13px",
              cursor: "pointer",
              "border-radius": "8px",
              "font-family": "inherit",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            隐藏小雪
          </button>
        </div>
      </Show>
    </>
  )
}
