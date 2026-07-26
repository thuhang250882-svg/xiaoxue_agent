import { describe, expect, test } from "bun:test"
import { sanitizeSpeechText, speechBoundary, startSpeechRecognition } from "./VoiceController"

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
})
