import type { XiaoxueSpeechMode } from "../preload/types"

export type SpeechRecognitionResultLike = {
  isFinal: boolean
  0: { transcript: string }
}

export type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

type RecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

export function createChineseSpeechRecognition(input: {
  onText: (text: string) => void
  onFinal: (text: string) => void
  onError: (message: string) => void
  onEnd: (text: string) => void
}, target: Pick<RecognitionWindow, "SpeechRecognition" | "webkitSpeechRecognition"> = window as RecognitionWindow) {
  const Constructor = target.SpeechRecognition ?? target.webkitSpeechRecognition
  if (!Constructor) return

  const recognition = new Constructor()
  recognition.lang = "zh-CN"
  recognition.continuous = false
  recognition.interimResults = true
  let transcript = ""
  recognition.onresult = (event) => {
    const entries = Array.from(event.results).slice(event.resultIndex)
    transcript = speechTranscript(event)
    input.onText(transcript)
    if (entries.some((result) => result.isFinal) && transcript) input.onFinal(transcript)
  }
  recognition.onerror = (event) => {
    const message =
      event.error === "not-allowed"
        ? "麦克风权限未开启，请在系统设置中允许录井小雪使用麦克风。"
        : event.error === "no-speech"
          ? "没有识别到语音，请靠近麦克风后重试。"
          : `语音识别暂不可用（${event.error}）。`
    input.onError(message)
  }
  recognition.onend = () => input.onEnd(transcript)
  return recognition
}

export function speechTranscript(event: SpeechRecognitionEventLike) {
  return Array.from(event.results)
    .map((result) => result[0]?.transcript ?? "")
    .join("")
    .trim()
}

export function startSpeechRecognition(recognition: Pick<SpeechRecognitionLike, "start">) {
  try {
    recognition.start()
    return true
  } catch {
    return false
  }
}

export type RemoteSpeechCapture = {
  start: () => Promise<void>
  stop: () => void
  abort: () => void
}

export function createRemoteSpeechCapture(input: {
  transcribe: (audio: ArrayBuffer, mimeType: string) => Promise<string>
  onText: (text: string) => void
  onFinal: (text: string) => void
  onError: (message: string) => void
  onEnd: (text: string) => void
}): RemoteSpeechCapture {
  let recorder: MediaRecorder | undefined
  let stream: MediaStream | undefined
  let context: AudioContext | undefined
  let interval: ReturnType<typeof setInterval> | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  let aborted = false
  let heardSpeech = false
  let lastSpeechAt = 0
  const chunks: Blob[] = []

  const cleanup = () => {
    if (interval) clearInterval(interval)
    if (timeout) clearTimeout(timeout)
    interval = undefined
    timeout = undefined
    stream?.getTracks().forEach((track) => track.stop())
    stream = undefined
    void context?.close()
    context = undefined
  }

  const stop = () => {
    if (recorder?.state === "recording") recorder.stop()
  }

  return {
    async start() {
      aborted = false
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      if (aborted) {
        media.getTracks().forEach((track) => track.stop())
        return
      }
      stream = media
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find((value) =>
        MediaRecorder.isTypeSupported(value),
      )
      recorder = new MediaRecorder(media, mimeType ? { mimeType } : undefined)
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data)
      }
      recorder.onerror = () => {
        cleanup()
        input.onError("录音设备发生错误，请检查麦克风后重试。")
      }
      recorder.onstop = () => {
        const audio = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" })
        cleanup()
        if (aborted) return
        if (!audio.size) {
          input.onError("没有录到有效音频，请靠近麦克风后重试。")
          input.onEnd("")
          return
        }
        void audio
          .arrayBuffer()
          .then((buffer) => input.transcribe(buffer, audio.type))
          .then((text) => {
            const transcript = text.trim()
            input.onText(transcript)
            if (transcript) input.onFinal(transcript)
            input.onEnd(transcript)
          })
          .catch((error: unknown) => {
            input.onError(error instanceof Error ? error.message : "远程语音识别失败，请使用文字输入。")
            input.onEnd("")
          })
      }
      recorder.start(250)

      context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      context.createMediaStreamSource(media).connect(analyser)
      const samples = new Uint8Array(analyser.fftSize)
      const startedAt = Date.now()
      interval = setInterval(() => {
        analyser.getByteTimeDomainData(samples)
        const rms = Math.sqrt(
          samples.reduce((sum, sample) => {
            const normalized = (sample - 128) / 128
            return sum + normalized * normalized
          }, 0) / samples.length,
        )
        if (rms >= 0.025) {
          heardSpeech = true
          lastSpeechAt = Date.now()
          return
        }
        if (!heardSpeech && Date.now() - startedAt >= 10_000) {
          stop()
          return
        }
        if (heardSpeech && Date.now() - lastSpeechAt >= 1_200) stop()
      }, 100)
      timeout = setTimeout(stop, 30_000)
    },
    stop,
    abort() {
      aborted = true
      if (recorder?.state === "recording") recorder.stop()
      cleanup()
    },
  }
}

export class XiaoxueVoicePlayback {
  private answer = ""
  private spokenOffset = 0
  private pending = 0
  private completed = false
  private generation = 0
  private queue = Promise.resolve()
  private audio: HTMLAudioElement | undefined
  private audioURL: string | undefined

  constructor(
    private readonly onSpeaking: () => void,
    private readonly onComplete: () => void,
    private readonly onError: (message: string) => void,
    private readonly synthesize?: (text: string) => Promise<{ audio: ArrayBuffer; mimeType: string }>,
  ) {}

  reset() {
    this.generation += 1
    window.speechSynthesis?.cancel()
    this.audio?.pause()
    if (this.audioURL) URL.revokeObjectURL(this.audioURL)
    this.audio = undefined
    this.audioURL = undefined
    this.queue = Promise.resolve()
    this.answer = ""
    this.spokenOffset = 0
    this.pending = 0
    this.completed = false
  }

  update(answer: string, partial: boolean, enabled: boolean, mode: XiaoxueSpeechMode = "system") {
    if (!answer.startsWith(this.answer.slice(0, this.spokenOffset))) this.reset()
    this.answer = answer
    const cutoff = partial ? speechBoundary(answer) : answer.length
    if (cutoff <= this.spokenOffset) return
    const speech = sanitizeSpeechText(answer.slice(this.spokenOffset, cutoff))
    this.spokenOffset = cutoff
    this.completed = !partial
    if (!enabled || !speech) {
      if (!partial) this.onComplete()
      return
    }
    const generation = this.generation
    if (mode !== "system" && this.synthesize) {
      this.pending += 1
      this.queue = this.queue.then(() =>
        this.playRemote(speech, generation).catch(() => {
          if (mode === "auto" && this.speakLocal(speech, generation, true)) return
          this.pending = Math.max(0, this.pending - 1)
          this.completed = false
          this.onError("远程语音播报失败，文字回答仍可在工作台查看。")
        }),
      )
      return
    }
    if (this.speakLocal(speech, generation)) return
    this.onError("当前系统不支持本地语音播报，回答已保留在工作台。")
  }

  private speakLocal(speech: string, generation: number, pending = false) {
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") return false
    const utterance = new SpeechSynthesisUtterance(speech)
    utterance.lang = "zh-CN"
    utterance.rate = 1.08
    utterance.pitch = 1
    utterance.voice =
      window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("zh")) ?? null
    if (!pending) this.pending += 1
    utterance.onstart = () => {
      if (generation !== this.generation) return
      this.onSpeaking()
    }
    utterance.onerror = () => {
      if (generation !== this.generation) return
      this.pending = Math.max(0, this.pending - 1)
      this.completed = false
      this.onError("语音播报失败，文字回答仍可在工作台查看。")
    }
    utterance.onend = () => {
      if (generation !== this.generation) return
      this.pending = Math.max(0, this.pending - 1)
      if (this.completed && this.pending === 0) this.onComplete()
    }
    window.speechSynthesis.speak(utterance)
    return true
  }

  private async playRemote(speech: string, generation: number) {
    if (!this.synthesize || generation !== this.generation) return
    this.onSpeaking()
    const result = await this.synthesize(speech)
    if (generation !== this.generation) return
    const url = URL.createObjectURL(new Blob([result.audio], { type: result.mimeType }))
    this.audioURL = url
    const audio = new Audio(url)
    this.audio = audio
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve()
      audio.onerror = () => reject(new Error("audio playback failed"))
      void audio.play().catch(reject)
    }).finally(() => {
      if (this.audioURL !== url) return
      URL.revokeObjectURL(url)
      this.audioURL = undefined
      this.audio = undefined
    })
    if (generation !== this.generation) return
    this.pending = Math.max(0, this.pending - 1)
    if (this.completed && this.pending === 0) this.onComplete()
  }
}

export function speechBoundary(text: string) {
  const sentence = Math.max(
    text.lastIndexOf("。") + 1,
    text.lastIndexOf("！") + 1,
    text.lastIndexOf("？") + 1,
    text.lastIndexOf("；") + 1,
    text.lastIndexOf("\n") + 1,
  )
  // 阈值是中文朗读节奏的经验值：
  // - 36：约 6-8 秒语音时长。短于该长度时没有句末标点也先不切，等完整句出现，避免播得太碎；
  // - 24：逗号前至少 24 字符（约 4 秒）才值得先播一段，否则宁可继续等待，防止把短语切断。
  if (sentence > 0 || text.length < 36) return sentence
  const clause = text.lastIndexOf("，") + 1
  return clause >= 24 ? clause : 0
}

export function sanitizeSpeechText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " 代码内容已省略。")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[#>*_~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
