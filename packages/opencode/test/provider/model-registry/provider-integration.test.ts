// Regression scenarios A/B/C proven through the real Provider service:
//  A: deleting a model survives provider rebuilds and restarts (no resurrection)
//  B: newly created registry models really enter the Provider database
//  C: editing a modelId takes effect on the next provider rebuild (the write
//     endpoints trigger exactly that rebuild via instance dispose)
import { afterEach, expect } from "bun:test"
import { Effect, Exit } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { ModelsDev } from "@opencode-ai/core/models-dev"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { Auth } from "@/auth"
import { Config } from "@/config/config"
import { Env } from "@/env"
import { Plugin } from "@/plugin/index"
import { ModelRegistry } from "@/provider/model-registry"
import { Provider } from "@/provider/provider"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { provideTmpdirInstance } from "../../fixture/fixture"
import { testEffect } from "../../lib/effect"
import { cleanup, sandbox } from "./_helper"

const providerLayer = LayerNode.compile(
  LayerNode.group([
    Provider.node,
    FSUtil.node,
    Env.node,
    Config.node,
    Auth.node,
    Plugin.node,
    ModelsDev.node,
    RuntimeFlags.node,
  ]),
)

const it = testEffect(providerLayer)

const sandboxDirs: string[] = []

const sandboxed = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const dir = yield* Effect.promise(sandbox)
    sandboxDirs.push(dir)
    return yield* self
  }).pipe(Effect.provide(AppNodeBuilder.build(CrossSpawnSpawner.node)))

afterEach(async () => {
  for (const dir of sandboxDirs.splice(0)) {
    await cleanup(dir)
  }
})

const providerID = ProviderV2.ID.make("local-llm")

it.live(
  "regression B: a model created in the registry enters the provider database",
  sandboxed(
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        ModelRegistry.create({ providerId: "local-llm", modelId: "qwen3-32b", displayName: "通义千问 32B" }),
      )
      yield* provideTmpdirInstance(() =>
        Effect.gen(function* () {
          const model = yield* Provider.use.getModel(providerID, ModelV2.ID.make("qwen3-32b"))
          expect(String(model.id)).toBe("qwen3-32b")
          expect(model.name).toBe("通义千问 32B")
          const providers = yield* Provider.use.list()
          const local = providers[providerID]
          expect(local).toBeDefined()
          expect(Object.keys(local.models)).toContain("qwen3-32b")
        }),
      )
    }),
  ),
)

it.live(
  "regression A: deleted models do not resurrect after provider rebuild or restart",
  sandboxed(
    Effect.gen(function* () {
      const created = yield* Effect.promise(() =>
        ModelRegistry.create({ providerId: "local-llm", modelId: "old-model-id" }),
      )

      // First boot: the model exists
      yield* provideTmpdirInstance(() =>
        Effect.gen(function* () {
          const model = yield* Provider.use.getModel(providerID, ModelV2.ID.make("old-model-id"))
          expect(String(model.id)).toBe("old-model-id")
        }),
      )

      // Delete through the registry (what the DELETE endpoint does)
      yield* Effect.promise(() => ModelRegistry.remove(created.key))

      // Second boot: provider rebuild re-runs the legacy import, tombstones
      // must keep the deleted model gone
      yield* provideTmpdirInstance(() =>
        Effect.gen(function* () {
          const exit = yield* Provider.use.getModel(providerID, ModelV2.ID.make("old-model-id")).pipe(Effect.exit)
          expect(Exit.isFailure(exit)).toBe(true)
          const providers = yield* Provider.use.list()
          const local = providers[providerID]
          expect(local?.models ?? {}).not.toHaveProperty("old-model-id")
        }),
      )
    }),
  ),
)

it.live(
  "regression C: editing modelId takes effect on provider rebuild while the stable key stays constant",
  sandboxed(
    Effect.gen(function* () {
      const created = yield* Effect.promise(() =>
        ModelRegistry.create({ providerId: "local-llm", modelId: "model-A-old" }),
      )

      yield* provideTmpdirInstance(() =>
        Effect.gen(function* () {
          const model = yield* Provider.use.getModel(providerID, ModelV2.ID.make("model-A-old"))
          expect(String(model.id)).toBe("model-A-old")
        }),
      )

      // The PATCH endpoint updates the registry then disposes instances; the
      // second instance boot below simulates that dispose-driven rebuild.
      yield* Effect.promise(() => ModelRegistry.update(created.key, { modelId: "model-A-new" }))
      expect((yield* Effect.promise(() => ModelRegistry.resolve(created.key)))?.modelID).toBe("model-A-new")

      yield* provideTmpdirInstance(() =>
        Effect.gen(function* () {
          const model = yield* Provider.use.getModel(providerID, ModelV2.ID.make("model-A-new"))
          expect(String(model.id)).toBe("model-A-new")
          const exit = yield* Provider.use.getModel(providerID, ModelV2.ID.make("model-A-old")).pipe(Effect.exit)
          expect(Exit.isFailure(exit)).toBe(true)
        }),
      )
    }),
  ),
)

it.live(
  "two providers can share the same modelId without cross-contamination",
  sandboxed(
    Effect.gen(function* () {
      const first = yield* Effect.promise(() =>
        ModelRegistry.create({ providerId: "local-llm", modelId: "qwen3-32b" }),
      )
      const second = yield* Effect.promise(() =>
        ModelRegistry.create({ providerId: "local-llm-backup", modelId: "qwen3-32b" }),
      )
      expect(first.key).not.toBe(second.key)

      yield* provideTmpdirInstance(() =>
        Effect.gen(function* () {
          const a = yield* Provider.use.getModel(providerID, ModelV2.ID.make("qwen3-32b"))
          const b = yield* Provider.use.getModel(ProviderV2.ID.make("local-llm-backup"), ModelV2.ID.make("qwen3-32b"))
          expect(String(a.providerID)).toBe("local-llm")
          expect(String(b.providerID)).toBe("local-llm-backup")
          const providers = yield* Provider.use.list()
          expect(Object.keys(providers[providerID]?.models ?? {})).toContain("qwen3-32b")
          expect(Object.keys(providers[ProviderV2.ID.make("local-llm-backup")]?.models ?? {})).toContain("qwen3-32b")
        }),
      )

      // Deleting one copy must not affect the other provider's model
      yield* Effect.promise(() => ModelRegistry.remove(first.key))
      yield* provideTmpdirInstance(() =>
        Effect.gen(function* () {
          const b = yield* Provider.use.getModel(ProviderV2.ID.make("local-llm-backup"), ModelV2.ID.make("qwen3-32b"))
          expect(String(b.providerID)).toBe("local-llm-backup")
          const exit = yield* Provider.use.getModel(providerID, ModelV2.ID.make("qwen3-32b")).pipe(Effect.exit)
          expect(Exit.isFailure(exit)).toBe(true)
        }),
      )
    }),
  ),
)

it.live(
  "disabled registry models disappear from the provider database",
  sandboxed(
    Effect.gen(function* () {
      const created = yield* Effect.promise(() =>
        ModelRegistry.create({ providerId: "local-llm", modelId: "model-a" }),
      )
      yield* Effect.promise(() => ModelRegistry.setEnabled(created.key, false))

      yield* provideTmpdirInstance(() =>
        Effect.gen(function* () {
          const providers = yield* Provider.use.list()
          const local = providers[providerID]
          expect(local?.models ?? {}).not.toHaveProperty("model-a")
        }),
      )
    }),
  ),
)
