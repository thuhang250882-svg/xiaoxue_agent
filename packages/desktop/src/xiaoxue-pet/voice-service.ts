import { safeStorage } from "electron"
import { getStore } from "../main/store"
import type {
  XiaoxueSpeechEndpointSettings,
  XiaoxueSpeechMode,
  XiaoxueVoiceSettings,
  XiaoxueVoiceSettingsUpdate,
} from "../preload/types"

const storeName = "xiaoxue.voice"
const maxAudioBytes = 25 * 1024 * 1024
const maxSpeechCharacters = 8_000

const defaults = {
  asr: {
    mode: "auto" as const,
    baseURL: "",
    model: "whisper-1",
    timeoutMs: 45_000,
  },
  tts: {
    mode: "auto" as const,
    baseURL: "",
    model: "tts-1",
    voice: "alloy",
    timeoutMs: 45_000,
  },
}

export function getVoiceSettings(): XiaoxueVoiceSettings {
  const store = getStore(storeName)
  return {
    asr: {
      ...readEndpoint("asr", defaults.asr),
      apiKeySet: typeof store.get("asr.apiKey") === "string",
    },
    tts: {
      ...readEndpoint("tts", defaults.tts),
      voice: readString("tts.voice", defaults.tts.voice),
      apiKeySet: typeof store.get("tts.apiKey") === "string",
    },
  }
}

export function updateVoiceSettings(input: XiaoxueVoiceSettingsUpdate) {
  const store = getStore(storeName)
  store.set("asr.mode", requireMode(input.asr.mode))
  store.set("asr.baseURL", input.asr.baseURL.trim())
  store.set("asr.model", input.asr.model.trim() || defaults.asr.model)
  store.set("asr.timeoutMs", clampTimeout(input.asr.timeoutMs))
  store.set("tts.mode", requireMode(input.tts.mode))
  store.set("tts.baseURL", input.tts.baseURL.trim())
  store.set("tts.model", input.tts.model.trim() || defaults.tts.model)
  store.set("tts.voice", input.tts.voice.trim() || defaults.tts.voice)
  store.set("tts.timeoutMs", clampTimeout(input.tts.timeoutMs))
  updateApiKey("asr.apiKey", input.asr.apiKey, input.asr.clearApiKey)
  updateApiKey("tts.apiKey", input.tts.apiKey, input.tts.clearApiKey)
  return getVoiceSettings()
}

export async function transcribeVoice(input: { audio: ArrayBuffer; mimeType: string }) {
  const settings = getVoiceSettings().asr
  if (!settings.baseURL) throw new Error("尚未配置远程语音识别 Base URL。")
  if (input.audio.byteLength === 0) throw new Error("没有录到有效音频，请重试。")
  if (input.audio.byteLength > maxAudioBytes) throw new Error("录音超过 25 MB，请缩短提问后重试。")

  const data = new FormData()
  data.set("model", settings.model)
  data.set("language", "zh")
  data.set("file", new Blob([input.audio], { type: input.mimeType || "audio/webm" }), "xiaoxue-question.webm")
  const response = await fetch(endpoint(settings.baseURL, "audio/transcriptions"), {
    method: "POST",
    headers: authorization("asr.apiKey"),
    body: data,
    signal: AbortSignal.timeout(settings.timeoutMs),
  })
  if (!response.ok) throw await responseError(response, "语音识别")
  const payload: unknown = await response.json()
  if (!payload || typeof payload !== "object" || !("text" in payload) || typeof payload.text !== "string")
    throw new Error("语音识别服务返回了无法解析的结果。")
  return { text: payload.text.trim() }
}

export async function synthesizeVoice(text: string) {
  const settings = getVoiceSettings().tts
  if (!settings.baseURL) throw new Error("尚未配置远程语音合成 Base URL。")
  const input = text.trim()
  if (!input) throw new Error("没有可播报的文字。")
  if (input.length > maxSpeechCharacters) throw new Error("单次播报文字过长，请分段后重试。")

  const response = await fetch(endpoint(settings.baseURL, "audio/speech"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authorization("tts.apiKey"),
    },
    body: JSON.stringify({
      model: settings.model,
      voice: settings.voice,
      input,
      response_format: "mp3",
    }),
    signal: AbortSignal.timeout(settings.timeoutMs),
  })
  if (!response.ok) throw await responseError(response, "语音合成")
  return {
    audio: await response.arrayBuffer(),
    mimeType: response.headers.get("content-type")?.split(";")[0] || "audio/mpeg",
  }
}

function readEndpoint(
  prefix: "asr" | "tts",
  fallback: { mode: XiaoxueSpeechMode; baseURL: string; model: string; timeoutMs: number },
): Omit<XiaoxueSpeechEndpointSettings, "apiKeySet"> {
  return {
    mode: readMode(`${prefix}.mode`, fallback.mode),
    baseURL: readString(`${prefix}.baseURL`, fallback.baseURL),
    model: readString(`${prefix}.model`, fallback.model),
    timeoutMs: readNumber(`${prefix}.timeoutMs`, fallback.timeoutMs),
  }
}

function readMode(key: string, fallback: XiaoxueSpeechMode) {
  const value = getStore(storeName).get(key)
  return value === "auto" || value === "remote" || value === "system" ? value : fallback
}

function requireMode(value: XiaoxueSpeechMode) {
  if (value === "auto" || value === "remote" || value === "system") return value
  throw new Error("不支持的语音工作模式。")
}

function readString(key: string, fallback: string) {
  const value = getStore(storeName).get(key)
  return typeof value === "string" ? value : fallback
}

function readNumber(key: string, fallback: number) {
  const value = getStore(storeName).get(key)
  return typeof value === "number" && Number.isFinite(value) ? clampTimeout(value) : fallback
}

function clampTimeout(value: number) {
  return Math.round(Math.max(3_000, Math.min(120_000, Number.isFinite(value) ? value : 45_000)))
}

function updateApiKey(key: "asr.apiKey" | "tts.apiKey", value?: string, clear?: boolean) {
  const store = getStore(storeName)
  if (clear) {
    store.delete(key)
    return
  }
  const next = value?.trim()
  if (!next) return
  if (!safeStorage.isEncryptionAvailable()) throw new Error("系统安全存储暂不可用，未保存 API Key。")
  store.set(key, safeStorage.encryptString(next).toString("base64"))
}

function authorization(key: "asr.apiKey" | "tts.apiKey"): Record<string, string> {
  const encrypted = getStore(storeName).get(key)
  if (typeof encrypted !== "string") return {}
  if (!safeStorage.isEncryptionAvailable()) throw new Error("系统安全存储暂不可用，无法读取 API Key。")
  return { authorization: `Bearer ${safeStorage.decryptString(Buffer.from(encrypted, "base64"))}` }
}

function endpoint(baseURL: string, route: "audio/transcriptions" | "audio/speech") {
  const trimmed = baseURL.trim().replace(/\/+$/, "")
  if (trimmed.endsWith(route)) return trimmed
  return `${trimmed}/${route}`
}

async function responseError(response: Response, label: string) {
  const body = (await response.text()).slice(0, 300).replace(/\s+/g, " ").trim()
  return new Error(`${label}服务请求失败（HTTP ${response.status}）${body ? `：${body}` : "。"}`)
}
