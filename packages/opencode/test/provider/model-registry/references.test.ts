// Reference scanning and cascade updates across the global config file and
// agent markdown frontmatter. This covers the "Agent still reads the old id"
// half of the bug: edits and deletes must keep every reference consistent.
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { ModelRegistry, ModelRegistryError } from "@/provider/model-registry"
import { cleanup, sandbox } from "./_helper"

let dir: string

beforeEach(async () => {
  dir = await sandbox()
})

afterEach(async () => {
  await cleanup(dir)
})

async function writeConfig(content: unknown) {
  await writeFile(path.join(dir, "opencode.json"), JSON.stringify(content, null, 2), "utf8")
}

async function readConfig() {
  return JSON.parse(await readFile(path.join(dir, "opencode.json"), "utf8")) as Record<string, unknown>
}

async function writeAgent(name: string, frontmatter: Record<string, string>, body = "agent body") {
  await mkdir(path.join(dir, "agent"), { recursive: true })
  const lines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${value}`)
  await writeFile(path.join(dir, "agent", `${name}.md`), `---\n${lines.join("\n")}\n---\n\n${body}\n`, "utf8")
}

async function readAgent(name: string) {
  return readFile(path.join(dir, "agent", `${name}.md`), "utf8")
}

describe("model registry reference scanning", () => {
  test("finds default model and agent config references in opencode.json", async () => {
    const created = await ModelRegistry.create({ providerId: "local-llm", modelId: "model-a" })
    await ModelRegistry.create({ providerId: "local-llm", modelId: "model-b" })
    await writeConfig({
      model: "local-llm/model-a",
      agent: {
        build: { model: "local-llm/model-a" },
        plan: { model: "local-llm/model-b" },
      },
    })
    const refs = await ModelRegistry.references(created.key)
    expect(refs).toHaveLength(2)
    expect(refs.some((ref) => ref.kind === "default")).toBe(true)
    expect(refs.some((ref) => ref.kind === "agent" && ref.agent === "build")).toBe(true)
    expect(refs.some((ref) => ref.agent === "plan")).toBe(false)
  })

  test("finds agent markdown frontmatter references", async () => {
    const created = await ModelRegistry.create({ providerId: "local-llm", modelId: "model-a" })
    await writeAgent("reviewer", { description: "reviews", model: "local-llm/model-a" })
    await writeAgent("unrelated", { model: "local-llm/model-b" })
    const refs = await ModelRegistry.references(created.key)
    expect(refs).toHaveLength(1)
    expect(refs[0]).toMatchObject({ kind: "agent", agent: "reviewer" })
  })

  test("returns an empty list when nothing references the model", async () => {
    const created = await ModelRegistry.create({ providerId: "local-llm", modelId: "model-a" })
    await writeConfig({ model: "other/model" })
    expect(await ModelRegistry.references(created.key)).toEqual([])
  })
})

describe("model registry cascade on modelId edit (regression C config layer)", () => {
  test("editing modelId rewrites opencode.json and frontmatter references", async () => {
    const created = await ModelRegistry.create({ providerId: "local-llm", modelId: "model-A-old" })
    await writeConfig({ model: "local-llm/model-A-old", agent: { build: { model: "local-llm/model-A-old" } } })
    await writeAgent("reviewer", { model: "local-llm/model-A-old" })

    await ModelRegistry.update(created.key, { modelId: "model-A-new" })

    const config = await readConfig()
    expect(config.model).toBe("local-llm/model-A-new")
    expect((config.agent as Record<string, { model: string }>).build.model).toBe("local-llm/model-A-new")
    expect(await readAgent("reviewer")).toContain("model: local-llm/model-A-new")
    expect(await readAgent("reviewer")).not.toContain("model-A-old")
    // Registry itself reports the new id under the same stable key
    expect(await ModelRegistry.resolve(created.key)).toEqual({ providerID: "local-llm", modelID: "model-A-new" })
  })

  test("editing references preserves JSONC comments and trailing commas", async () => {
    const created = await ModelRegistry.create({ providerId: "local-llm", modelId: "model-old" })
    const config = path.join(dir, "opencode.jsonc")
    await writeFile(
      config,
      `{
        // Keep this operator note
        "model": "local-llm/model-old",
        "agent": {
          "build": { "model": "local-llm/model-old" },
        },
      }`,
      "utf8",
    )

    await ModelRegistry.update(created.key, { modelId: "model-new" })

    const content = await readFile(config, "utf8")
    expect(content).toContain("// Keep this operator note")
    expect(content.match(/local-llm\/model-new/g)).toHaveLength(2)
    expect(content).not.toContain("local-llm/model-old")
  })
})

describe("model registry delete with references", () => {
  test("deleting a referenced model without replacement fails with MODEL_IN_USE", async () => {
    const created = await ModelRegistry.create({ providerId: "local-llm", modelId: "model-a" })
    await writeConfig({ model: "local-llm/model-a" })
    try {
      await ModelRegistry.remove(created.key)
    } catch (error) {
      expect(error).toBeInstanceOf(ModelRegistryError)
      expect((error as ModelRegistryError).code).toBe("MODEL_IN_USE")
      expect(await ModelRegistry.list()).toHaveLength(1)
      return
    }
    throw new Error("expected MODEL_IN_USE")
  })

  test("replaceKey migrates references before deleting", async () => {
    const doomed = await ModelRegistry.create({ providerId: "local-llm", modelId: "model-old" })
    const replacement = await ModelRegistry.create({ providerId: "local-llm", modelId: "model-new" })
    await writeConfig({ model: "local-llm/model-old", agent: { build: { model: "local-llm/model-old" } } })
    await writeAgent("reviewer", { model: "local-llm/model-old" })

    await ModelRegistry.remove(doomed.key, { replaceKey: replacement.key })

    expect(await ModelRegistry.list()).toHaveLength(1)
    const config = await readConfig()
    expect(config.model).toBe("local-llm/model-new")
    // Agent config references are upgraded to the stable model_key
    const build = (config.agent as Record<string, { model?: string; model_key?: string }>).build
    expect(build.model_key).toBe(replacement.key)
    expect(build.model).toBeUndefined()
    // Markdown frontmatter stays a plain string so every consumer understands it
    expect(await readAgent("reviewer")).toContain("model: local-llm/model-new")
  })

  test("unknown replaceKey fails with MODEL_NOT_FOUND", async () => {
    const doomed = await ModelRegistry.create({ providerId: "local-llm", modelId: "model-old" })
    try {
      await ModelRegistry.remove(doomed.key, { replaceKey: "mdl_missing" })
    } catch (error) {
      expect((error as ModelRegistryError).code).toBe("MODEL_NOT_FOUND")
      expect(await ModelRegistry.list()).toHaveLength(1)
      return
    }
    throw new Error("expected MODEL_NOT_FOUND")
  })
})

describe("model registry legacy reference migration", () => {
  test("upgrades uniquely matching legacy references to model_key", async () => {
    await ModelRegistry.importLegacyConfigModels({
      "local-llm": { models: { "model-a": {} } },
    })
    const [managed] = await ModelRegistry.list()
    await writeConfig({ agent: { build: { model: "local-llm/model-a" } } })
    await writeAgent("reviewer", { model: "local-llm/model-a" })

    await ModelRegistry.migrateLegacyReferences()

    const config = await readConfig()
    const build = (config.agent as Record<string, { model?: string; model_key?: string }>).build
    expect(build.model_key).toBe(managed.key)
    expect(await readAgent("reviewer")).toContain("model: local-llm/model-a")
  })

  test("ambiguous references are recorded as unresolved instead of guessed", async () => {
    // Two providers expose the same modelId: migration must not pick one
    await ModelRegistry.importLegacyConfigModels({
      ollama: { models: { "shared-model": {} } },
      vllm: { models: { "shared-model": {} } },
    })
    await writeConfig({ agent: { build: { model: "ollama/shared-model" } } })
    await ModelRegistry.migrateLegacyReferences()
    const unresolved = await ModelRegistry.unresolvedReferences()
    expect(unresolved.map((item) => item.reference)).not.toContain("ollama/shared-model")
  })

  test("migration is a no-op without registry entries and never throws", async () => {
    await ModelRegistry.migrateLegacyReferences()
    expect(await ModelRegistry.list()).toEqual([])
  })
})
