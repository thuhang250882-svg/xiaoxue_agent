// Agent layer integration: model_key frontmatter/config fields resolve through
// the registry while legacy "provider/model" strings keep working.
import { afterEach, expect } from "bun:test"
import { Cause, Effect, Exit } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Agent } from "@/agent/agent"
import { Auth } from "@/auth"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { ModelRegistry } from "@/provider/model-registry"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"
import { Skill } from "@/skill"
import { provideTmpdirInstance } from "../../fixture/fixture"
import { testEffect } from "../../lib/effect"
import { cleanup, sandbox } from "./_helper"

const agentLayer = LayerNode.compile(
  LayerNode.group([Agent.node, Plugin.node, Provider.node, Auth.node, Config.node, Skill.node, RuntimeFlags.node]),
)

const it = testEffect(agentLayer)

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

it.live(
  "agent configured with model_key resolves the current model through the registry",
  sandboxed(
    Effect.gen(function* () {
      const created = yield* Effect.promise(() =>
        ModelRegistry.create({ providerId: "local-llm", modelId: "model-a" }),
      )

      const runWith = (agentConfig: Record<string, unknown>) =>
        provideTmpdirInstance(() =>
          Effect.gen(function* () {
            const agent = yield* Agent.Service.use((svc) => svc.get("tester"))
            return agent
          }),
          { config: { agent: { tester: agentConfig } } },
        )

      // model_key wins over a stale legacy model string
      const byKey = yield* runWith({ model_key: created.key, model: "stale/stale-model" })
      expect(String(byKey?.model?.providerID)).toBe("local-llm")
      expect(String(byKey?.model?.modelID)).toBe("model-a")
      expect(byKey?.modelKey).toBe(created.key)

      // Legacy string still works when no key is configured
      const byLegacy = yield* runWith({ model: "local-llm/model-a" })
      expect(String(byLegacy?.model?.providerID)).toBe("local-llm")
      expect(String(byLegacy?.model?.modelID)).toBe("model-a")

      // After a modelId edit the same key resolves to the new id
      yield* Effect.promise(() => ModelRegistry.update(created.key, { modelId: "model-a-new" }))
      const afterEdit = yield* runWith({ model_key: created.key })
      expect(String(afterEdit?.model?.modelID)).toBe("model-a-new")
    }),
  ),
)

it.live(
  "agent configured with an unknown model_key fails instead of using a stale model id",
  sandboxed(
    Effect.gen(function* () {
      const result = yield* provideTmpdirInstance(
        () => Agent.Service.use((service) => service.get("tester")),
        { config: { agent: { tester: { model_key: "mdl_missing", model: "stale/old-model" } } } },
      ).pipe(Effect.exit)

      expect(Exit.isFailure(result)).toBeTrue()
      if (Exit.isSuccess(result)) return
      expect(String(Cause.squash(result.cause))).toContain("mdl_missing")
    }),
  ),
)
