import { createSignal, onMount, Show, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import type { XiaoxueSpeechMode, XiaoxueVoiceSettings } from "../preload/types"

const initial: XiaoxueVoiceSettings = {
  asr: { mode: "auto", baseURL: "", model: "whisper-1", timeoutMs: 45_000, apiKeySet: false },
  tts: { mode: "auto", baseURL: "", model: "tts-1", voice: "alloy", timeoutMs: 45_000, apiKeySet: false },
}

export function VoiceSettingsPanel(props: { onClose: () => void; onSaved: (settings: XiaoxueVoiceSettings) => void }) {
  const [settings, setSettings] = createStore(initial)
  const [asrKey, setAsrKey] = createSignal("")
  const [ttsKey, setTtsKey] = createSignal("")
  const [clearAsrKey, setClearAsrKey] = createSignal(false)
  const [clearTtsKey, setClearTtsKey] = createSignal(false)
  const [status, setStatus] = createSignal("正在读取设置…")
  const [saving, setSaving] = createSignal(false)

  onMount(() => {
    void window.api.xiaoxuePet
      .getVoiceSettings()
      .then((value) => {
        setSettings(value)
        setStatus("")
      })
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : "读取语音设置失败。"))
  })

  const save = (event: SubmitEvent) => {
    event.preventDefault()
    setSaving(true)
    setStatus("正在保存…")
    void window.api.xiaoxuePet
      .updateVoiceSettings({
        asr: {
          mode: settings.asr.mode,
          baseURL: settings.asr.baseURL,
          model: settings.asr.model,
          timeoutMs: settings.asr.timeoutMs,
          apiKey: asrKey(),
          clearApiKey: clearAsrKey(),
        },
        tts: {
          mode: settings.tts.mode,
          baseURL: settings.tts.baseURL,
          model: settings.tts.model,
          voice: settings.tts.voice,
          timeoutMs: settings.tts.timeoutMs,
          apiKey: ttsKey(),
          clearApiKey: clearTtsKey(),
        },
      })
      .then((value) => {
        setSettings(value)
        setAsrKey("")
        setTtsKey("")
        setClearAsrKey(false)
        setClearTtsKey(false)
        setStatus("设置已安全保存。")
        props.onSaved(value)
      })
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : "保存语音设置失败。"))
      .finally(() => setSaving(false))
  }

  return (
    <div
      data-testid="xiaoxue-voice-settings"
      style={{
        position: "absolute",
        inset: "8px",
        "z-index": "10000",
        overflow: "auto",
        "border-radius": "14px",
        border: "1px solid rgba(255,255,255,0.18)",
        background: "rgba(18,20,26,0.98)",
        color: "#f7f8fa",
        padding: "14px",
        "box-shadow": "0 16px 48px rgba(0,0,0,0.55)",
        "-webkit-app-region": "no-drag",
        "pointer-events": "auto",
        "font-family": "inherit",
      }}
    >
      <form onSubmit={save}>
        <header style={{ display: "flex", "align-items": "center", "justify-content": "space-between" }}>
          <div>
            <div style={{ "font-size": "14px", "font-weight": "700" }}>小雪语音设置</div>
            <div style={{ "font-size": "10px", color: "rgba(255,255,255,0.52)", "margin-top": "2px" }}>
              ASR 与 TTS 独立配置，API Key 使用系统安全存储
            </div>
          </div>
          <button type="button" aria-label="关闭语音设置" onClick={props.onClose} style={iconButtonStyle}>
            ×
          </button>
        </header>

        <EndpointSection
          title="语音识别 ASR"
          mode={settings.asr.mode}
          baseURL={settings.asr.baseURL}
          model={settings.asr.model}
          timeoutMs={settings.asr.timeoutMs}
          apiKeySet={settings.asr.apiKeySet}
          apiKey={asrKey()}
          clearApiKey={clearAsrKey()}
          onMode={(value) => setSettings("asr", "mode", value)}
          onBaseURL={(value) => setSettings("asr", "baseURL", value)}
          onModel={(value) => setSettings("asr", "model", value)}
          onTimeout={(value) => setSettings("asr", "timeoutMs", value)}
          onApiKey={setAsrKey}
          onClearApiKey={setClearAsrKey}
        />
        <EndpointSection
          title="语音合成 TTS"
          mode={settings.tts.mode}
          baseURL={settings.tts.baseURL}
          model={settings.tts.model}
          timeoutMs={settings.tts.timeoutMs}
          apiKeySet={settings.tts.apiKeySet}
          apiKey={ttsKey()}
          clearApiKey={clearTtsKey()}
          voice={settings.tts.voice}
          onMode={(value) => setSettings("tts", "mode", value)}
          onBaseURL={(value) => setSettings("tts", "baseURL", value)}
          onModel={(value) => setSettings("tts", "model", value)}
          onTimeout={(value) => setSettings("tts", "timeoutMs", value)}
          onApiKey={setTtsKey}
          onClearApiKey={setClearTtsKey}
          onVoice={(value) => setSettings("tts", "voice", value)}
        />

        <Show when={status()}>
          <div style={{ "font-size": "11px", color: "#bfdbfe", "margin-top": "10px", "line-height": "16px" }}>
            {status()}
          </div>
        </Show>
        <button type="submit" disabled={saving()} style={saveButtonStyle}>
          {saving() ? "保存中…" : "保存设置"}
        </button>
      </form>
    </div>
  )
}

function EndpointSection(props: {
  title: string
  mode: XiaoxueSpeechMode
  baseURL: string
  model: string
  timeoutMs: number
  apiKeySet: boolean
  apiKey: string
  clearApiKey: boolean
  voice?: string
  onMode: (value: XiaoxueSpeechMode) => void
  onBaseURL: (value: string) => void
  onModel: (value: string) => void
  onTimeout: (value: number) => void
  onApiKey: (value: string) => void
  onClearApiKey: (value: boolean) => void
  onVoice?: (value: string) => void
}) {
  return (
    <section style={{ "margin-top": "12px", padding: "10px", background: "rgba(255,255,255,0.05)", "border-radius": "10px" }}>
      <div style={{ "font-size": "12px", "font-weight": "650", "margin-bottom": "8px" }}>{props.title}</div>
      <label style={labelStyle}>
        工作模式
        <select
          value={props.mode}
          onChange={(event) => props.onMode(event.currentTarget.value as XiaoxueSpeechMode)}
          style={inputStyle}
        >
          <option value="auto">自动（优先远程，无配置时用系统）</option>
          <option value="remote">仅远程服务</option>
          <option value="system">系统/Chromium 识别（可能需要网络）</option>
        </select>
      </label>
      <label style={labelStyle}>
        Base URL
        <input
          value={props.baseURL}
          placeholder="例如 http://127.0.0.1:8000/v1"
          onInput={(event) => props.onBaseURL(event.currentTarget.value)}
          style={inputStyle}
        />
      </label>
      <div style={{ display: "grid", "grid-template-columns": props.voice === undefined ? "1fr 92px" : "1fr 1fr", gap: "7px" }}>
        <label style={labelStyle}>
          模型
          <input value={props.model} onInput={(event) => props.onModel(event.currentTarget.value)} style={inputStyle} />
        </label>
        <Show
          when={props.voice !== undefined}
          fallback={
            <label style={labelStyle}>
              超时（秒）
              <input
                type="number"
                min="3"
                max="120"
                value={Math.round(props.timeoutMs / 1000)}
                onInput={(event) => props.onTimeout(Number(event.currentTarget.value) * 1000)}
                style={inputStyle}
              />
            </label>
          }
        >
          <label style={labelStyle}>
            音色
            <input value={props.voice} onInput={(event) => props.onVoice?.(event.currentTarget.value)} style={inputStyle} />
          </label>
        </Show>
      </div>
      <Show when={props.voice !== undefined}>
        <label style={labelStyle}>
          超时（秒）
          <input
            type="number"
            min="3"
            max="120"
            value={Math.round(props.timeoutMs / 1000)}
            onInput={(event) => props.onTimeout(Number(event.currentTarget.value) * 1000)}
            style={inputStyle}
          />
        </label>
      </Show>
      <label style={labelStyle}>
        API Key
        <input
          type="password"
          value={props.apiKey}
          disabled={props.clearApiKey}
          placeholder={props.apiKeySet ? "已设置，留空保持不变" : "可留空（本地服务通常不需要）"}
          onInput={(event) => props.onApiKey(event.currentTarget.value)}
          style={inputStyle}
        />
      </label>
      <Show when={props.apiKeySet}>
        <label style={{ display: "flex", gap: "6px", "align-items": "center", "font-size": "10px", color: "rgba(255,255,255,0.62)" }}>
          <input
            type="checkbox"
            checked={props.clearApiKey}
            onChange={(event) => props.onClearApiKey(event.currentTarget.checked)}
          />
          清除已保存的 API Key
        </label>
      </Show>
    </section>
  )
}

const labelStyle: JSX.CSSProperties = {
  display: "flex",
  "flex-direction": "column",
  gap: "4px",
  "font-size": "10px",
  color: "rgba(255,255,255,0.62)",
  "margin-top": "7px",
}

const inputStyle: JSX.CSSProperties = {
  width: "100%",
  "box-sizing": "border-box",
  border: "1px solid rgba(255,255,255,0.15)",
  "border-radius": "7px",
  background: "rgba(4,6,10,0.75)",
  color: "#f7f8fa",
  padding: "6px 8px",
  "font-size": "11px",
  outline: "none",
  "font-family": "inherit",
}

const iconButtonStyle: JSX.CSSProperties = {
  width: "28px",
  height: "28px",
  border: "none",
  "border-radius": "8px",
  background: "rgba(255,255,255,0.08)",
  color: "#fff",
  cursor: "pointer",
  "font-size": "18px",
}

const saveButtonStyle: JSX.CSSProperties = {
  width: "100%",
  border: "none",
  "border-radius": "9px",
  background: "#2563eb",
  color: "#fff",
  padding: "8px 12px",
  "font-size": "12px",
  "font-weight": "650",
  cursor: "pointer",
  "margin-top": "10px",
  "font-family": "inherit",
}
