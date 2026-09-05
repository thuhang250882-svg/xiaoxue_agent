import { expect, test } from "bun:test"
import type { NormalizedProviderListResponse } from "@opencode-ai/session-ui/context"
import { selectProviderCatalog } from "./provider-catalog"
import { resolvePromptModelKey } from "@/pages/session/composer/prompt-model-resolution"

const catalog = (models: string[]) =>
  ({
    all: new Map([
      [
        "runtime",
        {
          id: "runtime",
          name: "Runtime",
          source: "api",
          env: [],
          options: {},
          models: Object.fromEntries(models.map((id) => [id, { id, name: id }])),
        },
      ],
    ]),
    connected: ["runtime"],
    default: { runtime: models[0] },
  }) as unknown as NormalizedProviderListResponse

test("model_picker_only_exposes_runtime_models.test.ts", () => {
  const runtime = catalog(["available-model"])
  const global = catalog(["catalog-only-model"])
  const selected = selectProviderCatalog({
    explicit: false,
    directory: "/workspace",
    catalog: { ready: true, providers: runtime },
    global,
  })
  const pickerModels = [...selected.all.values()].flatMap((provider) => Object.keys(provider.models))
  const runtimeModels = [...runtime.all.values()].flatMap((provider) => Object.keys(provider.models))

  expect(pickerModels.every((model) => runtimeModels.includes(model))).toBe(true)
  expect(pickerModels).not.toContain("catalog-only-model")
})

test("unresolved runtime instance exposes no selectable models", () => {
  const selected = selectProviderCatalog({
    explicit: true,
    directory: "/workspace",
    catalog: { ready: false, providers: catalog(["catalog-only-model"]) },
  })

  expect(selected.connected).toEqual([])
  expect(selected.all.size).toBe(0)
})

test("stale session model is fail-closed instead of falling back", () => {
  const fallback = { providerID: "runtime", modelID: "available-model" }
  const selected = resolvePromptModelKey({
    selected: { providerID: "removed", modelID: "stale-model" },
    configuredRequired: false,
    fallback,
    valid: (model) => model.providerID === fallback.providerID && model.modelID === fallback.modelID,
  })

  expect(selected.model).toBeUndefined()
  expect(selected.error).toStartWith("MODEL_SESSION_UNRESOLVED")
})

test("stale agent and configured defaults are reported without silent fallback", () => {
  const fallback = { providerID: "runtime", modelID: "available-model" }
  const valid = (model: typeof fallback) => model.providerID === fallback.providerID && model.modelID === fallback.modelID
  const agent = resolvePromptModelKey({
    agent: { providerID: "removed", modelID: "agent-model" },
    configuredRequired: false,
    fallback,
    valid,
  })
  const configured = resolvePromptModelKey({
    configured: { providerID: "removed", modelID: "default-model" },
    configuredRequired: true,
    fallback,
    valid,
  })
  const missing = resolvePromptModelKey({
    configuredRequired: true,
    fallback,
    valid,
  })

  expect(agent.model).toBeUndefined()
  expect(agent.error).toBe("Agent 模型已失效：removed/agent-model")
  expect(configured.model).toBeUndefined()
  expect(configured.error).toStartWith("MODEL_DEFAULT_UNRESOLVED")
  expect(missing.model).toBeUndefined()
  expect(missing.error).toStartWith("MODEL_DEFAULT_UNRESOLVED")
})

test("valid explicit model wins and implicit selection can use recent or fallback", () => {
  const available = { providerID: "runtime", modelID: "available-model" }
  const valid = (model: typeof available) => model.providerID === available.providerID && model.modelID === available.modelID

  expect(
    resolvePromptModelKey({
      selected: available,
      agent: { providerID: "removed", modelID: "agent-model" },
      configuredRequired: false,
      valid,
    }).model,
  ).toEqual(available)
  expect(
    resolvePromptModelKey({ configuredRequired: false, recent: available, valid }).model,
  ).toEqual(available)
})
