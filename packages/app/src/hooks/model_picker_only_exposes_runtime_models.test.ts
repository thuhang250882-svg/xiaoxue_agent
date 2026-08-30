import { expect, test } from "bun:test"
import type { NormalizedProviderListResponse } from "@opencode-ai/session-ui/context"
import { selectProviderCatalog } from "./provider-catalog"

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
