import { execFile } from "node:child_process"
import { stat } from "node:fs/promises"
import { basename } from "node:path"
import { app, BrowserWindow, Notification, clipboard, dialog, ipcMain, shell } from "electron"
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron"
import type { DesktopMenuAction } from "@opencode-ai/app/desktop-menu"

import type { FatalRendererError, ServerReadyData, TitlebarTheme } from "../preload/types"
import { runDesktopMenuAction } from "./desktop-menu-actions"
import { setForceFocus } from "./debug"
import { assertAttachmentBudget, createPickedFileAuthorizations, requiresInlineRead } from "./attachment-picker"
import { getStore, removeStoreFileIfEmpty } from "./store"
import { queueStoreMutation } from "./store-mutation"
import { write as writeLog } from "./logging"
import { allowedExternalURL, allowedLocalPath, isApprovedAppName } from "./security-policy"
import { getPinchZoomEnabled, getWindowID, setPinchZoomEnabled, setTitlebar, updateTitlebar } from "./windows"
import type { UpdaterController } from "./updater-controller"
import { createUpdaterSubscriptions } from "./updater-subscriptions"
import { installObsidianCompanion, obsidianIntegrationStatus } from "./obsidian-plugin"
import { officeFileMime } from "./office-file-mime"
import { registerTrustedFiles } from "./trusted-attachments"
import { scanDesktopStorageHealth } from "./storage-health"

const pickerFilters = (ext?: string[]) => {
  if (!ext || ext.length === 0) return undefined
  return [{ name: "Files", extensions: ext }]
}

const pickedFiles = createPickedFileAuthorizations()

type Deps = {
  killSidecar: () => Promise<void> | void
  relaunch: () => void
  awaitInitialization: () => Promise<ServerReadyData>
  consumeInitialDeepLinks: () => Promise<string[]> | string[]
  getDefaultServerUrl: () => Promise<string | null> | string | null
  setDefaultServerUrl: (url: string | null) => Promise<void> | void
  isFirstLaunchOnboardingPending: () => Promise<boolean> | boolean
  finishFirstLaunchOnboarding: (createDefaultProject: boolean) => Promise<string | null> | string | null
  isOldLayoutEligible: () => Promise<boolean> | boolean
  getDisplayBackend: () => Promise<string | null>
  setDisplayBackend: (backend: string | null) => Promise<void> | void
  parseMarkdown: (markdown: string) => Promise<string> | string
  checkAppExists: (appName: string) => Promise<boolean> | boolean
  resolveAppPath: (appName: string) => Promise<string | null>
  updater: UpdaterController
  showUpdater: () => Promise<void> | void
  setBackgroundColor: (color: string) => void
  exportDebugLogs: () => Promise<string>
  recordFatalRendererError: (error: FatalRendererError) => Promise<void> | void
}

export function registerIpcHandlers(deps: Deps) {
  const updaterSubscriptions = createUpdaterSubscriptions()
  app.once("will-quit", updaterSubscriptions.clear)

  ipcMain.handle("kill-sidecar", () => deps.killSidecar())
  ipcMain.handle("await-initialization", () => deps.awaitInitialization())
  ipcMain.handle("consume-initial-deep-links", () => deps.consumeInitialDeepLinks())
  ipcMain.handle("get-default-server-url", () => deps.getDefaultServerUrl())
  ipcMain.handle("set-default-server-url", (_event: IpcMainInvokeEvent, url: string | null) =>
    deps.setDefaultServerUrl(url),
  )
  ipcMain.handle("is-first-launch-onboarding-pending", () => deps.isFirstLaunchOnboardingPending())
  ipcMain.handle("finish-first-launch-onboarding", (_event: IpcMainInvokeEvent, createDefaultProject: boolean) =>
    deps.finishFirstLaunchOnboarding(createDefaultProject),
  )
  ipcMain.handle("is-old-layout-eligible", () => deps.isOldLayoutEligible())
  ipcMain.handle("get-display-backend", () => deps.getDisplayBackend())
  ipcMain.handle("set-display-backend", (_event: IpcMainInvokeEvent, backend: string | null) =>
    deps.setDisplayBackend(backend),
  )
  ipcMain.handle("parse-markdown", (_event: IpcMainInvokeEvent, markdown: string) => deps.parseMarkdown(markdown))
  ipcMain.handle("check-app-exists", (_event: IpcMainInvokeEvent, appName: string) => deps.checkAppExists(appName))
  ipcMain.handle("resolve-app-path", (_event: IpcMainInvokeEvent, appName: string) => deps.resolveAppPath(appName))
  ipcMain.handle("install-obsidian-companion", (event: IpcMainInvokeEvent, vaultPath: string) => {
    assertTrustedMainWindow(event)
    writeLog("security-audit", "obsidian companion install requested", { vaultPath })
    return installObsidianCompanion(vaultPath)
  })
  ipcMain.handle("obsidian-integration-status", (_event: IpcMainInvokeEvent, vaultPath?: string) =>
    obsidianIntegrationStatus(vaultPath),
  )
  ipcMain.handle("updater-subscribe", (event) => {
    const id = event.sender.id
    updaterSubscriptions.set(
      id,
      deps.updater.subscribe((state) => {
        if (event.sender.isDestroyed()) return updaterSubscriptions.delete(id)
        event.sender.send("updater-state", state)
      }),
    )
    event.sender.once("destroyed", () => updaterSubscriptions.delete(id))
  })
  ipcMain.handle("updater-unsubscribe", (event) => updaterSubscriptions.delete(event.sender.id))
  ipcMain.handle("updater-check", () => deps.updater.check())
  ipcMain.handle("updater-install", () => deps.updater.install())
  ipcMain.handle("set-background-color", (_event: IpcMainInvokeEvent, color: string) => deps.setBackgroundColor(color))
  ipcMain.handle("export-debug-logs", () => deps.exportDebugLogs())
  ipcMain.handle("set-force-focus", (event: IpcMainInvokeEvent, enabled: boolean) =>
    setForceFocus(event.sender, enabled),
  )
  ipcMain.handle("record-fatal-renderer-error", (_event: IpcMainInvokeEvent, error: FatalRendererError) =>
    deps.recordFatalRendererError(error),
  )
  ipcMain.handle("storage-health-scan", (event: IpcMainInvokeEvent) => {
    assertTrustedMainWindow(event)
    return scanDesktopStorageHealth(app.getPath("userData"))
  })
  ipcMain.handle("store-get", (_event: IpcMainInvokeEvent, name: string, key: string) => {
    try {
      const store = getStore(name)
      const value = store.get(key)
      if (value === undefined || value === null) return null
      return typeof value === "string" ? value : JSON.stringify(value)
    } catch {
      return null
    }
  })
  ipcMain.handle("store-set", (_event: IpcMainInvokeEvent, name: string, key: string, value: string) =>
    queueStoreMutation(name, () => getStore(name).set(key, value)),
  )
  ipcMain.handle("store-delete", (_event: IpcMainInvokeEvent, name: string, key: string) =>
    queueStoreMutation(name, async () => {
      getStore(name).delete(key)
      await removeStoreFileIfEmpty(name)
    }),
  )
  ipcMain.handle("store-clear", (_event: IpcMainInvokeEvent, name: string) =>
    queueStoreMutation(name, async () => {
      getStore(name).clear()
      await removeStoreFileIfEmpty(name)
    }),
  )
  ipcMain.handle("store-keys", (_event: IpcMainInvokeEvent, name: string) => {
    const store = getStore(name)
    return Object.keys(store.store)
  })
  ipcMain.handle("store-length", (_event: IpcMainInvokeEvent, name: string) => {
    const store = getStore(name)
    return Object.keys(store.store).length
  })

  ipcMain.handle(
    "open-directory-picker",
    async (_event: IpcMainInvokeEvent, opts?: { multiple?: boolean; title?: string; defaultPath?: string }) => {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory", ...(opts?.multiple ? ["multiSelections" as const] : []), "createDirectory"],
        title: opts?.title ?? "Choose a folder",
        defaultPath: opts?.defaultPath,
      })
      if (result.canceled) return null
      return opts?.multiple ? result.filePaths : result.filePaths[0]
    },
  )

  ipcMain.handle(
    "open-file-picker",
    async (
      event: IpcMainInvokeEvent,
      opts?: { multiple?: boolean; title?: string; defaultPath?: string; extensions?: string[] },
    ) => {
      const result = await dialog.showOpenDialog({
        properties: ["openFile", ...(opts?.multiple ? ["multiSelections" as const] : [])],
        title: opts?.title ?? "Choose a file",
        defaultPath: opts?.defaultPath,
        filters: pickerFilters(opts?.extensions),
      })
      if (result.canceled) return null
      const files = await Promise.all(
        result.filePaths.map(async (filePath) => ({
          path: filePath,
          name: basename(filePath),
          size: (await stat(filePath)).size,
          mime: officeFileMime(filePath),
        })),
      )
      // 仅内联读取（图片/PDF）受 20MB 预算约束；其余类型按 file:// 引用发送，
      // 不把字节内容读进渲染进程
      assertAttachmentBudget(files.filter((file) => requiresInlineRead(file.name)))
      // 可信附件登记：只有原生选择器确认的文件才进入登记表，返回高熵
      // attachmentId 供服务端按凭证读取；渲染进程不能登记任意路径
      const registered = await registerTrustedFiles(
        event.sender.id,
        "native-picker",
        files.map((file) => ({ absolutePath: file.path, fileName: file.name, mime: file.mime ?? "" })),
      )
      const token = pickedFiles.add(event.sender.id, result.filePaths)
      return { token, files: files.map((file, index) => ({ ...file, attachmentId: registered[index]?.id })) }
    },
  )

  // 历史附件重新授权：用户必须通过原生选择器再次主动选择文件，
  // 主进程登记新凭证并比对 SHA-256 判断文件是否变化
  ipcMain.handle(
    "reauthorize-trusted-attachment",
    async (
      event: IpcMainInvokeEvent,
      input: { fileName: string; originalPath?: string; expectedSha256?: string; extensions?: string[] },
    ) => {
      assertTrustedMainWindow(event)
      const defaultPath = input.originalPath && (await stat(input.originalPath).then(
        () => true,
        () => false,
      ))
        ? input.originalPath
        : undefined
      const result = await dialog.showOpenDialog({
        properties: ["openFile"],
        title: `重新选择“${input.fileName}”`,
        defaultPath,
        filters: pickerFilters(input.extensions),
      })
      if (result.canceled || !result.filePaths[0]) return null
      const filePath = result.filePaths[0]
      const [entry] = await registerTrustedFiles(event.sender.id, "native-picker", [
        { absolutePath: filePath, fileName: basename(filePath), mime: officeFileMime(filePath) ?? "" },
      ])
      // 日志与返回值都不输出完整本地路径，只返回文件名与凭证元数据
      writeLog("security-audit", "trusted attachment reauthorized", { fileName: entry.fileName })
      return {
        attachmentId: entry.id,
        fileName: entry.fileName,
        size: entry.size,
        mime: entry.mime,
        modifiedAt: entry.modifiedAt,
        sha256: entry.sha256,
        unchanged: input.expectedSha256 ? entry.sha256 === input.expectedSha256 : undefined,
      }
    },
  )

  ipcMain.handle("read-picked-file", async (event: IpcMainInvokeEvent, token: string, filePath: string) => {
    return pickedFiles.read(event.sender.id, token, filePath)
  })

  ipcMain.handle("release-picked-files", (event: IpcMainInvokeEvent, token: string) => {
    pickedFiles.release(event.sender.id, token)
  })

  ipcMain.handle(
    "save-file-picker",
    async (_event: IpcMainInvokeEvent, opts?: { title?: string; defaultPath?: string }) => {
      const result = await dialog.showSaveDialog({
        title: opts?.title ?? "Save file",
        defaultPath: opts?.defaultPath,
      })
      if (result.canceled) return null
      return result.filePath ?? null
    },
  )

  ipcMain.on("open-link", (event: IpcMainEvent, url: string) => {
    assertTrustedMainWindow(event)
    const external = allowedExternalURL(url)
    writeLog("security-audit", "external URL requested", {
      protocol: external.protocol,
      host: external.hostname,
    })
    void shell.openExternal(external.toString())
  })

  ipcMain.handle("open-path", async (event: IpcMainInvokeEvent, path: string, app?: string) => {
    assertTrustedMainWindow(event)
    const approvedPath = allowedLocalPath(path)
    writeLog("security-audit", "local path open requested", { path: approvedPath, app: app ?? "system" })
    if (!app) return shell.openPath(approvedPath)
    if (!isApprovedAppName(app)) throw new Error(`不允许启动未批准的应用：${app}`)
    const executable = await deps.resolveAppPath(app)
    if (!executable) throw new Error(`没有找到已批准的应用：${app}`)
    await new Promise<void>((resolve, reject) => {
      const [cmd, args] =
        process.platform === "darwin"
          ? (["open", ["-a", executable, approvedPath]] as const)
          : ([executable, [approvedPath]] as const)
      execFile(cmd, args, (err) => (err ? reject(err) : resolve()))
    })
    return undefined
  })
  ipcMain.handle("reveal-path", async (_event: IpcMainInvokeEvent, path: string) => {
    const exists = await stat(path).then(
      () => true,
      () => false,
    )
    if (!exists) return false
    shell.showItemInFolder(path)
    return true
  })

  ipcMain.handle("read-clipboard-image", () => {
    const image = clipboard.readImage()
    if (image.isEmpty()) return null
    const buffer = image.toPNG().buffer
    const size = image.getSize()
    return { buffer, width: size.width, height: size.height }
  })

  ipcMain.on("show-notification", (_event: IpcMainEvent, title: string, body?: string) => {
    new Notification({ title, body }).show()
  })

  ipcMain.handle("get-window-count", () => BrowserWindow.getAllWindows().length)

  ipcMain.handle("get-window-id", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error("Window not found")
    const id = getWindowID(win)
    if (!id) throw new Error("Window ID not found")
    return id
  })

  ipcMain.handle("get-window-focused", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win?.isFocused() ?? false
  })

  ipcMain.handle("set-window-focus", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.focus()
  })

  ipcMain.handle("show-window", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.show()
  })

  ipcMain.on("relaunch", () => {
    deps.relaunch()
  })

  ipcMain.handle("get-zoom-factor", (event: IpcMainInvokeEvent) => event.sender.getZoomFactor())
  ipcMain.handle("set-zoom-factor", (event: IpcMainInvokeEvent, factor: number) => {
    event.sender.setZoomFactor(factor)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    updateTitlebar(win)
  })
  ipcMain.handle("get-pinch-zoom-enabled", () => getPinchZoomEnabled())
  ipcMain.handle("set-pinch-zoom-enabled", (_event: IpcMainInvokeEvent, enabled: boolean) => {
    setPinchZoomEnabled(enabled)
  })
  ipcMain.handle("set-titlebar", (event: IpcMainInvokeEvent, theme: TitlebarTheme) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    setTitlebar(win, theme)
  })
  ipcMain.handle("run-desktop-menu-action", (event: IpcMainInvokeEvent, action: DesktopMenuAction) => {
    runDesktopMenuAction(BrowserWindow.fromWebContents(event.sender), action, {
      checkForUpdates: () => void deps.showUpdater(),
      relaunch: deps.relaunch,
    })
  })
}

export function sendMenuCommand(win: BrowserWindow, id: string) {
  win.webContents.send("menu-command", id)
}

export function sendDeepLinks(win: BrowserWindow, urls: string[]) {
  win.webContents.send("deep-link", urls)
}

function assertTrustedMainWindow(event: IpcMainEvent | IpcMainInvokeEvent) {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || !getWindowID(win)) throw new Error("拒绝来自非工作台窗口的 IPC 调用。")
}
