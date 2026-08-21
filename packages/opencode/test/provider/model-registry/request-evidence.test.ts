// Acceptance evidence: the model ID actually sent on the wire to the provider
// endpoint follows registry edits. Uses a recording HTTP server so the asserted
// value is the real request body, not internal state.
//
// Flow mirrors production: the PATCH /global/models/:key endpoint updates the
// registry then disposes instances; the next request rebuilds the provider
// database and streams against the new modelId.
import { afterEach, expect } from "bun:test"
import { createServer, type Server } from "node:http"
import { streamText } from "ai"
import { Effect } from "effect"
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

// Minimal OpenAI-compatible SSE responder that records every request body so
// tests can assert the exact `model` field put on the wire.
async function recordingServer(): Promise<{ server: Server; url: string; bodies: Array<{ model?: string }> }> {
  const bodies: Array<{ model?: string }> = []
  const server = createServer((req, res) => {
    let raw = ""
    req.on("data", (chunk) => (raw += chunk))
    req.on("end", () => {
      try {
        bodies.push(JSON.parse(raw))
      } catch {
        bodies.push({})
      }
      res.writeHead(200, { "content-type": "text/event-stream" })
      res.end('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("server did not bind to a TCP port")
  return { server, url: `http://127.0.0.1:${address.port}/v1`, bodies }
}

// The model itself comes only from the registry; the provider entry carries
// connection options (baseURL/apiKey) like a real local LLM deployment.
function localProviderConfig(url: string) {
  return {
    formatter: false,
    lsp: false,
    provider: {
      "local-llm": {
        name: "Local LLM",
        id: "local-llm",
        env: [],
        npm: "@ai-sdk/openai-compatible",
        options: { apiKey: "test-key", baseURL: url },
      },
    },
  }
}

const streamOnce = Effect.fn("test.streamOnce")(function* (modelId: string) {
  const provider = yield* Provider.Service
  const model = yield* provider.getModel(ProviderV2.ID.make("local-llm"), ModelV2.ID.make(modelId))
  const result = streamText({
    model: yield* provider.getLanguage(model),
    messages: [{ role: "user", content: "hello" }],
  })
  return yield* Effect.promise(() => result.text)
})

it.live(
  "wire evidence: the provider request carries the registry modelId, and follows a modelId edit",
  sandboxed(
    Effect.gen(function* () {
      const server = yield* Effect.acquireRelease(
        Effect.promise(recordingServer),
        (server) => Effect.sync(() => server.server.close()),
      )

      const created = yield* Effect.promise(() =>
        ModelRegistry.create({ providerId: "local-llm", modelId: "old-model-id" }),
      )

      // Boot 1: request goes out with the original modelId
      yield* provideTmpdirInstance(
        () =>
          Effect.gen(function* () {
            expect(yield* streamOnce("old-model-id")).toBe("ok")
          }),
        { config: localProviderConfig(server.url) },
      )
      expect(server.bodies.at(-1)?.model).toBe("old-model-id")

      // What PATCH /global/models/:key does: registry update + instance dispose.
      // The dispose happened implicitly when the instance scope above ended;
      // the next boot rebuilds the provider database from the registry.
      yield* Effect.promise(() => ModelRegistry.update(created.key, { modelId: "new-model-id" }))
      expect((yield* Effect.promise(() => ModelRegistry.get(created.key)))?.key).toBe(created.key)

      // Boot 2: same stable key now streams under the new modelId
      yield* provideTmpdirInstance(
        () =>
          Effect.gen(function* () {
            expect(yield* streamOnce("new-model-id")).toBe("ok")
          }),
        { config: localProviderConfig(server.url) },
      )
      expect(server.bodies.at(-1)?.model).toBe("new-model-id")
      expect(server.bodies.map((body) => body.model)).toEqual(["old-model-id", "new-model-id"])
    }),
  ),
)
