import { describe, expect, test } from "bun:test"
import { normalizeStreamDelta, usesCumulativeStream } from "@/session/stream-delta"

describe("normalizeStreamDelta", () => {
  test("keeps normal token deltas and repeated content", () => {
    expect(normalizeStreamDelta("Hello", " world", false)).toBe(" world")
    expect(normalizeStreamDelta("ha", "ha", false)).toBe("ha")
  })

  test("strips the prefix from cumulative local-model chunks", () => {
    expect(normalizeStreamDelta("第一句", "第一句，第二句", true)).toBe("，第二句")
  })

  test("suppresses only a whole-response replay in cumulative mode", () => {
    const sentence = "用户需要从招标目录中整理重点内容，这是典型的招投标文件解析任务。"
    expect(normalizeStreamDelta(sentence, sentence, true)).toBe("")
    expect(normalizeStreamDelta(`前文${sentence}`, sentence, true)).toBe(sentence)
    expect(normalizeStreamDelta(sentence, sentence, false)).toBe(sentence)
  })

  test("enables cumulative normalization only for private endpoints or explicit configuration", () => {
    expect(usesCumulativeStream({ endpoint: "http://192.168.1.8:8000/v1" })).toBeTrue()
    expect(usesCumulativeStream({ endpoint: "http://[fd00::8]:8000/v1" })).toBeTrue()
    expect(usesCumulativeStream({ endpoint: "https://api.example.com/v1" })).toBeFalse()
    expect(usesCumulativeStream({ endpoint: "https://models.corp.local/v1", configured: true })).toBeTrue()
  })
})
