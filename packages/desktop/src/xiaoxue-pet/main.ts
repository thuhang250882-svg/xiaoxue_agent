import { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } from "electron"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type {
  XiaoxuePetAction,
  XiaoxuePetState,
  XiaoxuePetTaskResult,
  XiaoxueVoiceSettingsUpdate,
} from "../preload/types"
import { normalizePetState } from "./PetStateMapper"
import { XIAOXUE_PET_WINDOW, type PetWindowMode } from "./config"
import { allowWindowPermissions, createMainWindow, getWindowID } from "../main/windows"
import { write as writeLog } from "../main/logging"
import { getVoiceSettings, synthesizeVoice, transcribeVoice, updateVoiceSettings } from "./voice-service"
import {
  createPetTask,
  markPetTaskDelivered,
  markPetTaskRunning,
  recordPetTaskResult,
  recoverPetTask,
  type PendingPetTask,
} from "./task-ledger"
import { isPendingTask } from "./task-ledger-core"

const root = dirname(fileURLToPath(import.meta.url))
const petQuery = "window=xiaoxue-pet"
let pendingPetTask: PendingPetTask | null = null
let activePetTaskId: string | undefined
let currentMode: PetWindowMode = "expanded"
let expandedSize: { width: number; height: number } = {
  width: XIAOXUE_PET_WINDOW.width,
  height: XIAOXUE_PET_WINDOW.height,
}

let petWindow: BrowserWindow | undefined
let tray: Tray | undefined
let currentState: XiaoxuePetState = {
  event: "agent_state_changed",
  state: "idle",
  message: "你好，我是录井小雪。今天需要我帮你做什么？",
  timestamp: Date.now(),
}

// ─── Mouse Passthrough ────────────────────────────────────────────────────────
// Windows 上 setIgnoreMouseEvents 的 forward 转发模式会安装系统级 WH_MOUSE_LL
// 低级鼠标钩子：整机每一次鼠标移动都要绕经本进程，进程一忙系统指针就漂移、
// 卡顿（用户实测切换对话后尤其明显）。改为渲染层定期上报交互区域矩形，由
// 主进程轮询光标位置决定穿透，完全不使用 forward 钩子。
type InteractiveRegion = { x: number; y: number; width: number; height: number }
let interactiveRegions: InteractiveRegion[] = []
let forceInteractive = false
let ignoringMouse = false
let cursorPollTimer: ReturnType<typeof setInterval> | undefined

function applyIgnoreMouse(window: BrowserWindow, value: boolean) {
  if (ignoringMouse === value) return
  ignoringMouse = value
  window.setIgnoreMouseEvents(value)
}

function pollCursorPassthrough() {
  const window = petWindow
  if (!window || window.isDestroyed()) return
  // 头像模式没有透明交互区，隐藏时无需穿透；拖拽期间渲染层强制保持可交互。
  if (currentMode !== "expanded" || !window.isVisible() || forceInteractive) {
    applyIgnoreMouse(window, false)
    return
  }
  const point = screen.getCursorScreenPoint()
  const bounds = window.getContentBounds()
  const x = point.x - bounds.x
  const y = point.y - bounds.y
  const inside = x >= 0 && y >= 0 && x <= bounds.width && y <= bounds.height
  const hit =
    inside &&
    interactiveRegions.some(
      (region) =>
        x >= region.x && x <= region.x + region.width && y >= region.y && y <= region.y + region.height,
    )
  applyIgnoreMouse(window, !hit)
}

function isInteractiveRegion(item: unknown): item is InteractiveRegion {
  if (typeof item !== "object" || item === null) return false
  const region = item as Record<string, unknown>
  return (
    typeof region.x === "number" &&
    Number.isFinite(region.x) &&
    typeof region.y === "number" &&
    Number.isFinite(region.y) &&
    typeof region.width === "number" &&
    Number.isFinite(region.width) &&
    typeof region.height === "number" &&
    Number.isFinite(region.height)
  )
}

// ─── System Tray ──────────────────────────────────────────────────────────────

function loadTrayIcon() {
  const icon = [
    join(app.getAppPath(), "resources", "icons", "icon.ico"),
    join(app.getAppPath(), "resources", "icons", "32x32.png"),
    join(root, "../../resources/icons/icon.ico"),
    join(root, "../../resources/icons/32x32.png"),
  ]
    .map((path) => nativeImage.createFromPath(path))
    .find((image) => !image.isEmpty())

  if (icon) return icon.resize({ width: 16, height: 16 })

  const fallback = nativeImage.createFromDataURL(
    "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="8" fill="#d92d20"/><path d="M4 8h8M8 4v8" stroke="white" stroke-width="1.5"/></svg>',
      ),
  )
  console.error("failed to load xiaoxue tray icon from packaged resources")
  return fallback.resize({ width: 16, height: 16 })
}

function setPetWindowMode(mode: PetWindowMode) {
  const window = petWindow
  const previousMode = currentMode
  currentMode = mode
  if (!window || window.isDestroyed()) return

  if (mode === "hidden") {
    window.hide()
    window.webContents.send("xiaoxue-pet-mode-changed", mode)
    return
  }

  const config = XIAOXUE_PET_WINDOW
  if (previousMode === "expanded" && mode === "avatar") {
    const [width, height] = window.getSize()
    if (width >= config.minWidth && height >= config.minHeight) expandedSize = { width, height }
  }

  if (mode === "avatar") {
    // The expanded window may currently ignore mouse input while the pointer is
    // over transparent pixels. Avatar mode has no transparent interaction area,
    // so restore native input before resizing or the visible avatar cannot be clicked.
    applyIgnoreMouse(window, false)
    const [x, y] = window.getPosition()
    const [width, height] = window.getSize()
    window.setMinimumSize(config.avatar.size, config.avatar.size)
    window.setMaximumSize(config.avatar.size, config.avatar.size)
    window.setSize(config.avatar.size, config.avatar.size, true)
    window.setPosition(
      Math.max(0, x + width - config.avatar.size - config.margin),
      Math.max(0, y + height - config.avatar.size - config.margin),
      true,
    )
    window.setResizable(false)
  }

  if (mode === "expanded") {
    // 头像模式或上一次拖拽遗留的强制交互标记不能带进展开模式，否则窗口的
    // 透明区域永远无法穿透。
    forceInteractive = false
    const width = Math.max(config.minWidth, Math.min(config.maxWidth, expandedSize.width))
    const height = Math.max(config.minHeight, Math.min(config.maxHeight, expandedSize.height))
    window.setResizable(true)
    window.setMinimumSize(0, 0)
    window.setMaximumSize(config.maxWidth, config.maxHeight)
    window.setMinimumSize(config.minWidth, config.minHeight)
    // Anchor the expanded window's bottom-right corner to the avatar's current
    // bottom-right corner (mirroring the collapse offset). Without this, the pet
    // jumps to the primary display corner on every expand — users who dragged the
    // avatar elsewhere (or to a secondary monitor) think the expand never happened.
    const [avatarX, avatarY] = window.getPosition()
    const anchorX = avatarX + config.avatar.size + config.margin
    const anchorY = avatarY + config.avatar.size + config.margin
    const display = screen.getDisplayNearestPoint({ x: Math.round(avatarX), y: Math.round(avatarY) }).workArea
    window.setBounds(
      {
        x: Math.round(Math.max(display.x, Math.min(display.x + display.width - width, anchorX - width))),
        y: Math.round(Math.max(display.y, Math.min(display.y + display.height - height, anchorY - height))),
        width,
        height,
      },
      true,
    )
  }

  if (!window.isVisible()) window.show()
  window.setBackgroundColor("#00000000")
  window.webContents.send("xiaoxue-pet-mode-changed", mode)
}

function createTray() {
  if (tray) return tray

  tray = new Tray(loadTrayIcon())
  tray.setToolTip("录井小雪")

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "展开小雪",
        click: () => {
          open()
          setPetWindowMode("expanded")
        },
      },
      {
        label: "收起为头像",
        click: () => setPetWindowMode("avatar"),
      },
      {
        label: "隐藏小雪",
        click: () => setPetWindowMode("hidden"),
      },
      { type: "separator" },
      {
        label: "打开工作台",
        click: () => openMain({ id: "open-main", label: "打开工作台", agent: "xiaoxue" }),
      },
      { type: "separator" },
      {
        label: "退出小雪",
        click: () => {
          if (petWindow && !petWindow.isDestroyed()) petWindow.destroy()
          if (tray && !tray.isDestroyed()) tray.destroy()
          petWindow = undefined
          tray = undefined
        },
      },
    ]),
  )

  tray.on("click", () => {
    if (!petWindow || petWindow.isDestroyed()) {
      currentMode = "expanded"
      open()
      return
    }
    if (petWindow.isVisible()) {
      setPetWindowMode("hidden")
      return
    }
    const mode = currentMode === "hidden" ? "avatar" : currentMode
    open()
    setPetWindowMode(mode)
  })

  return tray
}

// IPC Handlers
export function registerXiaoxuePetWindow() {
  ipcMain.handle("xiaoxue-pet-open", () => open())
  ipcMain.handle("xiaoxue-pet-hide", () => {
    setPetWindowMode("hidden")
    ensureTray()
  })
  ipcMain.handle("xiaoxue-pet-set-always-on-top", (_event, value: boolean) => petWindow?.setAlwaysOnTop(value))
  ipcMain.handle("xiaoxue-pet-set-mouse-passthrough", (event, value: boolean) => {
    const window = petWindow
    if (!window || window.isDestroyed() || event.sender !== window.webContents) return
    // 渲染层仅在拖拽等强交互期间调用 false 强制关闭穿透（轮询期间窗口移动会
    // 让光标短暂脱离命中区域，若中途开启穿透会打断拖拽）；调用 true 只是解除
    // 强制标记，实际穿透状态交回光标轮询决定。
    forceInteractive = value === false
    if (currentMode === "avatar" || forceInteractive) applyIgnoreMouse(window, false)
  })
  ipcMain.on("xiaoxue-pet-set-interactive-regions", (event, value: unknown) => {
    const window = petWindow
    if (!window || window.isDestroyed() || event.sender !== window.webContents) return
    if (!Array.isArray(value)) return
    interactiveRegions = value.filter(isInteractiveRegion)
  })
  ipcMain.on("xiaoxue-pet-publish-state", (_event, value: unknown) => {
    const next = normalizePetState(value)
    if (!next) return
    // 切换对话后 agent 会密集产生状态事件；状态与文案都未变化的重复推送只会
    // 挤占桌宠渲染和主线程（表现为指针卡顿），仅在真正变化时才转发。
    if (next.state === currentState.state && next.message === currentState.message) return
    currentState = next
    petWindow?.webContents.send("xiaoxue-pet-state", currentState)
  })
  ipcMain.handle("xiaoxue-pet-get-state", () => currentState)
  ipcMain.handle("xiaoxue-pet-open-main", (_event, action: XiaoxuePetAction) => openMain(action))
  ipcMain.handle("xiaoxue-pet-get-size", () => {
    if (!petWindow || petWindow.isDestroyed()) return null
    const [width, height] = petWindow.getSize()
    return { width, height }
  })
  ipcMain.handle("xiaoxue-pet-set-size", (_event, width: number, height: number) => {
    if (!petWindow || petWindow.isDestroyed() || currentMode !== "expanded") return
    const clampedW = Math.round(Math.max(XIAOXUE_PET_WINDOW.minWidth, Math.min(XIAOXUE_PET_WINDOW.maxWidth, width)))
    const clampedH = Math.round(Math.max(XIAOXUE_PET_WINDOW.minHeight, Math.min(XIAOXUE_PET_WINDOW.maxHeight, height)))
    expandedSize = { width: clampedW, height: clampedH }
    petWindow.setSize(clampedW, clampedH, true)
  })
  ipcMain.handle("xiaoxue-pet-get-position", () => {
    if (!petWindow || petWindow.isDestroyed()) return null
    const [x, y] = petWindow.getPosition()
    return { x, y }
  })
  ipcMain.handle("xiaoxue-pet-set-position", (_event, x: number, y: number) => {
    if (!petWindow || petWindow.isDestroyed() || !Number.isFinite(x) || !Number.isFinite(y)) return
    // Pin width/height on every move: on Windows with non-100% DPI scaling, setPosition
    // re-rounds the DIP size each call and transparent windows grow a few px per frame.
    const width = currentMode === "avatar" ? XIAOXUE_PET_WINDOW.avatar.size : expandedSize.width
    const height = currentMode === "avatar" ? XIAOXUE_PET_WINDOW.avatar.size : expandedSize.height
    const workArea = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) }).workArea
    petWindow.setBounds({
      x: Math.round(Math.max(workArea.x, Math.min(workArea.x + workArea.width - width, x))),
      y: Math.round(Math.max(workArea.y, Math.min(workArea.y + workArea.height - height, y))),
      width,
      height,
    })
  })

  // PendingPetTask: deterministic task delivery from pet to main window
  ipcMain.handle(
    "xiaoxue-pet-set-pending-task",
    (event, task: PendingPetTask) => {
      if (!petWindow || event.sender !== petWindow.webContents || !isPendingTask(task)) {
        throw new Error("拒绝无效的桌宠任务。")
      }
      pendingPetTask = task
      createPetTask(task)
      activePetTaskId = task.taskId
      return openMain({
        id: "new-task",
        taskId: task.taskId,
        action: "new-task",
        agent: task.agent,
        prompt: task.prompt,
        autoSubmit: task.autoSubmit,
        source: "xiaoxue-pet",
      })
    },
  )
  ipcMain.handle("xiaoxue-pet-consume-pending-task", () => {
    if (!pendingPetTask) pendingPetTask = recoverPetTask() ?? null
    if (pendingPetTask) markPetTaskDelivered(pendingPetTask.taskId)
    return pendingPetTask
  })
  ipcMain.handle("xiaoxue-pet-acknowledge-pending-task", (_event, taskId: string) => {
    if (pendingPetTask?.taskId !== taskId) return
    pendingPetTask = null
    markPetTaskRunning(taskId)
  })
  ipcMain.on("xiaoxue-pet-task-result", (event, result: XiaoxuePetTaskResult) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || !getWindowID(win)) return
    if (!activePetTaskId || result.taskId !== activePetTaskId) return
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send("xiaoxue-pet-task-result", result)
    }
    recordPetTaskResult(result.taskId, result)
    if (!result.success || (result.answer && !result.partial)) activePetTaskId = undefined
  })
  ipcMain.handle("xiaoxue-pet-get-voice-settings", () => getVoiceSettings())
  ipcMain.handle("xiaoxue-pet-update-voice-settings", (_event, settings: XiaoxueVoiceSettingsUpdate) =>
    updateVoiceSettings(settings),
  )
  ipcMain.handle("xiaoxue-pet-transcribe-voice", (_event, input: { audio: ArrayBuffer; mimeType: string }) =>
    transcribeVoice(input),
  )
  ipcMain.handle("xiaoxue-pet-synthesize-voice", (_event, text: string) => synthesizeVoice(text))

  // Window mode management
  ipcMain.handle("xiaoxue-pet-get-mode", () => currentMode)
  ipcMain.handle("xiaoxue-pet-set-mode", (_event, mode: PetWindowMode) => setPetWindowMode(mode))

  // Native context menu: the pet renderer is far too small in avatar mode
  // (88x88) to host an HTML menu — anything beyond the window bounds is
  // clipped by the native window, which hid most menu items. A native popup
  // menu is painted by the OS and is never clipped.
  ipcMain.handle("xiaoxue-pet-show-context-menu", (event) => {
    const window = petWindow
    if (!window || window.isDestroyed() || event.sender !== window.webContents) return
    const menu = Menu.buildFromTemplate([
      {
        label: currentMode === "avatar" ? "展开小雪" : "收起为头像",
        click: () => setPetWindowMode(currentMode === "avatar" ? "expanded" : "avatar"),
      },
      {
        label: "打开工作台",
        click: () => openMain({ id: "open-main", label: "打开工作台", agent: "xiaoxue" }),
      },
      {
        label: "语音设置",
        click: () => {
          if (currentMode !== "expanded") setPetWindowMode("expanded")
          window.webContents.send("xiaoxue-pet-open-voice-settings")
        },
      },
      { type: "separator" },
      {
        label: "隐藏小雪",
        click: () => setPetWindowMode("hidden"),
      },
    ])
    menu.popup({ window })
  })

  // Create tray on startup
  ensureTray()

  return { open }
}

function ensureTray() {
  if (!tray || tray.isDestroyed()) {
    createTray()
  }
}

// ─── Pet Window ───────────────────────────────────────────────────────────────

function open() {
  ensureTray()

  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.show()
    petWindow.focus()
    petWindow.webContents.send("xiaoxue-pet-visibility", true)
    return
  }

  const display = screen.getPrimaryDisplay().workArea
  petWindow = new BrowserWindow({
    width: XIAOXUE_PET_WINDOW.width,
    height: XIAOXUE_PET_WINDOW.height,
    minWidth: XIAOXUE_PET_WINDOW.minWidth,
    minHeight: XIAOXUE_PET_WINDOW.minHeight,
    maxWidth: XIAOXUE_PET_WINDOW.maxWidth,
    maxHeight: XIAOXUE_PET_WINDOW.maxHeight,
    x: display.x + display.width - XIAOXUE_PET_WINDOW.width - XIAOXUE_PET_WINDOW.margin,
    y: display.y + display.height - XIAOXUE_PET_WINDOW.height - XIAOXUE_PET_WINDOW.margin,
    transparent: true,
    frame: false,
    resizable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: XIAOXUE_PET_WINDOW.alwaysOnTop,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: join(root, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Grant renderer permissions (microphone for voice input) to this window too
  allowWindowPermissions(petWindow)

  // 20Hz 的 GetCursorPos 轮询开销可忽略，且只在展开模式做命中判断
  if (cursorPollTimer) clearInterval(cursorPollTimer)
  cursorPollTimer = setInterval(pollCursorPassthrough, 50)

  const url = new URL(`index.html?${petQuery}`, process.env.ELECTRON_RENDERER_URL ?? "oc://renderer/")
  const loadingWindow = petWindow
  void loadingWindow.loadURL(url.toString()).catch((error) => {
    console.error("failed to load xiaoxue pet window", error)
    if (!loadingWindow.isDestroyed()) loadingWindow.destroy()
  })
  // Ensure native background stays transparent (guard against theme broadcasts)
  petWindow.setBackgroundColor("#00000000")
  petWindow.once("ready-to-show", () => {
    petWindow?.show()
    setPetWindowMode(currentMode)
    petWindow?.webContents.send("xiaoxue-pet-state", currentState)
    petWindow?.webContents.send("xiaoxue-pet-visibility", true)
    petWindow?.webContents.send("xiaoxue-pet-mode-changed", currentMode)
  })

  // Track user-driven resizes so position pinning keeps the latest expanded size
  petWindow.on("resized", () => {
    if (!petWindow || petWindow.isDestroyed() || currentMode !== "expanded") return
    const [width, height] = petWindow.getSize()
    if (width >= XIAOXUE_PET_WINDOW.minWidth && height >= XIAOXUE_PET_WINDOW.minHeight)
      expandedSize = { width, height }
  })

  // When window is closed (X button or destroyed), keep tray
  petWindow.on("closed", () => {
    petWindow = undefined
    if (cursorPollTimer) clearInterval(cursorPollTimer)
    cursorPollTimer = undefined
    interactiveRegions = []
    forceInteractive = false
    ignoringMouse = false
    // Tray stays alive — user can reopen from tray
  })

  // When window is hidden, tray stays
  petWindow.on("hide", () => {
    petWindow?.webContents.send("xiaoxue-pet-visibility", false)
  })
}

function openMain(action: XiaoxuePetAction) {
  const existing = findMainWindow()
  const main = existing ?? createMainWindow()
  writeLog("xiaoxue-pet", "opening workbench", {
    action: action.id,
    created: !existing,
    windowID: getWindowID(main),
  })
  showMainWindow(main)
  if (main.webContents.isLoadingMainFrame()) {
    main.webContents.once("did-finish-load", () => main.webContents.send("xiaoxue-pet-action", action))
    return true
  }
  main.webContents.send("xiaoxue-pet-action", action)
  return true
}

function findMainWindow() {
  const windows = BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed())
  return (
    windows.find((window) => Boolean(getWindowID(window))) ??
    windows.find((window) => !window.webContents.getURL().includes(petQuery))
  )
}

function showMainWindow(main: BrowserWindow) {
  if (main.isMinimized()) main.restore()
  main.show()
  main.focus()
  main.webContents.focus()
  main.moveTop()
}
