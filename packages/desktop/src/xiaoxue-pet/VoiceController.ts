type SpeechRecognitionResultLike = {
  isFinal: boolean
  0: { transcript: string }
}

type SpeechRecognitionEventLike = {
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
  onEnd: () => void
}) {
  const Constructor =
    (window as RecognitionWindow).SpeechRecognition ?? (window as RecognitionWindow).webkitSpeechRecognition
  if (!Constructor) return

  const recognition = new Constructor()
  recognition.lang = "zh-CN"
  recognition.continuous = false
  recognition.interimResults = true
  let transcript = ""
  recognition.onresult = (event) => {
    const entries = Array.from(event.results).slice(event.resultIndex)
    transcript = entries
      .map((result) => result[0]?.transcript ?? "")
      .join("")
      .trim()
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
  recognition.onend = input.onEnd
  return recognition
}

export class XiaoxueVoicePlayback {
  private answer = ""
  private spokenOffset = 0
  private pending = 0
  private completed = false

  constructor(
    private readonly onSpeaking: () => void,
    private readonly onComplete: () => void,
    private readonly onError: (message: string) => void,
  ) {}

  reset() {
    window.speechSynthesis?.cancel()
    this.answer = ""
    this.spokenOffset = 0
    this.pending = 0
    this.completed = false
  }

  update(answer: string, partial: boolean, enabled: boolean) {
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
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
      this.onError("当前系统不支持本地语音播报，回答已保留在工作台。")
      return
    }

    const utterance = new SpeechSynthesisUtterance(speech)
    utterance.lang = "zh-CN"
    utterance.rate = 1.08
    utterance.pitch = 1
    utterance.voice =
      window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("zh")) ?? null
    this.pending += 1
    utterance.onstart = this.onSpeaking
    utterance.onerror = () => {
      this.pending = Math.max(0, this.pending - 1)
      this.onError("语音播报失败，文字回答仍可在工作台查看。")
    }
    utterance.onend = () => {
      this.pending = Math.max(0, this.pending - 1)
      if (this.completed && this.pending === 0) this.onComplete()
    }
    window.speechSynthesis.speak(utterance)
  }
}

export function speechBoundary(text: string) {
  return Math.max(
    text.lastIndexOf("。") + 1,
    text.lastIndexOf("！") + 1,
    text.lastIndexOf("？") + 1,
    text.lastIndexOf("\n") + 1,
  )
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
