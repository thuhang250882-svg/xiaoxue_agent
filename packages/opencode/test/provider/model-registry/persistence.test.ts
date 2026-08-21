// Persistence behavior: dedicated registry file, reload across "restarts",
// tolerance of corrupted files, and the config-shape projection consumed by
// provider.ts.
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { access, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { ModelRegistry } from "@/provider/model-registry"
import { cleanup, modelFixture, registryFixture, sandbox, writeJSON } from "./_helper"

let dir: string

beforeEach(async () => {
  dir = await sandbox()
})

afterEach(async () => {
  await cleanup(dir)
})

describe("model registry persistence", () => {
  test("writes a dedicated models-registry.json that survives reloads", async () => {
    const created = await ModelRegistry.create({ providerId: "local-llm", modelId: "model-a" })
    const file = path.join(dir, "models-registry.json")
    await access(file)
    const raw = JSON.parse(await readFile(file, "utf8"))
    expect(raw.version).toBe(1)
    expect(raw.models[0].key).toBe(created.key)
    // Simulate a process restart: fresh load reads the same file
    expect((await ModelRegistry.list()).map((model) => model.key)).toEqual([created.key])
    expect(await ModelRegistry.get(created.key)).toMatchObject({ providerId: "local-llm", modelId: "model-a" })
  })

  test("missing or corrupted registry files degrade to an empty registry", async () => {
    expect(await ModelRegistry.list()).toEqual([])
    await writeFile(path.join(dir, "models-registry.json"), "{not-json", "utf8")
    expect(await ModelRegistry.list()).toEqual([])
    // Writes recover by overwriting the corrupted file
    await ModelRegistry.create({ providerId: "local-llm", modelId: "model-a" })
    expect(await ModelRegistry.list()).toHaveLength(1)
  })

  test("does not touch the legacy opencode.json while persisting", async () => {
    const legacy = { provider: { "local-llm": { models: { "model-a": { name: "A" } } } } }
    await writeJSON(dir, "opencode.json", legacy)
    await ModelRegistry.create({ providerId: "local-llm", modelId: "model-b" })
    expect(JSON.parse(await readFile(path.join(dir, "opencode.json"), "utf8"))).toEqual(legacy)
  })

  test("toConfigProviders projects entries into the config provider shape", () => {
    const providers = ModelRegistry.toConfigProviders([
      modelFixture({ key: "mdl_1", providerId: "local-llm", modelId: "model-a", displayName: "A", contextWindow: 4096, capabilities: { reasoning: true, vision: true, tools: false } }),
      modelFixture({ key: "mdl_2", providerId: "local-llm", modelId: "model-b", displayName: "B" }),
      modelFixture({ key: "mdl_3", providerId: "other", modelId: "model-c", displayName: "C" }),
    ] as never)
    expect(Object.keys(providers).sort()).toEqual(["local-llm", "other"])
    expect(providers["local-llm"].models["model-a"]).toMatchObject({
      name: "A",
      reasoning: true,
      attachment: true,
      tool_call: false,
      limit: { context: 4096 },
    })
    expect(providers["local-llm"].models["model-b"].name).toBe("B")
    expect(providers["other"].models["model-c"].name).toBe("C")
  })
})

describe("model registry legacy import", () => {
  test("imports legacy provider config models once with stable keys", async () => {
    await ModelRegistry.importLegacyConfigModels({
      "local-llm": { models: { "model-a": { name: "Legacy A", limit: { context: 8192 } } } },
    })
    const models = await ModelRegistry.list()
    expect(models).toHaveLength(1)
    expect(models[0].key).toStartWith("mdl_")
    expect(models[0].source).toBe("custom")
    expect(models[0].displayName).toBe("Legacy A")
    expect(models[0].contextWindow).toBe(8192)
    // Second run must not duplicate
    await ModelRegistry.importLegacyConfigModels({
      "local-llm": { models: { "model-a": { name: "Legacy A" } } },
    })
    expect(await ModelRegistry.list()).toHaveLength(1)
  })

  test("tombstones stop deleted models from being re-imported (regression A)", async () => {
    await ModelRegistry.importLegacyConfigModels({
      "local-llm": { models: { "old-model-id": {} } },
    })
    const [imported] = await ModelRegistry.list()
    await ModelRegistry.remove(imported.key)
    expect(await ModelRegistry.list()).toHaveLength(0)
    // Provider rebuild re-runs the import against unchanged legacy config
    await ModelRegistry.importLegacyConfigModels({
      "local-llm": { models: { "old-model-id": {} } },
    })
    expect(await ModelRegistry.list()).toHaveLength(0)
    const raw = JSON.parse(await readFile(path.join(dir, "models-registry.json"), "utf8"))
    expect(raw.tombstones).toContain("local-llm/old-model-id")
  })

  test("deleting an edited legacy model tombstones both the original and current ids", async () => {
    const providers = { "local-llm": { models: { "old-model-id": {} } } }
    await ModelRegistry.importLegacyConfigModels(providers)
    const [imported] = await ModelRegistry.list()
    await ModelRegistry.update(imported.key, { modelId: "new-model-id" })
    await ModelRegistry.remove(imported.key)

    await ModelRegistry.importLegacyConfigModels(providers)
    expect(await ModelRegistry.list()).toEqual([])
    const raw = JSON.parse(await readFile(path.join(dir, "models-registry.json"), "utf8"))
    expect(raw.tombstones).toContain("local-llm/old-model-id")
    expect(raw.tombstones).toContain("local-llm/new-model-id")
  })

  test("imports legacy models from JSONC with comments and trailing commas", async () => {
    await writeFile(
      path.join(dir, "opencode.jsonc"),
      `{
        // Local provider configuration
        "provider": {
          "local-llm": {
            "models": {
              "model-a": { "name": "Model A" },
            },
          },
        },
      }`,
      "utf8",
    )
    await ModelRegistry.importLegacyConfigModels()
    expect(await ModelRegistry.list()).toMatchObject([
      { providerId: "local-llm", modelId: "model-a", displayName: "Model A" },
    ])
  })

  test("weird legacy configs are imported defensively and never throw", async () => {
    await ModelRegistry.importLegacyConfigModels(undefined)
    // null model entries still produce a managed entry with safe defaults
    await ModelRegistry.importLegacyConfigModels({ broken: { models: { x: null } } })
    const models = await ModelRegistry.list()
    expect(models).toHaveLength(1)
    expect(models[0].modelId).toBe("x")
    expect(models[0].displayName).toBe("x")
  })

  test("seeds unresolved list placeholder via registry fixture roundtrip", async () => {
    await writeJSON(dir, "models-registry.json", registryFixture([], { unresolved: [{ reference: "a/b", locations: ["x"] }] }))
    expect(await ModelRegistry.unresolvedReferences()).toEqual([{ reference: "a/b", locations: ["x"] }])
  })
})
