// stable key resolution and agent model resolution semantics: modelKey beats
// legacy model references, and missing/unresolvable configuration fails loudly
// instead of silently falling back.
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { ModelRegistry, ModelRegistryError } from "@/provider/model-registry"
import { cleanup, sandbox } from "./_helper"

let dir: string

beforeEach(async () => {
  dir = await sandbox()
})

afterEach(async () => {
  await cleanup(dir)
})

describe("model registry resolve", () => {
  test("resolve maps a stable key to the current provider/model pair", async () => {
    const created = await ModelRegistry.create({ providerId: "local-llm", modelId: "model-a" })
    expect(await ModelRegistry.resolve(created.key)).toEqual({ providerID: "local-llm", modelID: "model-a" })
    // After a modelId edit the same key resolves to the new id
    await ModelRegistry.update(created.key, { modelId: "model-a-new" })
    expect(await ModelRegistry.resolve(created.key)).toEqual({ providerID: "local-llm", modelID: "model-a-new" })
  })

  test("resolve returns undefined for unknown keys", async () => {
    expect(await ModelRegistry.resolve("mdl_unknown")).toBeUndefined()
  })

  test("resolveAgentModel prefers modelKey over legacy model", async () => {
    const created = await ModelRegistry.create({ providerId: "local-llm", modelId: "model-a" })
    const resolved = await ModelRegistry.resolveAgentModel({
      modelKey: created.key,
      model: { providerID: "stale-provider", modelID: "stale-model" },
    })
    expect(resolved).toEqual({ providerID: "local-llm", modelID: "model-a" })
  })

  test("resolveAgentModel falls back to legacy model when no key is configured", async () => {
    const resolved = await ModelRegistry.resolveAgentModel({
      model: { providerID: "legacy-provider", modelID: "legacy-model" },
    })
    expect(resolved).toEqual({ providerID: "legacy-provider", modelID: "legacy-model" })
  })

  test("unresolvable modelKey raises MODEL_REFERENCE_UNRESOLVED", async () => {
    try {
      await ModelRegistry.resolveAgentModel({ modelKey: "mdl_gone", model: { providerID: "p", modelID: "m" } })
    } catch (error) {
      expect(error).toBeInstanceOf(ModelRegistryError)
      expect((error as ModelRegistryError).code).toBe("MODEL_REFERENCE_UNRESOLVED")
      return
    }
    throw new Error("expected MODEL_REFERENCE_UNRESOLVED")
  })

  test("agent without any model configuration raises MODEL_NOT_CONFIGURED", async () => {
    try {
      await ModelRegistry.resolveAgentModel({})
    } catch (error) {
      expect(error).toBeInstanceOf(ModelRegistryError)
      expect((error as ModelRegistryError).code).toBe("MODEL_NOT_CONFIGURED")
      return
    }
    throw new Error("expected MODEL_NOT_CONFIGURED")
  })
})
