import { expect, test } from "bun:test"
import type { LanguageModelV3, LanguageModelV3StreamPart } from "@ai-sdk/provider"
import { separateTaggedReasoning } from "../../src/provider/reasoning-model"

test.each([
  { chunks: ["<thi", "nk>内部推演。", "</th", "ink>", "正式回答。"] },
  { chunks: ["<think>尚未结束的内部推演。"] },
  { chunks: ["普通回答。"] },
])("separates tagged reasoning across stream boundaries: %j", async ({ chunks }) => {
  const model: LanguageModelV3 = {
    specificationVersion: "v3", provider: "fixture", modelId: "fixture", supportedUrls: {},
    doGenerate: async () => { throw new Error("stream-only fixture") },
    doStream: async () => ({ stream: new ReadableStream<LanguageModelV3StreamPart>({
      start(controller) {
        controller.enqueue({ type: "text-start", id: "answer" })
        chunks.forEach((delta) => controller.enqueue({ type: "text-delta", id: "answer", delta }))
        controller.enqueue({ type: "text-end", id: "answer" })
        controller.close()
      },
    }) }),
  }
  const result = await separateTaggedReasoning(model).doStream({ prompt: [] })
  const parts: LanguageModelV3StreamPart[] = []
  const reader = result.stream.getReader()
  while (true) {
    const part = await reader.read()
    if (part.done) break
    parts.push(part.value)
  }
  const answer = parts.flatMap((part) => part.type === "text-delta" ? [part.delta] : []).join("")
  const reasoning = parts.flatMap((part) => part.type === "reasoning-delta" ? [part.delta] : []).join("")
  expect(answer).not.toContain("内部推演")
  expect(answer).not.toContain("<think>")
  expect(answer.trim()).toBe(chunks.length === 5 ? "正式回答。" : chunks[0].startsWith("<think>") ? "" : "普通回答。")
  if (chunks[0].startsWith("<thi")) expect(reasoning).toContain("内部推演")
})
