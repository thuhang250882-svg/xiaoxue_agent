export * as XiaoxueMemoryContext from "./memory-context"

import { Config } from "@opencode-ai/core/config"
import { makeLocationNode } from "@opencode-ai/core/effect/app-node"
import { Global } from "@opencode-ai/core/global"
import { Location } from "@opencode-ai/core/location"
import { MemoryContext } from "@opencode-ai/core/memory-context"
import { Effect, Layer } from "effect"
import path from "node:path"
import { XiaoxueMemory } from "./memory"

export const layer = Layer.effect(
  MemoryContext.Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const global = yield* Global.Service
    const location = yield* Location.Service

    return MemoryContext.Service.of({
      recall: Effect.fn("XiaoxueMemoryContext.recall")(function* (input) {
        const entries = yield* config.entries()
        const xiaoxue = Config.latest(entries, "xiaoxue")
        const settings = xiaoxue?.memory ?? Config.latest(entries, "memory")
        const memory = yield* Effect.promise(() =>
          XiaoxueMemory.prompt(
            input.sessionID,
            settings,
            location.directory,
            path.join(global.data, "xiaoxue", "memory"),
            location.project.id,
            input.query,
          ),
        )
        return [memory, input.review ? XiaoxueMemory.reviewPrompt(input.userTurns ?? 0, settings) : undefined]
          .filter((part): part is string => part !== undefined && part.length > 0)
          .join("\n\n")
      }),
      manage: Effect.fn("XiaoxueMemoryContext.manage")(function* (input) {
        const entries = yield* config.entries()
        const xiaoxue = Config.latest(entries, "xiaoxue")
        return yield* Effect.promise(() =>
          XiaoxueMemory.execute(
            input,
            xiaoxue?.memory ?? Config.latest(entries, "memory"),
            location.directory,
            path.join(global.data, "xiaoxue", "memory"),
            location.project.id,
          ),
        )
      }),
    })
  }),
)

export const node = makeLocationNode({
  service: MemoryContext.Service,
  layer,
  deps: [Config.node, Global.node, Location.node],
})

