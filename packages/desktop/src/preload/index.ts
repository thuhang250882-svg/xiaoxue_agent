import { contextBridge, ipcRenderer, webUtils } from "electron"
import type { ElectronAPI, WslServersEvent } from "./types"
import type { UpdaterState } from "@opencode-ai/app/updater"

const updaterCallbacks = new Set<(state: UpdaterState) => void>()
let updaterState: UpdaterState | undefined
let updaterSubscription: Promise<void> | undefined
const updaterHandler = (_: unknown, state: UpdaterState) => {
  updaterState = state
  updaterCallbacks.forEach((callback) => callback(state))
}

const api: ElectronAPI = {
  xiaoxuePet: {
    open: () => ipcRenderer.invoke("xiaoxue-pet-open"),
    hide: () => ipcRenderer.invoke("xiaoxue-pet-hide"),
    setAlwaysOnTop: (value) => ipcRenderer.invoke("xiaoxue-pet-set-always-on-top", value),
    setMousePassthrough: (value) => ipcRenderer.invoke("xiaoxue-pet-set-mouse-passthrough", value),
    setInteractiveRegions: (regions) => ipcRenderer.send("xiaoxue-pet-set-interactive-regions", regions),
    publishState: (state) => ipcRenderer.send("xiaoxue-pet-publish-state", state),
    getState: () => ipcRenderer.invoke("xiaoxue-pet-get-state"),
    onState: (cb) => {
      const handler = (_: unknown, state: Parameters<typeof cb>[0]) => cb(state)
      ipcRenderer.on("xiaoxue-pet-state", handler)
      return () => ipcRenderer.removeListener("xiaoxue-pet-state", handler)
    },
    onVisibility: (cb) => {
      const handler = (_: unknown, visible: boolean) => cb(visible)
      ipcRenderer.on("xiaoxue-pet-visibility", handler)
      return () => ipcRenderer.removeListener("xiaoxue-pet-visibility", handler)
    },
    openMain: (action) => ipcRenderer.invoke("xiaoxue-pet-open-main", action),
    onAction: (cb) => {
      const handler = (_: unknown, action: Parameters<typeof cb>[0]) => cb(action)
      ipcRenderer.on("xiaoxue-pet-action", handler)
      return () => ipcRenderer.removeListener("xiaoxue-pet-action", handler)
    },
    getSize: () => ipcRenderer.invoke("xiaoxue-pet-get-size"),
    setSize: (width, height) => ipcRenderer.invoke("xiaoxue-pet-set-size", width, height),
    getPosition: () => ipcRenderer.invoke("xiaoxue-pet-get-position"),
    setPosition: (x, y) => ipcRenderer.invoke("xiaoxue-pet-set-position", x, y),
    setPendingTask: (task) => ipcRenderer.invoke("xiaoxue-pet-set-pending-task", task),
    consumePendingTask: () => ipcRenderer.invoke("xiaoxue-pet-consume-pending-task"),
    acknowledgePendingTask: (taskId) => ipcRenderer.invoke("xiaoxue-pet-acknowledge-pending-task", taskId),
    reportTaskResult: (result) => ipcRenderer.send("xiaoxue-pet-task-result", result),
    onTaskResult: (cb) => {
      const handler = (_: unknown, result: Parameters<typeof cb>[0]) => cb(result)
      ipcRenderer.on("xiaoxue-pet-task-result", handler)
      return () => ipcRenderer.removeListener("xiaoxue-pet-task-result", handler)
    },
    getVoiceSettings: () => ipcRenderer.invoke("xiaoxue-pet-get-voice-settings"),
    updateVoiceSettings: (settings) => ipcRenderer.invoke("xiaoxue-pet-update-voice-settings", settings),
    transcribeVoice: (input) => ipcRenderer.invoke("xiaoxue-pet-transcribe-voice", input),
    synthesizeVoice: (text) => ipcRenderer.invoke("xiaoxue-pet-synthesize-voice", text),
    getMode: () => ipcRenderer.invoke("xiaoxue-pet-get-mode"),
    setMode: (mode) => ipcRenderer.invoke("xiaoxue-pet-set-mode", mode),
    onModeChanged: (cb) => {
      const handler = (_: unknown, mode: Parameters<typeof cb>[0]) => cb(mode)
      ipcRenderer.on("xiaoxue-pet-mode-changed", handler)
      return () => ipcRenderer.removeListener("xiaoxue-pet-mode-changed", handler)
    },
    showContextMenu: () => ipcRenderer.invoke("xiaoxue-pet-show-context-menu"),
    onOpenVoiceSettings: (cb) => {
      const handler = () => cb()
      ipcRenderer.on("xiaoxue-pet-open-voice-settings", handler)
      return () => ipcRenderer.removeListener("xiaoxue-pet-open-voice-settings", handler)
    },
  },
  killSidecar: () => ipcRenderer.invoke("kill-sidecar"),
  installCli: () => ipcRenderer.invoke("install-cli"),
  awaitInitialization: () => ipcRenderer.invoke("await-initialization"),
  wslServers: {
    getState: () => ipcRenderer.invoke("wsl-servers-get-state"),
    subscribe: (cb) => {
      const handler = (_: unknown, event: WslServersEvent) => cb(event)
      ipcRenderer.on("wsl-servers-event", handler)
      void ipcRenderer.invoke("wsl-servers-subscribe")
      return () => {
        ipcRenderer.removeListener("wsl-servers-event", handler)
        void ipcRenderer.invoke("wsl-servers-unsubscribe")
      }
    },
    probeRuntime: () => ipcRenderer.invoke("wsl-servers-probe-runtime"),
    refreshDistros: () => ipcRenderer.invoke("wsl-servers-refresh-distros"),
    installWsl: () => ipcRenderer.invoke("wsl-servers-install-wsl"),
    installDistro: (name) => ipcRenderer.invoke("wsl-servers-install-distro", name),
    probeAddable: (distros) => ipcRenderer.invoke("wsl-servers-probe-addable", distros),
    installOpencode: (name) => ipcRenderer.invoke("wsl-servers-install-opencode", name),
    openTerminal: (name) => ipcRenderer.invoke("wsl-servers-open-terminal", name),
    addServer: (distro) => ipcRenderer.invoke("wsl-servers-add", distro),
    removeServer: (id) => ipcRenderer.invoke("wsl-servers-remove", id),
    startServer: (id) => ipcRenderer.invoke("wsl-servers-start", id),
  },
  updater: {
    subscribe: async (cb) => {
      updaterCallbacks.add(cb)
      if (updaterState) cb(updaterState)
      if (!updaterSubscription) {
        ipcRenderer.on("updater-state", updaterHandler)
        updaterSubscription = ipcRenderer.invoke("updater-subscribe")
      }
      await updaterSubscription
      return () => {
        updaterCallbacks.delete(cb)
        if (updaterCallbacks.size > 0) return
        ipcRenderer.removeListener("updater-state", updaterHandler)
        updaterSubscription = undefined
        void ipcRenderer.invoke("updater-unsubscribe")
      }
    },
    check: () => ipcRenderer.invoke("updater-check"),
    install: () => ipcRenderer.invoke("updater-install"),
  },
  consumeInitialDeepLinks: () => ipcRenderer.invoke("consume-initial-deep-links"),
  getDefaultServerUrl: () => ipcRenderer.invoke("get-default-server-url"),
  setDefaultServerUrl: (url) => ipcRenderer.invoke("set-default-server-url", url),
  isFirstLaunchOnboardingPending: () => ipcRenderer.invoke("is-first-launch-onboarding-pending"),
  finishFirstLaunchOnboarding: (createDefaultProject) =>
    ipcRenderer.invoke("finish-first-launch-onboarding", createDefaultProject),
  isOldLayoutEligible: () => ipcRenderer.invoke("is-old-layout-eligible"),
  getDisplayBackend: () => ipcRenderer.invoke("get-display-backend"),
  setDisplayBackend: (backend) => ipcRenderer.invoke("set-display-backend", backend),
  parseMarkdownCommand: (markdown) => ipcRenderer.invoke("parse-markdown", markdown),
  checkAppExists: (appName) => ipcRenderer.invoke("check-app-exists", appName),
  resolveAppPath: (appName) => ipcRenderer.invoke("resolve-app-path", appName),
  installObsidianCompanion: (vaultPath) => ipcRenderer.invoke("install-obsidian-companion", vaultPath),
  obsidianIntegrationStatus: (vaultPath) => ipcRenderer.invoke("obsidian-integration-status", vaultPath),
  storeGet: (name, key) => ipcRenderer.invoke("store-get", name, key),
  storeSet: (name, key, value) => ipcRenderer.invoke("store-set", name, key, value),
  storeDelete: (name, key) => ipcRenderer.invoke("store-delete", name, key),
  storeClear: (name) => ipcRenderer.invoke("store-clear", name),
  storeKeys: (name) => ipcRenderer.invoke("store-keys", name),
  storeLength: (name) => ipcRenderer.invoke("store-length", name),

  getWindowCount: () => ipcRenderer.invoke("get-window-count"),
  getWindowID: () => ipcRenderer.invoke("get-window-id"),
  onMenuCommand: (cb) => {
    const handler = (_: unknown, id: string) => cb(id)
    ipcRenderer.on("menu-command", handler)
    return () => ipcRenderer.removeListener("menu-command", handler)
  },
  onDeepLink: (cb) => {
    const handler = (_: unknown, urls: string[]) => cb(urls)
    ipcRenderer.on("deep-link", handler)
    return () => ipcRenderer.removeListener("deep-link", handler)
  },

  openDirectoryPicker: (opts) => ipcRenderer.invoke("open-directory-picker", opts),
  openFilePicker: (opts) => ipcRenderer.invoke("open-file-picker", opts),
  readPickedFile: (token, path) => ipcRenderer.invoke("read-picked-file", token, path),
  releasePickedFiles: (token) => ipcRenderer.invoke("release-picked-files", token),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  saveFilePicker: (opts) => ipcRenderer.invoke("save-file-picker", opts),
  openLink: (url) => ipcRenderer.send("open-link", url),
  openPath: (path, app) => ipcRenderer.invoke("open-path", path, app),
  revealPath: (path) => ipcRenderer.invoke("reveal-path", path),
  readClipboardImage: () => ipcRenderer.invoke("read-clipboard-image"),
  showNotification: (title, body) => ipcRenderer.send("show-notification", title, body),
  getWindowFocused: () => ipcRenderer.invoke("get-window-focused"),
  setWindowFocus: () => ipcRenderer.invoke("set-window-focus"),
  showWindow: () => ipcRenderer.invoke("show-window"),
  relaunch: () => ipcRenderer.send("relaunch"),
  getZoomFactor: () => ipcRenderer.invoke("get-zoom-factor"),
  setZoomFactor: (factor) => ipcRenderer.invoke("set-zoom-factor", factor),
  getPinchZoomEnabled: () => ipcRenderer.invoke("get-pinch-zoom-enabled"),
  setPinchZoomEnabled: (enabled) => ipcRenderer.invoke("set-pinch-zoom-enabled", enabled),
  onPinchZoomEnabledChanged: (cb) => {
    const handler = (_: unknown, enabled: boolean) => cb(enabled)
    ipcRenderer.on("pinch-zoom-enabled-changed", handler)
    return () => ipcRenderer.removeListener("pinch-zoom-enabled-changed", handler)
  },
  onZoomFactorChanged: (cb) => {
    const handler = (_: unknown, factor: number) => cb(factor)
    ipcRenderer.on("zoom-factor-changed", handler)
    return () => ipcRenderer.removeListener("zoom-factor-changed", handler)
  },
  setTitlebar: (theme) => ipcRenderer.invoke("set-titlebar", theme),
  runDesktopMenuAction: (action) => ipcRenderer.invoke("run-desktop-menu-action", action),
  setBackgroundColor: (color: string) => ipcRenderer.invoke("set-background-color", color),
  exportDebugLogs: () => ipcRenderer.invoke("export-debug-logs"),
  setForceFocus: (enabled) => ipcRenderer.invoke("set-force-focus", enabled),
  recordFatalRendererError: (error) => ipcRenderer.invoke("record-fatal-renderer-error", error),
}

contextBridge.exposeInMainWorld("api", api)
