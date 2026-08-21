// CRUD semantics of the model registry: stable keys, duplicate detection,
// validation, source-specific delete behavior and tombstones.
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { ModelRegistry, ModelRegistryError, type ModelErrorCode } from "@/provider/model-registry"
import { cleanup, modelFixture, registryFixture, sandbox, writeJSON } from "./_helper"

let dir: string

beforeEach(async () => {
  dir = await sandbox()
})

afterEach(async () => {
  await cleanup(dir)
})

const expectError = async (code: ModelErrorCode, run: () => Promise<unknown>) => {
  try {
    await run()
  } catch (error) {
    expect(error).toBeInstanceOf(ModelRegistryError)
    expect((error as ModelRegistryError).code).toBe(code)
    return
  }
  throw new Error(`expected ${code} to be thrown`)
}

describe("model registry create", () => {
  test("creates a custom model with a stable mdl_ key and defaults", async () => {
    const created = await ModelRegistry.create({ providerId: "local-llm", modelId: "qwen3-32b" })
    expect(created.key).toStartWith("mdl_")
    expect(created.source).toBe("custom")
    expect(created.enabled).toBe(true)
    expect(created.hidden).toBe(false)
    expect(created.displayName).toBe("qwen3-32b")
    expect(await ModelRegistry.list()).toHaveLength(1)
  })

  test("displayName falls back to modelId but can be overridden", async () => {
    const created = await ModelRegistry.create({
      providerId: "local-llm",
      modelId: "qwen3-32b",
      displayName: "通义千问 32B",
      contextWindow: 32768,
    })
    expect(created.displayName).toBe("通义千问 32B")
    expect(created.contextWindow).toBe(32768)
  })

  test("rejects duplicate providerId/modelId pairs", async () => {
    await ModelRegistry.create({ providerId: "local-llm", modelId: "qwen3-32b" })
    await expectError("MODEL_ID_DUPLICATE", () => ModelRegistry.create({ providerId: "local-llm", modelId: "qwen3-32b" }))
    // Same modelId on another provider is fine
    await ModelRegistry.create({ providerId: "other-llm", modelId: "qwen3-32b" })
    expect(await ModelRegistry.list()).toHaveLength(2)
  })

  test("rejects blank input with MODEL_VALIDATION_FAILED", async () => {
    await expectError("MODEL_VALIDATION_FAILED", () => ModelRegistry.create({ providerId: "", modelId: "x" }))
    await expectError("MODEL_VALIDATION_FAILED", () => ModelRegistry.create({ providerId: "x", modelId: "  " }))
  })

  test("createMany validates the complete batch before writing", async () => {
    await expect(
      ModelRegistry.createMany([
        { providerId: "local-llm", modelId: "model-a" },
        { providerId: "local-llm", modelId: "model-a" },
      ]),
    ).rejects.toMatchObject({ code: "MODEL_ID_DUPLICATE" })
    expect(await ModelRegistry.list()).toEqual([])
  })
})

describe("model registry update", () => {
  test("updates fields and bumps updatedAt", async () => {
    const created = await ModelRegistry.create({ providerId: "local-llm", modelId: "model-a" })
    const updated = await ModelRegistry.update(created.key, {
      displayName: "Renamed",
      contextWindow: 4096,
      capabilities: { reasoning: true },
    })
    expect(updated.displayName).toBe("Renamed")
    expect(updated.contextWindow).toBe(4096)
    expect(updated.capabilities?.reasoning).toBe(true)
    expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt)
  })

  test("rejects renaming to an existing modelId of the same provider", async () => {
    const a = await ModelRegistry.create({ providerId: "local-llm", modelId: "model-a" })
    await ModelRegistry.create({ providerId: "local-llm", modelId: "model-b" })
    await expectError("MODEL_ID_DUPLICATE", () => ModelRegistry.update(a.key, { modelId: "model-b" }))
  })

  test("unknown key fails with MODEL_NOT_FOUND", async () => {
    await expectError("MODEL_NOT_FOUND", () => ModelRegistry.update("mdl_missing", { displayName: "x" }))
    await expectError("MODEL_NOT_FOUND", () => ModelRegistry.remove("mdl_missing"))
    await expectError("MODEL_NOT_FOUND", () => ModelRegistry.references("mdl_missing"))
  })
})

describe("model registry remove", () => {
  test("custom models are deleted permanently and tombstoned", async () => {
    const created = await ModelRegistry.create({ providerId: "local-llm", modelId: "model-a" })
    await ModelRegistry.remove(created.key)
    expect(await ModelRegistry.list()).toHaveLength(0)
    const raw = JSON.parse(await readFile(path.join(dir, "models-registry.json"), "utf8"))
    expect(raw.tombstones).toContain("local-llm/model-a")
  })

  test("builtin models cannot be deleted", async () => {
    await writeJSON(dir, "models-registry.json", registryFixture([modelFixture({ source: "builtin" })]))
    await expectError("MODEL_VALIDATION_FAILED", () => ModelRegistry.remove("mdl_fixture"))
    expect(await ModelRegistry.list()).toHaveLength(1)
  })

  test("discovered models are hidden instead of deleted", async () => {
    await writeJSON(dir, "models-registry.json", registryFixture([modelFixture({ source: "discovered" })]))
    await ModelRegistry.remove("mdl_fixture")
    const models = await ModelRegistry.list()
    expect(models).toHaveLength(1)
    expect(models[0].hidden).toBe(true)
  })
})

describe("model registry enable/disable", () => {
  test("toggles enabled for managed models", async () => {
    const created = await ModelRegistry.create({ providerId: "local-llm", modelId: "model-a" })
    await ModelRegistry.setEnabled(created.key, false)
    expect((await ModelRegistry.get(created.key))?.enabled).toBe(false)
    await ModelRegistry.setEnabled(created.key, true)
    expect((await ModelRegistry.get(created.key))?.enabled).toBe(true)
  })

  test("builtin models are tracked in disabledBuiltin instead of being edited", async () => {
    await writeJSON(dir, "models-registry.json", registryFixture([modelFixture({ source: "builtin", providerId: "anthropic", modelId: "claude-x" })]))
    await ModelRegistry.setEnabled("mdl_fixture", false)
    expect(await ModelRegistry.disabledBuiltinIDs()).toEqual(["anthropic/claude-x"])
    await ModelRegistry.setEnabled("mdl_fixture", true)
    expect(await ModelRegistry.disabledBuiltinIDs()).toEqual([])
  })

  test("the generic update path toggles builtins without allowing identity edits", async () => {
    await writeJSON(dir, "models-registry.json", registryFixture([modelFixture({ source: "builtin", providerId: "anthropic", modelId: "claude-x" })]))
    expect((await ModelRegistry.update("mdl_fixture", { enabled: false })).enabled).toBe(false)
    expect(await ModelRegistry.disabledBuiltinIDs()).toEqual(["anthropic/claude-x"])
    await expectError("MODEL_VALIDATION_FAILED", () => ModelRegistry.update("mdl_fixture", { modelId: "claude-y" }))
  })

  test("listUsable excludes disabled entries and assertUsable throws MODEL_DISABLED", async () => {
    const created = await ModelRegistry.create({ providerId: "local-llm", modelId: "model-a" })
    await ModelRegistry.setEnabled(created.key, false)
    expect(await ModelRegistry.listUsable()).toHaveLength(0)
    await expectError("MODEL_DISABLED", () => ModelRegistry.assertUsable("local-llm", "model-a"))
    // Unknown models are not registry-managed and stay callable
    await ModelRegistry.assertUsable("local-llm", "someone-elses-model")
  })
})
