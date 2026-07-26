import type { DesktopMenuAction } from "@opencode-ai/app/desktop-menu"
import type { WslServersPlatform } from "@opencode-ai/app/wsl/types"
import type { UpdaterState } from "@opencode-ai/app/updater"
export type {
  WslDistroProbe,
  WslInstalledDistro,
  WslJob,
  WslOnlineDistro,
  WslOpencodeCheck,
  WslRuntimeCheck,
  WslServerConfig,
  WslServerItem,
  WslServerRuntime,
  WslServersEvent,
  WslServersState,
} from "@opencode-ai/app/wsl/types"

export type ServerReadyData = {
  url: string
  username: string | null
  password: string | null
}

export type WslServersAPI = WslServersPlatform
export type UpdaterAPI = {
  subscribe: (cb: (state: UpdaterState) => void) => Promise<() => void>
  check: () => Promise<UpdaterState>
  install: () => Promise<void>
}

export type LinuxDisplayBackend = "wayland" | "auto"
export type TitlebarTheme = {
  mode: "light" | "dark"
  scheme?: "system" | "light" | "dark"
}
export type FatalRendererError = {
  error: string
  url: string
  version?: string
  platform: string
  os?: string
}

export type XiaoxueState =
  | "idle"
  | "waiting"
  | "listen"
  | "speaking"
  | "thinking"
  | "searching"
  | "reading"
  | "writing"
  | "reviewing"
  | "success"
  | "celebrate"
  | "warning"
  | "error"

export type XiaoxueCompletionScope = "task" | "milestone" | "project"

export type XiaoxuePetState = {
  event: "agent_state_changed"
  state: XiaoxueState
  message: string
  timestamp: number
  agent?: string
  taskId?: string
  sessionId?: string
  completionScope?: XiaoxueCompletionScope
  progress?: number
  issueCount?: number
}

export type XiaoxuePetAction = {
  id: string
  taskId?: string
  label?: string
  agent?: string
  prompt?: string
  autoSubmit?: boolean
  /** Extended action for new-task from pet input */
  action?: "new-task"
  source?: "xiaoxue-pet"
}

export type PetWindowMode = "avatar" | "expanded" | "hidden"

export type XiaoxuePetTaskResult = {
  taskId: string
  success: boolean
  error?: string
  answer?: string
  partial?: boolean
}

export type XiaoxueSpeechMode = "auto" | "remote" | "system"

export type XiaoxueSpeechEndpointSettings = {
  mode: XiaoxueSpeechMode
  baseURL: string
  model: string
  timeoutMs: number
  apiKeySet: boolean
}

export type XiaoxueVoiceSettings = {
  asr: XiaoxueSpeechEndpointSettings
  tts: XiaoxueSpeechEndpointSettings & { voice: string }
}

export type XiaoxueVoiceSettingsUpdate = {
  asr: Omit<XiaoxueSpeechEndpointSettings, "apiKeySet"> & {
    apiKey?: string
    clearApiKey?: boolean
  }
  tts: Omit<XiaoxueVoiceSettings["tts"], "apiKeySet"> & {
    apiKey?: string
    clearApiKey?: boolean
  }
}

export type XiaoxuePetAPI = {
  open: () => Promise<void>
  hide: () => Promise<void>
  setAlwaysOnTop: (value: boolean) => Promise<void>
  setMousePassthrough: (value: boolean) => Promise<void>
  publishState: (state: XiaoxuePetState) => void
  getState: () => Promise<XiaoxuePetState>
  onState: (cb: (state: XiaoxuePetState) => void) => () => void
  onVisibility: (cb: (visible: boolean) => void) => () => void
  openMain: (action: XiaoxuePetAction) => Promise<boolean>
  onAction: (cb: (action: XiaoxuePetAction) => void) => () => void
  getSize: () => Promise<{ width: number; height: number } | null>
  setSize: (width: number, height: number) => Promise<void>
  getPosition: () => Promise<{ x: number; y: number } | null>
  setPosition: (x: number, y: number) => Promise<void>
  setPendingTask: (task: { taskId: string; prompt: string; agent: string; autoSubmit: boolean }) => Promise<boolean>
  consumePendingTask: () => Promise<{
    taskId: string
    prompt: string
    agent: string
    autoSubmit: boolean
  } | null>
  acknowledgePendingTask: (taskId: string) => Promise<void>
  reportTaskResult: (result: XiaoxuePetTaskResult) => void
  onTaskResult: (cb: (result: XiaoxuePetTaskResult) => void) => () => void
  getVoiceSettings: () => Promise<XiaoxueVoiceSettings>
  updateVoiceSettings: (settings: XiaoxueVoiceSettingsUpdate) => Promise<XiaoxueVoiceSettings>
  transcribeVoice: (input: { audio: ArrayBuffer; mimeType: string }) => Promise<{ text: string }>
  synthesizeVoice: (text: string) => Promise<{ audio: ArrayBuffer; mimeType: string }>
  getMode: () => Promise<PetWindowMode>
  setMode: (mode: PetWindowMode) => Promise<void>
  onModeChanged: (cb: (mode: PetWindowMode) => void) => () => void
}
export type ElectronAPI = {
  xiaoxuePet: XiaoxuePetAPI
  killSidecar: () => Promise<void>
  installCli: () => Promise<string>
  awaitInitialization: () => Promise<ServerReadyData>
  wslServers: WslServersAPI
  updater: UpdaterAPI
  consumeInitialDeepLinks: () => Promise<string[]>
  getDefaultServerUrl: () => Promise<string | null>
  setDefaultServerUrl: (url: string | null) => Promise<void>
  isFirstLaunchOnboardingPending: () => Promise<boolean>
  finishFirstLaunchOnboarding: (createDefaultProject: boolean) => Promise<string | null>
  isOldLayoutEligible: () => Promise<boolean>
  getDisplayBackend: () => Promise<LinuxDisplayBackend | null>
  setDisplayBackend: (backend: LinuxDisplayBackend | null) => Promise<void>
  parseMarkdownCommand: (markdown: string) => Promise<string>
  checkAppExists: (appName: string) => Promise<boolean>
  resolveAppPath: (appName: string) => Promise<string | null>
  installObsidianCompanion: (vaultPath: string) => Promise<{ success: boolean; message: string }>
  obsidianIntegrationStatus: (
    vaultPath?: string,
  ) => Promise<{ available: boolean; pluginInstalled: boolean; vaultPath?: string }>
  storeGet: (name: string, key: string) => Promise<string | null>
  storeSet: (name: string, key: string, value: string) => Promise<void>
  storeDelete: (name: string, key: string) => Promise<void>
  storeClear: (name: string) => Promise<void>
  storeKeys: (name: string) => Promise<string[]>
  storeLength: (name: string) => Promise<number>

  getWindowCount: () => Promise<number>
  getWindowID: () => Promise<string>
  onMenuCommand: (cb: (id: string) => void) => () => void
  onDeepLink: (cb: (urls: string[]) => void) => () => void

  openDirectoryPicker: (opts?: {
    multiple?: boolean
    title?: string
    defaultPath?: string
  }) => Promise<string | string[] | null>
  openFilePicker: (opts?: {
    multiple?: boolean
    title?: string
    defaultPath?: string
    extensions?: string[]
  }) => Promise<{ token: string; files: { path: string; name: string; size: number }[] } | null>
  readPickedFile: (token: string, path: string) => Promise<ArrayBuffer>
  releasePickedFiles: (token: string) => Promise<void>
  getPathForFile: (file: File) => string
  saveFilePicker: (opts?: { title?: string; defaultPath?: string }) => Promise<string | null>
  openLink: (url: string) => void
  openPath: (path: string, app?: string) => Promise<void>
  revealPath: (path: string) => Promise<boolean>
  readClipboardImage: () => Promise<{ buffer: ArrayBuffer; width: number; height: number } | null>
  showNotification: (title: string, body?: string) => void
  getWindowFocused: () => Promise<boolean>
  setWindowFocus: () => Promise<void>
  showWindow: () => Promise<void>
  relaunch: () => void
  getZoomFactor: () => Promise<number>
  setZoomFactor: (factor: number) => Promise<void>
  getPinchZoomEnabled: () => Promise<boolean>
  setPinchZoomEnabled: (enabled: boolean) => Promise<void>
  onPinchZoomEnabledChanged: (cb: (enabled: boolean) => void) => () => void
  onZoomFactorChanged: (cb: (factor: number) => void) => () => void
  setTitlebar: (theme: TitlebarTheme) => Promise<void>
  runDesktopMenuAction: (action: DesktopMenuAction) => Promise<void>
  setBackgroundColor: (color: string) => Promise<void>
  exportDebugLogs: () => Promise<string>
  setForceFocus: (enabled: boolean) => Promise<void>
  recordFatalRendererError: (error: FatalRendererError) => Promise<void>
}
