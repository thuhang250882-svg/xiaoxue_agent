import { BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } from "electron"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { XiaoxuePetAction, XiaoxuePetState } from "../preload/types"
import { normalizePetState } from "./PetStateMapper"
import { XIAOXUE_PET_WINDOW } from "./config"

const root = dirname(fileURLToPath(import.meta.url))
const petQuery = "window=xiaoxue-pet"
let pendingPetTask: { prompt: string; agent: string; autoSubmit: boolean } | null = null
let currentMode: "avatar" | "expanded" | "hidden" = "expanded"

let petWindow: BrowserWindow | undefined
let tray: Tray | undefined
let currentState: XiaoxuePetState = {
  event: "agent_state_changed",
  state: "idle",
  message: "你好，我是录井小雪。今天需要我帮你做什么？",
  timestamp: Date.now(),
}

// ─── System Tray ──────────────────────────────────────────────────────────────

function createTray() {
  if (tray) return tray

  // Use a proper PNG icon for the tray — 16x16 is standard on Windows
  const iconPath = join(root, "../../resources/icons/32x32.png")
  let trayIcon: Electron.NativeImage
  try {
    trayIcon = nativeImage.createFromPath(iconPath)
    if (trayIcon.isEmpty()) {
      // Fallback: use the 16x16 icon from the icons directory
      const fallbackPath = join(root, "../../resources/icons/dock.png")
      trayIcon = nativeImage.createFromPath(fallbackPath)
    }
  } catch {
    // Last resort: create a simple 16x16 red dot using a data URL
    trayIcon = nativeImage.createEmpty()
  }

  // Ensure tray icon is the right size for Windows (16x16)
  if (trayIcon.getSize().width !== 16) {
    trayIcon = trayIcon.resize({ width: 16, height: 16 })
  }

  tray = new Tray(trayIcon)
  tray.setToolTip("录井小雪")

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "展开小雪",
      click: () => {
        currentMode = "expanded"
        open()
        if (petWindow && !petWindow.isDestroyed()) {
          petWindow.webContents.send("xiaoxue-pet-mode-changed", "expanded")
        }
      },
    },
    {
      label: "收起为头像",
      click: () => {
        if (petWindow && !petWindow.isDestroyed()) {
          currentMode = "avatar"
          const config = XIAOXUE_PET_WINDOW
          const [curX, curY] = petWindow.getPosition()
          const [curW, curH] = petWindow.getSize()
          petWindow.setMinimumSize(config.avatar.size, config.avatar.size)
          petWindow.setMaximumSize(config.avatar.size, config.avatar.size)
          petWindow.setSize(config.avatar.size, config.avatar.size, true)
          petWindow.setPosition(
            Math.max(0, curX + curW - config.avatar.size - config.margin),
            Math.max(0, curY + curH - config.avatar.size - config.margin),
            true,
          )
          petWindow.setResizable(false)
          petWindow.webContents.send("xiaoxue-pet-mode-changed", "avatar")
        }
      },
    },
    {
      label: "隐藏小雪",
      click: () => {
        if (petWindow && !petWindow.isDestroyed()) {
          currentMode = "hidden"
          petWindow.hide()
          petWindow.webContents.send("xiaoxue-pet-mode-changed", "hidden")
        }
      },
    },
    { type: "separator" },
    {
      label: "打开工作台",
      click: () => {
        const main = BrowserWindow.getAllWindows().find(
          (w) => !w.isDestroyed() && !w.webContents.getURL().includes(petQuery),
        )
        if (main) {
          main.show()
          main.focus()
        }
      },
    },
    { type: "separator" },
    {
      label: "退出小雪",
      click: () => {
        // Destroy everything
        if (petWindow && !petWindow.isDestroyed()) {
          petWindow.destroy()
        }
        if (tray && !tray.isDestroyed()) {
          tray.destroy()
        }
        petWindow = undefined
        tray = undefined
      },
    },
  ])

  tray.setContextMenu(contextMenu)

  // Click on tray icon (left click) — toggle pet window
  tray.on("click", () => {
    if (petWindow && !petWindow.isDestroyed()) {
      if (petWindow.isVisible()) {
        currentMode = "hidden"
        petWindow.hide()
        petWindow.webContents.send("xiaoxue-pet-mode-changed", "hidden")
      } else {
        if (currentMode === "hidden") currentMode = "avatar"
        open()
      }
    } else {
      currentMode = "expanded"
      open()
    }
  })

  return tray
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

export function registerXiaoxuePetWindow() {
  ipcMain.handle("xiaoxue-pet-open", () => open())
  ipcMain.handle("xiaoxue-pet-hide", () => {
    petWindow?.hide()
    ensureTray()
  })
  ipcMain.handle("xiaoxue-pet-set-always-on-top", (_event, value: boolean) => petWindow?.setAlwaysOnTop(Boolean(value)))
  ipcMain.handle("xiaoxue-pet-set-mouse-passthrough", (_event, value: boolean) =>
    petWindow?.setIgnoreMouseEvents(Boolean(value), { forward: true }),
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
    if (!petWindow || petWindow.isDestroyed()) return
    const clampedW = Math.round(Math.max(XIAOXUE_PET_WINDOW.minWidth, Math.min(XIAOXUE_PET_WINDOW.maxWidth, width)))
    const clampedH = Math.round(Math.max(XIAOXUE_PET_WINDOW.minHeight, Math.min(XIAOXUE_PET_WINDOW.maxHeight, height)))
    petWindow.setSize(clampedW, clampedH, true)
  })

  // PendingPetTask: deterministic task delivery from pet to main window
  ipcMain.handle(
    "xiaoxue-pet-set-pending-task",
    (_event, task: { prompt: string; agent: string; autoSubmit: boolean }) => {
      pendingPetTask = task
      return openMain({
        id: "new-task",
        action: "new-task",
        agent: task.agent,
        prompt: task.prompt,
        autoSubmit: task.autoSubmit,
        source: "xiaoxue-pet",
      })
    },
  )
  ipcMain.handle("xiaoxue-pet-consume-pending-task", () => {
    const task = pendingPetTask
    pendingPetTask = null
    return task
  })
  ipcMain.handle("xiaoxue-pet-task-result", (_event, result: { success: boolean; error?: string }) => {
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send("xiaoxue-pet-task-result", result)
    }
  })

  // Window mode management
  ipcMain.handle("xiaoxue-pet-get-mode", () => currentMode)
  ipcMain.handle("xiaoxue-pet-set-mode", (_event, mode: "avatar" | "expanded" | "hidden") => {
    if (mode === currentMode) return
    const prevMode = currentMode
    currentMode = mode

    if (!petWindow || petWindow.isDestroyed()) return

    if (mode === "hidden") {
      petWindow.hide()
      petWindow.webContents.send("xiaoxue-pet-mode-changed", mode)
      return
    }

    if (prevMode === "hidden") {
      petWindow.show()
      petWindow.setBackgroundColor("#00000000")
    }

    const config = XIAOXUE_PET_WINDOW
    if (mode === "avatar") {
      const [curX, curY] = petWindow.getPosition()
      const [curW, curH] = petWindow.getSize()
      const newX = curX + curW - config.avatar.size - config.margin
      const newY = curY + curH - config.avatar.size - config.margin
      petWindow.setMinimumSize(config.avatar.size, config.avatar.size)
      petWindow.setMaximumSize(config.avatar.size, config.avatar.size)
      petWindow.setSize(config.avatar.size, config.avatar.size, true)
      petWindow.setPosition(Math.max(0, newX), Math.max(0, newY), true)
      petWindow.setResizable(false)
    } else {
      petWindow.setMinimumSize(config.minWidth, config.minHeight)
      petWindow.setMaximumSize(config.maxWidth, config.maxHeight)
      petWindow.setSize(config.width, config.height, true)
      petWindow.setResizable(true)
      const display = screen.getPrimaryDisplay().workArea
      petWindow.setPosition(
        display.x + display.width - config.width - config.margin,
        display.y + display.height - config.height - config.margin,
        true,
      )
    }

    petWindow.webContents.send("xiaoxue-pet-mode-changed", mode)
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
    petWindow?.webContents.send("xiaoxue-pet-state", currentState)
    petWindow?.webContents.send("xiaoxue-pet-visibility", true)
    petWindow?.webContents.send("xiaoxue-pet-mode-changed", currentMode)
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
  const main = BrowserWindow.getAllWindows().find(
    (window) => !window.isDestroyed() && !window.webContents.getURL().includes(petQuery),
  )
  if (!main) return false
  main.show()
  main.focus()
  main.webContents.send("xiaoxue-pet-action", action)
  return true
}
