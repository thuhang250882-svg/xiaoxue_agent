import type { ModelKey } from "@/context/local"

export function resolvePromptModelKey(input: {
  selected?: ModelKey
  agent?: ModelKey
  configured?: ModelKey
  configuredRequired: boolean
  recent?: ModelKey
  fallback?: ModelKey
  valid: (model: ModelKey) => boolean
}) {
  if (input.selected) {
    if (input.valid(input.selected)) return { model: input.selected }
    return { error: "MODEL_SESSION_UNRESOLVED: 当前会话模型已失效，请重新选择可用模型。" }
  }
  if (input.agent) {
    if (input.valid(input.agent)) return { model: input.agent }
    return { error: `Agent 模型已失效：${input.agent.providerID}/${input.agent.modelID}` }
  }
  if (input.configuredRequired) {
    if (!input.configured || !input.valid(input.configured)) {
      return { error: "MODEL_DEFAULT_UNRESOLVED: 当前默认模型已失效，请重新选择可用模型。" }
    }
    return { model: input.configured }
  }
  const model = [input.recent, input.fallback].find((item): item is ModelKey => !!item && input.valid(item))
  return { model }
}
