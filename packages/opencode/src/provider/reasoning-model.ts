import { extractReasoningMiddleware, wrapLanguageModel } from "ai"
import type { LanguageModelV3 } from "@ai-sdk/provider"

// Some compatible endpoints embed reasoning inside text instead of emitting
// reasoning deltas. Split at the provider boundary before persistence or TTS.
export function separateTaggedReasoning(model: LanguageModelV3) {
  return wrapLanguageModel({ model, middleware: extractReasoningMiddleware({ tagName: "think" }) })
}
