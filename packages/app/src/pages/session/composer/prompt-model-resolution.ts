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
    if (input.configured && input.valid(input.configured)) return { model: input.configured }
    // 配置的默认模型失效（如供应商被删除/改名）时回退到最近使用或第一个
    // 可用模型，保持"自动模式"可用；用户重新选择后会覆盖回配置。
    const model = [input.recent, input.fallback].find((item): item is ModelKey => !!item && input.valid(item))
    if (model) return { model }
    return { error: "MODEL_DEFAULT_UNRESOLVED: 当前默认模型已失效，请重新选择可用模型。" }
  }
  const model = [input.recent, input.fallback].find((item): item is ModelKey => !!item && input.valid(item))
  return { model }
}
