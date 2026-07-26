import { describe, expect, test } from "bun:test"
import { normalizePetState } from "./PetStateMapper"

const source = await Bun.file(new URL("./XiaoxuePetWindow.tsx", import.meta.url)).text()
const mainSource = await Bun.file(new URL("./main.ts", import.meta.url)).text()
const configSource = await Bun.file(new URL("./config.ts", import.meta.url)).text()
const modelSource = await Bun.file(new URL("./XiaoxueModel.tsx", import.meta.url)).text()
const bridgeSource = await Bun.file(new URL("./PetEventBridge.ts", import.meta.url)).text()
const voiceSource = await Bun.file(new URL("./VoiceController.ts", import.meta.url)).text()
const timelineSource = await Bun.file(
  new URL("../../../app/src/pages/session/timeline/message-timeline.tsx", import.meta.url),
).text()
const webpSource = await Bun.file(
  new URL("../../../app/src/components/xiaoxue/pet/XiaoxueWebP.tsx", import.meta.url),
).text()

describe("xiaoxue desktop pet shell", () => {
  test("uses one persistent 2D renderer and one conditional chat input", () => {
    expect(source.match(/<XiaoxueModel/g)?.length).toBe(1)
    expect(source.match(/<textarea/g)?.length).toBe(1)
  })

  test("maps available expanded states to transparent WebP animations", () => {
    for (const asset of ["idle", "idle-random", "waiting", "listen", "reading", "writing", "thinking", "searching", "speaking", "success", "celebrate", "error"]) {
      expect(webpSource).toContain(`/assets/pet/xiaoxue-${asset}.webp`)
    }
    expect(modelSource).toContain("<XiaoxueWebP")
    expect(webpSource).toContain("XIAOXUE_WEBP_VIEWS")
    expect(webpSource).toContain("transform-origin")
  })
  test("keeps idle1 primary and inserts complete idle2 clips at random intervals", () => {
    expect(webpSource).toContain("IDLE_RANDOM_DURATION_MS = 5_100")
    expect(webpSource).toContain("IDLE_RANDOM_MIN_DELAY_MS = 18_000")
    expect(webpSource).toContain("Math.random() * IDLE_RANDOM_DELAY_RANGE_MS")
    expect(webpSource).toContain("IDLE_RANDOM_VIEW")
    expect(webpSource).toContain("onCleanup(clearIdleTimer)")
  })
  test("accepts celebrate as a real pet state event", () => {
    expect(normalizePetState({ state: "celebrate", message: "庆祝成果", timestamp: 1 })).toMatchObject({
      state: "celebrate",
      message: "庆祝成果",
      timestamp: 1,
    })
  })
  test("accepts speaking as a real pet state event", () => {
    expect(normalizePetState({ state: "speaking", message: "正在说明结果", timestamp: 1 })).toMatchObject({
      state: "speaking",
      message: "正在说明结果",
      timestamp: 1,
    })
  })
  test("accepts waiting as a real pet state event", () => {
    expect(normalizePetState({ state: "waiting", message: "等待外部结果", timestamp: 1 })).toMatchObject({
      state: "waiting",
      message: "等待外部结果",
      timestamp: 1,
    })
  })
  test("uses success for routine completion and celebrate for major completion", () => {
    expect(normalizePetState({ state: "success", completionScope: "task" })?.state).toBe("success")
    expect(normalizePetState({ state: "success" })?.state).toBe("success")
    expect(normalizePetState({ state: "success", completionScope: "milestone" })?.state).toBe("celebrate")
    expect(normalizePetState({ state: "success", completionScope: "project" })?.state).toBe("celebrate")
  })
  test("does not expose business navigation or debug HUD", () => {
    for (const text of ["选择操作", "quickActions", "报告", "办公", "知识", "标书", "合同", "更多", "FPS", "JANK", "EXPANDED:"]) {
      expect(source).not.toContain(text)
    }
  })

  test("keeps the shell transparent and sends real xiaoxue tasks", () => {
    expect(source).toContain('background: "transparent"')
    expect(source).toContain("background: transparent !important")
    expect(source).toContain('agent: "xiaoxue"')
    expect(source).toContain("autoSubmit: true")
    expect(source).toContain('source: "xiaoxue-pet"')
  })

  test("handles pet renderer load failures without leaving a broken window", () => {
    expect(mainSource).toContain('loadURL(url.toString()).catch')
    expect(mainSource).toContain('loadingWindow.destroy()')
  })

  test("loads a non-empty tray icon from development and packaged resource paths", () => {
    expect(mainSource).toContain("app.getAppPath()")
    expect(mainSource).toContain('"icons", "icon.ico"')
    expect(mainSource).toContain("nativeImage.createFromDataURL")
    expect(mainSource).not.toContain("nativeImage.createEmpty()")
  })

  test("restores expanded dimensions after avatar mode", () => {
    expect(mainSource).toContain("let expandedSize")
    expect(mainSource).toContain('setPetWindowMode("avatar")')
    expect(mainSource).toContain('setPetWindowMode("expanded")')
    expect(mainSource).toContain("window.setMaximumSize(config.maxWidth, config.maxHeight)")
    expect(mainSource).toContain("window.setMinimumSize(config.minWidth, config.minHeight)")
    expect(mainSource.indexOf("window.setMaximumSize(config.maxWidth")).toBeLessThan(
      mainSource.indexOf("window.setMinimumSize(config.minWidth"),
    )
  })

  test("drags the full character without turning the gesture into a click", () => {
    expect(source).toContain("await window.api.xiaoxuePet.getMode()")
    expect(source).toContain('"-webkit-app-region": "no-drag"')
    expect(source).toContain("setPointerCapture(pointerId)")
    expect(source).toContain("window.api.xiaoxuePet.getPosition()")
    expect(source).toContain("window.api.xiaoxuePet.setPosition(target.x, target.y)")
    expect(source).toContain("if (dragMoved)")
    expect(mainSource).toContain('ipcMain.handle("xiaoxue-pet-get-position"')
    expect(mainSource).toContain('ipcMain.handle("xiaoxue-pet-set-position"')
    expect(source).toContain("void toggleMode()")
  })
  test("uses a compact expanded window by default", () => {
    expect(configSource).toContain("width: 320")
    expect(configSource).toContain("height: 460")
    expect(configSource).toContain("size: 88")
  })

  test("restores the prior pet state when chat input is cancelled", () => {
    expect(source).toContain("let stateBeforeInput")
    expect(source).toContain('state().state === "listen" && stateBeforeInput')
    expect(source).toContain("closeInput()")
  })

  test("supports low-latency voice questions and incremental local speech", () => {
    expect(source).toContain("createChineseSpeechRecognition")
    expect(source).toContain("XiaoxueVoicePlayback")
    expect(source).toContain("语音提问")
    expect(source).toContain("自动播报")
    expect(voiceSource).toContain('recognition.lang = "zh-CN"')
    expect(voiceSource).toContain("window.speechSynthesis.speak")
    expect(voiceSource).toContain("speechBoundary")
  })

  test("returns streamed assistant text to the pending pet task", () => {
    expect(timelineSource).toContain('new CustomEvent("xiaoxue:assistant-answer"')
    expect(bridgeSource).toContain('window.addEventListener("xiaoxue:assistant-answer"')
    expect(mainSource).toContain('ipcMain.on("xiaoxue-pet-task-result"')
    expect(mainSource).toContain("activePetTask")
  })
})
