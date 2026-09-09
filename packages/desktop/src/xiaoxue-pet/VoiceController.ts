import type { XiaoxueSpeechMode } from "../preload/types"

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
