import { NodeHttpServer } from "@effect/platform-node"
import { afterEach, beforeEach, describe, expect } from "bun:test"
import { createServer } from "node:http"
import { Context, Effect, Layer, Option } from "effect"
import { HttpBody, HttpClient, HttpClientRequest, HttpRouter } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { Installation } from "../../src/installation"
import { Provider } from "../../src/provider/provider"
import { ModelRegistry } from "../../src/provider/model-registry"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { InstanceRef } from "../../src/effect/instance-ref"
import { InstanceStore } from "../../src/project/instance-store"
import { MoveSession } from "@opencode-ai/core/control-plane/move-session"
import { ServerAuth } from "../../src/server/auth"
import { RootHttpApi } from "../../src/server/routes/instance/httpapi/api"
import { GlobalPaths } from "../../src/server/routes/instance/httpapi/groups/global"
import { controlHandlers } from "../../src/server/routes/instance/httpapi/handlers/control"
import { controlPlaneHandlers } from "../../src/server/routes/instance/httpapi/handlers/control-plane"
import { globalHandlers } from "../../src/server/routes/instance/httpapi/handlers/global"
import { authorizationLayer } from "../../src/server/routes/instance/httpapi/middleware/authorization"
import { schemaErrorLayer } from "../../src/server/routes/instance/httpapi/middleware/schema-error"
import { testEffect } from "../lib/effect"
import { cleanup, sandbox } from "../provider/model-registry/_helper"

let configDir: string
let providerState: Record<ProviderV2.ID, Provider.Info> = {}

beforeEach(async () => {
  configDir = await sandbox()
  providerState = {}
})

afterEach(async () => {
  await cleanup(configDir)
})

const apiLayer = HttpRouter.serve(
  HttpApiBuilder.layer(RootHttpApi).pipe(
    Layer.provide([controlHandlers, controlPlaneHandlers, globalHandlers]),
    Layer.provide([authorizationLayer, schemaErrorLayer]),
    // Raw HttpApi routes expose an opaque handler context at the request boundary.
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
    HttpRouter.provideRequest(Layer.succeedContext(Context.empty() as Context.Context<unknown>)),
  ),
  { disableListenLog: true, disableLogger: true },
).pipe(
  Layer.provideMerge(NodeHttpServer.layerTest),
  Layer.provide(Layer.mock(Auth.Service)({})),
  Layer.provide(Layer.mock(Config.Service)({})),
  Layer.provide(
    Layer.mock(Provider.Service)({
      list: () =>
        Effect.gen(function* () {
          const instance = yield* InstanceRef
          if (!instance) return yield* Effect.die(new Error("InstanceRef not provided"))
          return providerState
        }),
    }),
  ),
  Layer.provide(
    Layer.mock(InstanceStore.Service)({
      provide: (_input, effect) =>
        effect.pipe(
          Effect.provideService(
            InstanceRef,
            { directory: configDir, worktree: configDir, project: { id: "global-model-test" } } as never,
          ),
        ),
    }),
  ),
  Layer.provide(Layer.mock(MoveSession.Service)({})),
  Layer.provide(
    Layer.mock(Installation.Service)({
      method: () => Effect.succeed("npm"),
      latest: () => Effect.succeed("9.9.9"),
      upgrade: () => Effect.void,
    }),
  ),
  Layer.provide(ServerAuth.Config.configLayer({ password: Option.none(), username: "opencode" })),
)
const it = testEffect(apiLayer)

describe("global HttpApi", () => {
  it.live("upgrades to the requested version", () =>
    Effect.gen(function* () {
      const response = yield* HttpClientRequest.post(GlobalPaths.upgrade).pipe(
        HttpClientRequest.bodyJsonUnsafe({ target: "9.9.9" }),
        HttpClient.execute,
      )

      expect(response.status).toBe(200)
      expect(yield* response.json).toEqual({ success: true, version: "9.9.9" })
    }),
  )

  it.live("rejects invalid upgrade payloads", () =>
    Effect.gen(function* () {
      const response = yield* HttpClientRequest.post(GlobalPaths.upgrade).pipe(
        HttpClientRequest.bodyJsonUnsafe({ target: 1 }),
        HttpClient.execute,
      )

      expect(response.status).toBe(400)
    }),
  )

  it.live("rejects invalid upgrade target versions", () =>
    Effect.gen(function* () {
      const response = yield* HttpClientRequest.post(GlobalPaths.upgrade).pipe(
        HttpClientRequest.bodyJsonUnsafe({ target: "latest" }),
        HttpClient.execute,
      )

      expect(response.status).toBe(400)
    }),
  )

  it.live("rejects unsupported upgrade content types", () =>
    Effect.gen(function* () {
      const response = yield* HttpClientRequest.post(GlobalPaths.upgrade).pipe(
        HttpClientRequest.setBody(HttpBody.text('{"target":"1.0.0"}', "text/plain")),
        HttpClient.execute,
      )

      expect(response.status).toBe(415)
    }),
  )

  it.live("tests the server-configured provider endpoint and ignores a client-supplied URL", () =>
    Effect.gen(function* () {
      const calls: Array<{ authorization?: string; model?: string }> = []
      const target = yield* Effect.acquireRelease(
        Effect.promise(async () => {
          const server = createServer((request, response) => {
            let body = ""
            request.on("data", (chunk) => (body += chunk))
            request.on("end", () => {
              calls.push({
                authorization: request.headers.authorization,
                model: (JSON.parse(body) as { model?: string }).model,
              })
              response.writeHead(200, { "content-type": "application/json" })
              response.end("{}")
            })
          })
          await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
          const address = server.address()
          if (!address || typeof address === "string") throw new Error("test server did not bind")
          return { server, url: `http://127.0.0.1:${address.port}/v1` }
        }),
        ({ server }) => Effect.sync(() => server.close()),
      )
      const model = yield* Effect.promise(() =>
        ModelRegistry.create({ providerId: "local-llm", modelId: "current-model" }),
      )
      const providerID = ProviderV2.ID.make("local-llm")
      providerState[providerID] = {
        id: providerID,
        name: "Local LLM",
        source: "config",
        env: [],
        key: "server-key",
        options: { baseURL: target.url },
        models: {},
      }

      const response = yield* HttpClientRequest.post(`${GlobalPaths.models}/${encodeURIComponent(model.key)}/test`).pipe(
        HttpClientRequest.setBody(HttpBody.jsonUnsafe({ baseUrl: "http://127.0.0.1:1/private" })),
        HttpClient.execute,
      )

      expect(response.status).toBe(200)
      expect(yield* response.json).toMatchObject({ ok: true, result: { ok: true } })
      expect(calls).toEqual([{ authorization: "Bearer server-key", model: "current-model" }])
    }),
  )
})
