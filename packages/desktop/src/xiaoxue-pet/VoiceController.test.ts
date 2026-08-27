import { describe, expect, test } from "bun:test"
import {
  createChineseSpeechRecognition,
  sanitizeSpeechText,
  speechBoundary,
  speechTranscript,
  startSpeechRecognition,
  type SpeechRecognitionResultLike,
} from "./VoiceController"

describe("xiaoxue voice controller", () => {
  test("starts streaming speech only after a complete Chinese sentence", () => {
    expect(speechBoundary("正在分析现场数据")).toBe(0)
    expect(speechBoundary("正在分析。下一句还在生成")).toBe("正在分析。".length)
    expect(speechBoundary("第一句。第二句！")).toBe("第一句。第二句！".length)
    expect(speechBoundary("现场数据正在持续分析中，需要进一步核对出口流量变化趋势，后续内容仍在生成中并等待补充")).toBe(
      "现场数据正在持续分析中，需要进一步核对出口流量变化趋势，".length,
    )
  })

  test("removes markdown noise before local speech", () => {
    expect(sanitizeSpeechText("## 结论\n请查看[规则](https://example.test)，`pit_gain` 正在增加。")).toBe(
      "结论 请查看规则，pit gain 正在增加。",
    )
    expect(sanitizeSpeechText("```ts\nconst value = 1\n```")).toBe("代码内容已省略。")
  })

  test("contains synchronous speech service startup failures", () => {
    expect(startSpeechRecognition({ start: () => undefined })).toBe(true)
    expect(
      startSpeechRecognition({
        start: () => {
          throw new Error("speech service unavailable")
        },
      }),
    ).toBe(false)
  })

  test("retains the complete transcript when later recognition results change", () => {
    const result = (transcript: string, isFinal: boolean): SpeechRecognitionResultLike => ({
      0: { transcript },
      isFinal,
    })
    expect(
      speechTranscript({
        resultIndex: 1,
        results: [result("请帮我", true), result("检查今天的录井数据", false)],
      }),
    ).toBe("请帮我检查今天的录井数据")
  })

  test("returns the last interim transcript when microphone capture ends", () => {
    const ended: string[] = []
    class Recognition {
      lang = ""
      continuous = false
      interimResults = false
      onresult: ((event: Parameters<typeof speechTranscript>[0]) => void) | null = null
      onerror: ((event: { error: string }) => void) | null = null
      onend: (() => void) | null = null
      start() {}
      stop() {}
      abort() {}
    }
    const recognition = createChineseSpeechRecognition(
      {
        onText: () => undefined,
        onError: () => undefined,
        onEnd: (text) => ended.push(text),
      },
      { SpeechRecognition: Recognition },
    )
    recognition?.onresult?.({
      resultIndex: 0,
      results: [{ 0: { transcript: "打开新的聊天回答问题" }, isFinal: false }],
    })
    recognition?.onend?.()
    expect(ended).toEqual(["打开新的聊天回答问题"])
  })

  test("keeps system recognition active across service segment boundaries", async () => {
    let starts = 0
    const ended: string[] = []
    class Recognition {
      lang = ""
      continuous = false
      interimResults = false
      onresult: ((event: Parameters<typeof speechTranscript>[0]) => void) | null = null
      onerror: ((event: { error: string }) => void) | null = null
      onend: (() => void) | null = null
      start() {
        starts += 1
      }
      stop() {}
      abort() {}
    }
    const recognition = createChineseSpeechRecognition(
      {
        onText: () => undefined,
        onError: () => undefined,
        onEnd: (text) => ended.push(text),
      },
      { SpeechRecognition: Recognition },
    )
    recognition?.start()
    recognition?.onend?.()
    await Bun.sleep(200)
    expect(recognition?.continuous).toBe(true)
    expect(starts).toBe(2)
    expect(ended).toEqual([])
    recognition?.abort()
  })

  test("explains the office-network limitation when Chromium recognition cannot connect", () => {
    const errors: string[] = []
    class Recognition {
      lang = ""
      continuous = false
      interimResults = false
      onresult: ((event: Parameters<typeof speechTranscript>[0]) => void) | null = null
      onerror: ((event: { error: string }) => void) | null = null
      onend: (() => void) | null = null
      start() {}
      stop() {}
      abort() {}
    }
    const recognition = createChineseSpeechRecognition(
      {
        onText: () => undefined,
        onError: (message) => errors.push(message),
        onEnd: () => undefined,
      },
      { SpeechRecognition: Recognition },
    )
    recognition?.onerror?.({ error: "network" })
    expect(errors).toEqual([
      "系统语音识别无法连接服务。办公网环境请在语音设置中配置本地 ASR，或使用文字输入。",
    ])
  })
})
