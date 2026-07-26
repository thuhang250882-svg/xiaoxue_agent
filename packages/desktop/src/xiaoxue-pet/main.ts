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
import { allowWindowPermissions, getWindowID } from "../main/windows"
import { getVoiceSettings, synthesizeVoice, transcribeVoice, updateVoiceSettings } from "./voice-service"
import { TaskLedger, type PendingPetTask } from "./task-ledger"
import { TaskLedgerCore } from "./task-ledger-core"

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
    const width = Math.max(config.minWidth, Math.min(config.maxWidth, expandedSize.width))
    const height = Math.max(config.minHeight, Math.min(config.maxHeight, expandedSize.height))
    window.setResizable(true)
    window.setMinimumSize(0, 0)
    window.setMaximumSize(config.maxWidth, config.maxHeight)
    window.setMinimumSize(config.minWidth, config.minHeight)
    const display = screen.getPrimaryDisplay().workArea
    window.setBounds(
      {
        x: display.x + display.width - width - config.margin,
        y: display.y + display.height - height - config.margin,
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
        click: () => {
          const main = findMainWindow()
          if (!main) return
          showMainWindow(main)
        },
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
  ipcMain.handle("xiaoxue-pet-set-mouse-passthrough", (_event, value: boolean) =>
    petWindow?.setIgnoreMouseEvents(value, { forward: true }),
  )
  ipcMain.on("xiaoxue-pet-publish-state", (_event, value: unknown) => {
    const next = normalizePetState(value)
    if (!next) return
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
      if (!petWindow || event.sender !== petWindow.webContents || !TaskLedgerCore.isPendingTask(task)) {
        throw new Error("拒绝无效的桌宠任务。")
      }
      pendingPetTask = task
      TaskLedger.create(task)
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
    if (!pendingPetTask) pendingPetTask = TaskLedger.recover() ?? null
    if (pendingPetTask) TaskLedger.delivered(pendingPetTask.taskId)
    return pendingPetTask
  })
  ipcMain.handle("xiaoxue-pet-acknowledge-pending-task", (_event, taskId: string) => {
    if (pendingPetTask?.taskId !== taskId) return
    pendingPetTask = null
    TaskLedger.running(taskId)
  })
  ipcMain.on("xiaoxue-pet-task-result", (event, result: XiaoxuePetTaskResult) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || !getWindowID(win)) return
    if (!activePetTaskId || result.taskId !== activePetTaskId) return
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send("xiaoxue-pet-task-result", result)
    }
    TaskLedger.result(result.taskId, result)
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
    // Tray stays alive — user can reopen from tray
  })

  // When window is hidden, tray stays
  petWindow.on("hide", () => {
    petWindow?.webContents.send("xiaoxue-pet-visibility", false)
  })
}

function openMain(action: XiaoxuePetAction) {
  const main = findMainWindow()
  if (!main) return false
  showMainWindow(main)
  main.webContents.send("xiaoxue-pet-action", action)
  return true
}

function findMainWindow() {
  return BrowserWindow.getAllWindows().find(
    (window) => !window.isDestroyed() && !window.webContents.getURL().includes(petQuery),
  )
}

function showMainWindow(main: BrowserWindow) {
  if (main.isMinimized()) main.restore()
  main.show()
  main.focus()
  main.moveTop()
}
