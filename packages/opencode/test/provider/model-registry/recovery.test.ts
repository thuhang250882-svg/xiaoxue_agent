import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { ModelRegistry } from "@/provider/model-registry"
import { cleanup, sandbox } from "./_helper"

let dir: string

beforeEach(async () => {
  dir = await sandbox()
})

afterEach(async () => {
  ModelRegistry.setJournalFaultForTest()
  await cleanup(dir)
})

async function prepareReferencedModel() {
  const model = await ModelRegistry.create({ providerId: "local-llm", modelId: "model-old" })
  await writeFile(
    path.join(dir, "opencode.json"),
    JSON.stringify({ model: "local-llm/model-old", agent: { build: { model: "local-llm/model-old" } } }, null, 2),
    "utf8",
  )
  await mkdir(path.join(dir, "agent"), { recursive: true })
  await writeFile(path.join(dir, "agent", "reviewer.md"), "---\nmodel: local-llm/model-old\n---\n", "utf8")
  return model
}

async function diskState() {
  const registry = JSON.parse(await readFile(path.join(dir, "models-registry.json"), "utf8")) as {
    models: Array<{ modelId: string }>
  }
  return {
    registry: registry.models[0]?.modelId,
    config: await readFile(path.join(dir, "opencode.json"), "utf8"),
    agent: await readFile(path.join(dir, "agent", "reviewer.md"), "utf8"),
  }
}

async function journalExists() {
  return access(path.join(dir, "models-registry.journal.json")).then(
    () => true,
    () => false,
  )
}

describe("model registry journal rollback", () => {
  test("rolls back registry after the opencode.json write fails", async () => {
    const model = await prepareReferencedModel()
    ModelRegistry.setJournalFaultForTest({ failPathIncludes: "opencode.json" })

    await expect(ModelRegistry.update(model.key, { modelId: "model-new" })).rejects.toThrow("Injected write failure")

    const state = await diskState()
    expect(state.registry).toBe("model-old")
    expect(state.config).toContain("local-llm/model-old")
    expect(state.config).not.toContain("local-llm/model-new")
    expect(state.agent).toContain("local-llm/model-old")
    expect(await journalExists()).toBe(false)
  })

  test("compensates every completed write after a later agent file failure", async () => {
    const model = await prepareReferencedModel()
    ModelRegistry.setJournalFaultForTest({ failPathIncludes: "reviewer.md" })

    await expect(ModelRegistry.update(model.key, { modelId: "model-new" })).rejects.toThrow("Injected write failure")

    const state = await diskState()
    expect(state.registry).toBe("model-old")
    expect(state.config.match(/local-llm\/model-old/g)).toHaveLength(2)
    expect(state.agent).toContain("local-llm/model-old")
    expect(await journalExists()).toBe(false)
  })

  test("leaves an interrupted operation for startup recovery, then restores exact disk state", async () => {
    const model = await prepareReferencedModel()
    const before = await diskState()
    ModelRegistry.setJournalFaultForTest({ interruptAfterWrite: 2 })

    await expect(ModelRegistry.update(model.key, { modelId: "model-new" })).rejects.toThrow()
    expect(await journalExists()).toBe(true)
    expect((await ModelRegistry.diagnose()).status).toBe("recovery_required")

    ModelRegistry.setJournalFaultForTest()
    expect((await ModelRegistry.list())[0].modelId).toBe("model-old")
    expect(await diskState()).toEqual(before)
    expect(await journalExists()).toBe(false)
    expect((await ModelRegistry.diagnose()).status).toBe("healthy")
  })

  test("rolls back an unfinished journal even when all target files were written", async () => {
    const model = await prepareReferencedModel()
    const before = await diskState()
    ModelRegistry.setJournalFaultForTest({ interruptAfterWrite: 3 })

    await expect(ModelRegistry.update(model.key, { modelId: "model-new" })).rejects.toThrow()
    const partial = await diskState()
    expect(partial.registry).toBe("model-new")
    expect(partial.config).toContain("local-llm/model-new")
    expect(partial.agent).toContain("local-llm/model-new")

    ModelRegistry.setJournalFaultForTest()
    await ModelRegistry.load()
    expect(await diskState()).toEqual(before)
    expect(await journalExists()).toBe(false)
  })

  test("rolls back replacement deletion across registry, config, and agent references", async () => {
    const doomed = await prepareReferencedModel()
    const replacement = await ModelRegistry.create({ providerId: "local-llm", modelId: "model-new" })
    const before = await diskState()
    ModelRegistry.setJournalFaultForTest({ failPathIncludes: "reviewer.md" })

    await expect(ModelRegistry.remove(doomed.key, { replaceKey: replacement.key })).rejects.toThrow("Injected write failure")

    const registry = JSON.parse(await readFile(path.join(dir, "models-registry.json"), "utf8")) as {
      models: Array<{ key: string }>
      tombstones: string[]
    }
    expect(registry.models.map((model) => model.key).sort()).toEqual([doomed.key, replacement.key].sort())
    expect(registry.tombstones).toEqual([])
    expect(await diskState()).toEqual(before)
    expect(await journalExists()).toBe(false)
  })
})
