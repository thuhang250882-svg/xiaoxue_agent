import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import type {
  PetWindowMode,
  XiaoxuePetAction,
  XiaoxuePetState,
  XiaoxueVoiceSettings,
} from "../preload/types"
import { XIAOXUE_STATE_VIEW } from "./AnimationController"
import { subscribePetWindowState } from "./PetEventBridge"
import { XiaoxueModel } from "./XiaoxueModel"
import {
  createChineseSpeechRecognition,
  createRemoteSpeechCapture,
  type RemoteSpeechCapture,
  startSpeechRecognition,
  XiaoxueVoicePlayback,
} from "./VoiceController"
import { VoiceSettingsPanel } from "./VoiceSettingsPanel"

const AVATAR_IMG = "/assets/pet/xiaoxue-portrait-front.png"

// A press that moves less than this before release is a click, not a drag.
// 4px was too tight for the 88px circular avatar: normal click tremor kept
// converting clicks into micro-drags, so the activation handler swallowed
// them and the pet looked completely unresponsive.
const DRAG_THRESHOLD_PX = 8

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
  const [voiceSettingsOpen, setVoiceSettingsOpen] = createSignal(false)
  const [voiceSettings, setVoiceSettings] = createSignal<XiaoxueVoiceSettings>()
  const view = createMemo(() => XIAOXUE_STATE_VIEW[state().state])
  let inputRef: HTMLTextAreaElement | undefined
  let clickTimer: ReturnType<typeof setTimeout> | undefined
  let taskTimeoutId: ReturnType<typeof setTimeout> | undefined
  let disposeTaskResult: (() => void) | undefined
  let speechRecognition: ReturnType<typeof createChineseSpeechRecognition> | RemoteSpeechCapture
  let activeTaskId: string | undefined
  let submittedTranscript = ""
  let stateBeforeInput: XiaoxuePetState | undefined
  let pendingDragPointer: number | undefined
  let drag: { pointerId: number; startX: number; startY: number; windowX: number; windowY: number } | undefined
  let dragPress: { pointerId: number; screenX: number; screenY: number } | undefined
  let dragMoved = false
  let dragFrame: number | undefined
  let dragTarget: { x: number; y: number } | undefined
  let suppressCharacterClick = false
  let suppressCharacterClickTimer: ReturnType<typeof setTimeout> | undefined
  let voiceSpeaking = false
  // 语义已从"设置穿透"变为拖拽期间的强制交互标记：false=强制可交互，
  // true=解除标记交还主进程轮询。调用点仅剩拖拽与模式切换，无需去重。
  const setMousePassthrough = (value: boolean) => {
    void window.api.xiaoxuePet.setMousePassthrough(value)
  }
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
    (text) => window.api.xiaoxuePet.synthesizeVoice(text),
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
      /* Clicking the small avatar always involves a few px of hand tremor, which
         Chromium otherwise turns into an image/text selection (the blue overlay
         that made the avatar look "selected" but dead). Keep inputs editable. */
      #root, #root * {
        -webkit-user-select: none !important;
        user-select: none !important;
      }
      #root textarea, #root input {
        -webkit-user-select: text !important;
        user-select: text !important;
      }
    `
    document.head.appendChild(styleOverride)

    // 穿透判定已移交主进程：渲染层不再监听 pointermove 做 elementFromPoint
    // 命中检测（那套方案依赖 setIgnoreMouseEvents 的 forward 低级鼠标钩子，
    // 是系统级指针漂移卡顿的根源）。这里只定期上报交互区域矩形，主进程轮询
    // 光标位置自行判断是否穿透。
    let lastRegions = ""
    const reportInteractiveRegions = () => {
      const regions = Array.from(document.querySelectorAll("[data-xiaoxue-pet-interactive]"))
        .map((el) => el.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }))
      const encoded = JSON.stringify(regions)
      if (encoded === lastRegions) return
      lastRegions = encoded
      window.api.xiaoxuePet.setInteractiveRegions?.(regions)
    }
    reportInteractiveRegions()
    const regionTimer = setInterval(reportInteractiveRegions, 200)

    const disposeState = subscribePetWindowState((next) => {
      if (voiceSpeaking && next.state !== "error") return
      setState(next)
    })
    const disposeVisibility = window.api.xiaoxuePet.onVisibility((visible) => {
      window.dispatchEvent(new CustomEvent("xiaoxue:pet-visibility", { detail: { visible } }))
    })
    const disposeMode = window.api.xiaoxuePet.onModeChanged?.((newMode) => {
      if (newMode === "avatar") setMousePassthrough(false)
      setMode(newMode)
      if (newMode === "expanded") setExpanded(false)
    })
    void window.api.xiaoxuePet.getMode().then((newMode) => {
      if (newMode === "avatar") setMousePassthrough(false)
      setMode(newMode)
    })
    void window.api.xiaoxuePet.getVoiceSettings().then(setVoiceSettings)

    disposeTaskResult = window.api.xiaoxuePet.onTaskResult?.((result) => {
      if (!activeTaskId || result.taskId !== activeTaskId) return
      if (!result.success) {
        activeTaskId = undefined
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
      if (!result.partial) {
        activeTaskId = undefined
        if (taskTimeoutId) clearTimeout(taskTimeoutId)
      }
      const tts = voiceSettings()?.tts
      const speechMode = tts?.mode === "auto" && !tts.baseURL ? "system" : (tts?.mode ?? "system")
      voicePlayback.update(result.answer, result.partial === true, autoSpeak(), speechMode)
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
      // Only interactive regions (avatar / character / panels) open the menu.
      // Transparent corners of the avatar window must stay inert.
      if (!(e.target instanceof Element) || !e.target.closest("[data-xiaoxue-pet-interactive]")) return
      // The menu is native (main-process Menu.popup): the 88x88 avatar window
      // clips any in-renderer HTML menu to the window bounds.
      void window.api.xiaoxuePet.showContextMenu()
    }
    document.addEventListener("contextmenu", onContextMenu)

    const disposeVoiceSettingsOpen = window.api.xiaoxuePet.onOpenVoiceSettings?.(() => setVoiceSettingsOpen(true))

    onCleanup(() => {
      styleOverride.remove()
      disposeState()
      disposeVisibility()
      disposeMode?.()
      disposeTaskResult?.()
      disposeVoiceSettingsOpen?.()
      clearInterval(regionTimer)
      document.removeEventListener("contextmenu", onContextMenu)
      if (clickTimer) clearTimeout(clickTimer)
      if (suppressCharacterClickTimer) clearTimeout(suppressCharacterClickTimer)
      if (taskTimeoutId) clearTimeout(taskTimeoutId)
      if (dragFrame !== undefined) cancelAnimationFrame(dragFrame)
      speechRecognition?.abort()
      resetVoicePlayback()
    })
  })

  const closeInput = () => {
    const active = speechRecognition
    speechRecognition = undefined
    active?.abort()
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

  let modeSwitching = false
  const toggleMode = async () => {
    // 快速连续按压时两次 getMode 可能读到相同旧值，导致模式来回回弹；串行化切换
    if (modeSwitching) return
    modeSwitching = true
    try {
      const current = await window.api.xiaoxuePet.getMode()
      await window.api.xiaoxuePet.setMode(current === "avatar" ? "expanded" : "avatar")
    } finally {
      modeSwitching = false
    }
  }

  const openMain = async (action: XiaoxuePetAction) => {
    const opened = await window.api.xiaoxuePet.openMain(action).catch((error: unknown) => {
      setState({
        event: "agent_state_changed",
        state: "error",
        message: error instanceof Error ? `无法打开工作台：${error.message}` : "无法打开录井小雪工作台。",
        timestamp: Date.now(),
      })
      return false
    })
    if (opened) return true
    setState({
      event: "agent_state_changed",
      state: "error",
      message: "无法打开录井小雪工作台，请确认主窗口仍在运行。",
      timestamp: Date.now(),
    })
    return false
  }

  const send = async (value = input()) => {
    const prompt = value.trim()
    if (!prompt) return
    resetVoicePlayback()
    const taskId = crypto.randomUUID()
    activeTaskId = taskId
    setState({
      event: "agent_state_changed",
      state: "thinking",
      message: "正在创建新任务…",
      timestamp: Date.now(),
    })

    if (window.api.xiaoxuePet.setPendingTask) {
      const ok = await window.api.xiaoxuePet.setPendingTask({
        taskId,
        prompt,
        agent: "xiaoxue",
        autoSubmit: true,
      })
      if (!ok) {
        activeTaskId = undefined
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
        taskId,
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

  const toggleListening = async () => {
    const active = speechRecognition
    if (active) {
      // Detach before stopping: Electron's speech service may never fire
      // onend after stop(), which would leave the button stuck in listening.
      const transcript = input().trim()
      speechRecognition = undefined
      setListening(false)
      active.stop()
      // Force-release the microphone if stop() hangs waiting for a final result.
      setTimeout(() => active.abort(), 1200)
      if (transcript && transcript !== submittedTranscript) {
        submittedTranscript = transcript
        void send(transcript)
        return
      }
      if (!submittedTranscript && state().state === "listen" && stateBeforeInput) setState(stateBeforeInput)
      return
    }
    submittedTranscript = ""
    const settings = voiceSettings() ?? (await window.api.xiaoxuePet.getVoiceSettings())
    setVoiceSettings(settings)
    if (settings.asr.mode !== "system" && settings.asr.baseURL) {
      const capture = createRemoteSpeechCapture({
        transcribe: (audio, mimeType) =>
          window.api.xiaoxuePet.transcribeVoice({ audio, mimeType }).then((result) => result.text),
        onText: setInput,
        onFinal: (text) => {
          if (!text || text === submittedTranscript) return
          submittedTranscript = text
          setListening(false)
          void send(text)
        },
        onError: (message) => {
          if (speechRecognition !== capture) return
          speechRecognition = undefined
          setListening(false)
          setState({
            event: "agent_state_changed",
            state: "warning",
            message:
              settings.asr.mode === "auto"
                ? `${message} 可切换到系统识别或继续使用文字输入。`
                : message,
            timestamp: Date.now(),
          })
        },
        onEnd: () => {
          if (speechRecognition !== capture) return
          speechRecognition = undefined
          setListening(false)
          if (!submittedTranscript && state().state === "listen" && stateBeforeInput) setState(stateBeforeInput)
        },
      })
      speechRecognition = capture
      setListening(true)
      setState({
        event: "agent_state_changed",
        state: "listen",
        message: "小雪正在本地收音，说完后再次点击麦克风即可识别并发送。",
        timestamp: Date.now(),
      })
      void capture.start().catch((error: unknown) => {
        if (speechRecognition !== capture) return
        speechRecognition = undefined
        setListening(false)
        setState({
          event: "agent_state_changed",
          state: "warning",
          message:
            error instanceof Error
              ? error.message
              : "无法启动麦克风，请检查系统权限后重试或使用文字输入。",
          timestamp: Date.now(),
        })
      })
      return
    }
    if (settings.asr.mode === "remote" && !settings.asr.baseURL) {
      setState({
        event: "agent_state_changed",
        state: "warning",
        message: "远程语音识别尚未配置 Base URL，请先打开语音设置。",
        timestamp: Date.now(),
      })
      return
    }
    const recognition = createChineseSpeechRecognition({
      onText: setInput,
      onError: (message) => {
        if (speechRecognition !== recognition) return
        speechRecognition = undefined
        submittedTranscript = ""
        setListening(false)
        setState({
          event: "agent_state_changed",
          state: "warning",
          message,
          timestamp: Date.now(),
        })
      },
      onEnd: (text) => {
        if (speechRecognition !== recognition) return
        speechRecognition = undefined
        setListening(false)
        if (submittedTranscript) return
        const transcript = text.trim()
        if (transcript) {
          submittedTranscript = transcript
          void send(transcript)
          return
        }
        if (state().state !== "listen") return
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
    if (startSpeechRecognition(recognition)) return
    speechRecognition = undefined
    setListening(false)
    setState({
      event: "agent_state_changed",
      state: "warning",
      message: "语音识别服务启动失败，请稍后重试或使用文字输入。",
      timestamp: Date.now(),
    })
  }

  const toggleAutoSpeak = () => {
    const enabled = !autoSpeak()
    setAutoSpeak(enabled)
    localStorage.setItem("xiaoxue.pet.auto-speak", String(enabled))
    if (!enabled) resetVoicePlayback()
  }

  const onCharacterClick = () => {
    if (suppressCharacterClick) {
      suppressCharacterClick = false
      if (suppressCharacterClickTimer) clearTimeout(suppressCharacterClickTimer)
      suppressCharacterClickTimer = undefined
      return
    }
    if (dragMoved) {
      dragMoved = false
      return
    }
    // Clicking the character while the voice input is active is the same
    // cancel action as closing the input: stop recognition before scheduling
    // another input toggle, so the listen animation cannot remain latched.
    if (expanded() && (listening() || (state().state === "listen" && stateBeforeInput))) {
      if (clickTimer) clearTimeout(clickTimer)
      closeInput()
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
    dragPress = { pointerId, screenX: startX, screenY: startY }
    dragMoved = false
    // 拖拽期间窗口随光标移动，主进程轮询可能短暂判定光标脱离交互区；
    // 强制保持可交互，结束时再交还轮询。
    setMousePassthrough(false)
    window.getSelection()?.removeAllRanges()
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
    if (Math.hypot(event.screenX - drag.startX, event.screenY - drag.startY) >= DRAG_THRESHOLD_PX) dragMoved = true
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
    const press = dragPress
    pendingDragPointer = undefined
    dragPress = undefined
    drag = undefined
    setMousePassthrough(true)
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    const characterInputActive = expanded() && (listening() || (state().state === "listen" && stateBeforeInput))
    if (event.type === "pointerup" && press && !dragMoved && mode() !== "avatar" && characterInputActive) {
      // Pointer capture can swallow the follow-up click after the window or
      // renderer state changes. Cancel on pointerup so the character itself
      // remains a reliable stop-listening control.
      suppressCharacterClick = true
      if (suppressCharacterClickTimer) clearTimeout(suppressCharacterClickTimer)
      suppressCharacterClickTimer = setTimeout(() => {
        suppressCharacterClick = false
        suppressCharacterClickTimer = undefined
      }, 0)
      closeInput()
      return
    }
    // Avatar activation is decided here, not in a synthetic click handler.
    // With pointer capture plus a moving window, Chromium may never dispatch
    // click/dblclick to the avatar at all — which is exactly why double-clicking
    // the avatar only "selected" it. A short, small press always expands.
    if (event.type !== "pointerup" || !press || dragMoved || mode() !== "avatar") return
    const distance = Math.hypot(event.screenX - press.screenX, event.screenY - press.screenY)
    if (distance < DRAG_THRESHOLD_PX) void toggleMode()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault()
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
            "pointer-events": "none",
          }}
        >
          <div
            data-xiaoxue-pet-interactive
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
            style={{
              position: "absolute",
              inset: "0",
              "border-radius": "50%",
              overflow: "hidden",
              cursor: "pointer",
              "touch-action": "none",
              "-webkit-app-region": "no-drag",
              // pointer-events is inherited: the avatar <main> sets none, so the
              // circle must opt back in or every click falls through to <body>
              // and the avatar is completely dead (the 1.18.4 regression).
              "pointer-events": "auto",
              background: "rgba(20,22,28,0.28)",
              border: "1.5px solid rgba(255,255,255,0.18)",
              "box-shadow": "0 8px 24px rgba(0,0,0,0.35)",
            }}
            title="单击展开小雪，拖动移动位置"
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
            "pointer-events": "none",
          }}
        >
          <Show when={voiceSettingsOpen()}>
            <div
              data-xiaoxue-pet-interactive
              style={{ position: "absolute", inset: "0", "z-index": "200", "pointer-events": "auto" }}
            >
              <VoiceSettingsPanel
                onClose={() => setVoiceSettingsOpen(false)}
                onSaved={(value) => setVoiceSettings(value)}
              />
            </div>
          </Show>
          {/* The full model layer only paints. A tighter hit target below keeps
              transparent pixels from blocking apps behind the pet window. */}
          <div
            data-testid="xiaoxue-pet-model"
            style={{
              position: "absolute",
              left: "0",
              right: "0",
              top: "20px",
              bottom: expanded() ? "64px" : "12px",
              "z-index": "10",
              background: "transparent",
              "pointer-events": "none",
            }}
          >
            <XiaoxueModel state={state().state} mode="expanded" />
          </div>
          <div
            data-testid="xiaoxue-pet-character-hitbox"
            data-xiaoxue-pet-interactive
            style={{
              position: "absolute",
              left: "31%",
              bottom: expanded() ? "68px" : "12px",
              width: "min(34vw, 110px)",
              height: "min(50vh, 230px)",
              transform: "translateX(-50%)",
              "z-index": "20",
              cursor: "pointer",
              "touch-action": "none",
              background: "transparent",
              "pointer-events": "auto",
              "-webkit-app-region": "no-drag",
            }}
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            onClick={onCharacterClick}
            onDblClick={onCharacterDoubleClick}
            title="拖动或点击小雪"
          />
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
              data-xiaoxue-pet-interactive
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
                onClick={() => void toggleListening()}
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
    </>
  )
}
