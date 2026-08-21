import { Config } from "@/config/config"
import { GlobalBus, type GlobalEvent as GlobalBusEvent } from "@/bus/global"
import { EffectBridge } from "@/effect/bridge"
import { EventV2 } from "@opencode-ai/core/event"
import { Installation } from "@/installation"
import { disposeAllInstancesAndEmitGlobalDisposed } from "@/server/global-lifecycle"
import { ModelRegistry } from "@/provider/model-registry"
import { Provider } from "@/provider/provider"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { XiaoxueEnterprisePolicy } from "@/xiaoxue/enterprise-policy"
import { Effect, Queue, Schema } from "effect"
import * as Stream from "effect/Stream"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import * as Sse from "effect/unstable/encoding/Sse"
import { RootHttpApi } from "../api"
import { GlobalUpgradeInput } from "../groups/global"

function eventData(data: unknown): Sse.Event {
  return {
    _tag: "Event",
    event: "message",
    id: undefined,
    data: JSON.stringify(data),
  }
}

function parseBody(body: string) {
  try {
    return JSON.parse(body || "{}") as unknown
  } catch {
    return undefined
  }
}

function registryErrorResponse(error: unknown) {
  if (ModelRegistry.ModelRegistryError.isInstance(error)) {
    const status =
      error.code === "MODEL_IN_USE" || error.code === "MODEL_REGISTRY_CORRUPT" || error.code === "MODEL_REGISTRY_RECOVERY_REQUIRED"
        ? 409
        : error.code === "MODEL_NOT_FOUND"
          ? 404
          : 400
    return HttpServerResponse.jsonUnsafe({ ok: false as const, error: error.code, message: error.message }, { status })
  }
  return HttpServerResponse.jsonUnsafe(
    { ok: false as const, error: "MODEL_VALIDATION_FAILED", message: error instanceof Error ? error.message : String(error) },
    { status: 400 },
  )
}

async function tryRegistry<T>(run: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  try {
    return { ok: true, value: await run() }
  } catch (error) {
    return { ok: false, error }
  }
}

// handleRaw only receives the raw request, so the registry key is read from the
// URL path: /global/models/<key>[/(delete|references|test)]
function pathKey(request: HttpServerRequest.HttpServerRequest) {
  const segments = request.url.split("?")[0].split("/").filter(Boolean)
  const index = segments.indexOf("models")
  return decodeURIComponent(segments[index + 1] ?? "")
}

function eventResponse() {
  return Effect.gen(function* () {
    yield* Effect.logInfo("global event connected")
    const events = Stream.callback<GlobalBusEvent>((queue) => {
      const handler = (event: GlobalBusEvent) => Queue.offerUnsafe(queue, event)
      return Effect.acquireRelease(
        Effect.sync(() => GlobalBus.on("event", handler)),
        () => Effect.sync(() => GlobalBus.off("event", handler)),
      )
    })
    const heartbeat = Stream.tick("10 seconds").pipe(
      Stream.drop(1),
      Stream.map(() => ({ payload: { id: EventV2.ID.create(), type: "server.heartbeat", properties: {} } })),
    )

    return HttpServerResponse.stream(
      Stream.make({ payload: { id: EventV2.ID.create(), type: "server.connected", properties: {} } }).pipe(
        Stream.concat(events.pipe(Stream.merge(heartbeat, { haltStrategy: "left" }))),
        Stream.map(eventData),
        Stream.pipeThroughChannel(Sse.encode()),
        Stream.encodeText,
        Stream.ensuring(Effect.logInfo("global event disconnected")),
      ),
      {
        contentType: "text/event-stream",
        headers: {
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          "X-Content-Type-Options": "nosniff",
        },
      },
    )
  })
}

export const globalHandlers = HttpApiBuilder.group(RootHttpApi, "global", (handlers) =>
  Effect.gen(function* () {
    const config = yield* Config.Service
    const installation = yield* Installation.Service
    const provider = yield* Provider.Service
    const bridge = yield* EffectBridge.make()

    const health = Effect.fn("GlobalHttpApi.health")(function* () {
      return { healthy: true as const, version: InstallationVersion }
    })

    const event = Effect.fn("GlobalHttpApi.event")(function* () {
      return yield* eventResponse()
    })

    const configGet = Effect.fn("GlobalHttpApi.configGet")(function* () {
      return yield* config.getGlobal()
    })

    const configUpdate = Effect.fn("GlobalHttpApi.configUpdate")(function* (ctx) {
      const result = yield* config.updateGlobal(ctx.payload)
      // Callers rely on the response as the visibility boundary for provider
      // and model changes. Returning before disposal lets the next prompt reuse
      // an instance that still contains the old model ID.
      if (result.changed) yield* disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true })
      return result.info
    })

    const dispose = Effect.fn("GlobalHttpApi.dispose")(function* () {
      yield* disposeAllInstancesAndEmitGlobalDisposed()
      return true
    })

    const upgrade = Effect.fn("GlobalHttpApi.upgrade")(function* (ctx: { payload: typeof GlobalUpgradeInput.Type }) {
      const method = yield* installation.method()
      if (method === "unknown") {
        return {
          status: 400,
          body: { success: false as const, error: "Unknown installation method" },
        }
      }
      const target = ctx.payload.target || (yield* installation.latest(method))
      const result = yield* installation.upgrade(method, target).pipe(
        Effect.as({ status: 200, body: { success: true as const, version: target } }),
        Effect.catch((err) =>
          Effect.succeed({
            status: 500,
            body: {
              success: false as const,
              error: err instanceof Error ? err.message : String(err),
            },
          }),
        ),
      )
      if (!result.body.success) return result
      GlobalBus.emit("event", {
        directory: "global",
        payload: {
          type: Installation.Event.Updated.type,
          properties: { version: target },
        },
      })
      return result
    })

    const upgradeRaw = Effect.fn("GlobalHttpApi.upgradeRaw")(function* (ctx: {
      request: HttpServerRequest.HttpServerRequest
    }) {
      const body = yield* Effect.orDie(ctx.request.text)
      const json = parseBody(body)
      if (json === undefined) {
        return HttpServerResponse.jsonUnsafe({ success: false, error: "Invalid request body" }, { status: 400 })
      }
      const payload = yield* Schema.decodeUnknownEffect(GlobalUpgradeInput)(json).pipe(
        Effect.map((payload) => ({ valid: true as const, payload })),
        Effect.catch(() => Effect.succeed({ valid: false as const })),
      )
      if (!payload.valid) {
        return HttpServerResponse.jsonUnsafe({ success: false, error: "Invalid request body" }, { status: 400 })
      }
      const result = yield* upgrade({ payload: payload.payload })
      return HttpServerResponse.jsonUnsafe(result.body, { status: result.status })
    })

    type RawCtx = { request: HttpServerRequest.HttpServerRequest }

    const modelsList = Effect.fn("GlobalHttpApi.modelsList")(function* () {
      const result = yield* Effect.promise(() =>
        tryRegistry(async () => {
          await ModelRegistry.migrateLegacyReferences()
          return ModelRegistry.load()
        }),
      )
      if (!result.ok) return registryErrorResponse(result.error)
      const file = result.value
      return HttpServerResponse.jsonUnsafe({
        ok: true,
        models: file.models.filter((model) => !model.hidden),
        disabledBuiltin: file.disabledBuiltin,
        unresolved: file.unresolved,
      })
    })

    const modelsCreate = Effect.fn("GlobalHttpApi.modelsCreate")(function* (ctx: RawCtx) {
      const body = parseBody(yield* Effect.orDie(ctx.request.text)) as
        | ModelRegistry.CreateInput
        | { models?: ModelRegistry.CreateInput[] }
        | undefined
      const batch =
        typeof body === "object" && body !== null && "models" in body && Array.isArray(body.models)
          ? body.models
          : undefined
      if (batch) {
        const result = yield* Effect.promise(() => tryRegistry(() => ModelRegistry.createMany(batch)))
        if (!result.ok) return registryErrorResponse(result.error)
        yield* disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true })
        return HttpServerResponse.jsonUnsafe({ ok: true, models: result.value })
      }
      const result = yield* Effect.promise(() =>
        tryRegistry(() => ModelRegistry.create(body as ModelRegistry.CreateInput)),
      )
      if (!result.ok) return registryErrorResponse(result.error)
      yield* disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true })
      return HttpServerResponse.jsonUnsafe({ ok: true, model: result.value })
    })

    const modelsUpdate = Effect.fn("GlobalHttpApi.modelsUpdate")(function* (ctx: RawCtx) {
      const body = parseBody(yield* Effect.orDie(ctx.request.text)) as ModelRegistry.UpdateInput | undefined
      const key = pathKey(ctx.request)
      const result = yield* Effect.promise(() => tryRegistry(() => ModelRegistry.update(key, body ?? {})))
      if (!result.ok) return registryErrorResponse(result.error)
      yield* disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true })
      return HttpServerResponse.jsonUnsafe({ ok: true, model: result.value })
    })

    const modelsDelete = Effect.fn("GlobalHttpApi.modelsDelete")(function* (ctx: RawCtx) {
      const body = parseBody(yield* Effect.orDie(ctx.request.text)) as { replaceKey?: string } | undefined
      const key = pathKey(ctx.request)
      const result = yield* Effect.promise(() => tryRegistry(() => ModelRegistry.remove(key, body)))
      if (!result.ok) return registryErrorResponse(result.error)
      yield* disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true })
      return HttpServerResponse.jsonUnsafe({ ok: true })
    })

    const modelsReferences = Effect.fn("GlobalHttpApi.modelsReferences")(function* (ctx: RawCtx) {
      const key = pathKey(ctx.request)
      const result = yield* Effect.promise(() => tryRegistry(() => ModelRegistry.references(key)))
      if (!result.ok) return registryErrorResponse(result.error)
      return HttpServerResponse.jsonUnsafe({ ok: true, references: result.value })
    })

    const modelsTest = Effect.fn("GlobalHttpApi.modelsTest")(function* (ctx: RawCtx) {
      const body = parseBody(yield* Effect.orDie(ctx.request.text)) as
        | { timeoutMs?: number }
        | undefined
      const key = pathKey(ctx.request)
      const result = yield* Effect.promise(() =>
        tryRegistry(async () => {
          const entry = await ModelRegistry.get(key)
          if (!entry) {
            throw new ModelRegistry.ModelRegistryError({
              code: "MODEL_NOT_FOUND",
              message: `Registry entry ${key} not found`,
            })
          }
          const providerInfo = (await bridge.promise(provider.list()))[ProviderV2.ID.make(entry.providerId)]
          const baseUrl = providerInfo?.options.baseURL
          if (typeof baseUrl !== "string" || !baseUrl) {
            throw new ModelRegistry.ModelRegistryError({
              code: "MODEL_PROVIDER_UNAVAILABLE",
              message: `Provider ${entry.providerId} does not expose a configured baseURL`,
            })
          }
          if (!XiaoxueEnterprisePolicy.allowsProviderNetwork(baseUrl)) {
            throw new ModelRegistry.ModelRegistryError({
              code: "MODEL_PROVIDER_UNAVAILABLE",
              message: `Provider endpoint is blocked by enterprise policy: ${baseUrl}`,
            })
          }
          const apiKey =
            typeof providerInfo.key === "string"
              ? providerInfo.key
              : typeof providerInfo.options.apiKey === "string"
                ? providerInfo.options.apiKey
                : undefined
          return ModelRegistry.testModel(entry, { baseUrl, apiKey, timeoutMs: body?.timeoutMs })
        }),
      )
      if (!result.ok) return registryErrorResponse(result.error)
      return HttpServerResponse.jsonUnsafe({ ok: true, result: result.value })
    })

    const modelsRecoveryGet = Effect.fn("GlobalHttpApi.modelsRecoveryGet")(function* () {
      return HttpServerResponse.jsonUnsafe({ ok: true, recovery: yield* Effect.promise(() => ModelRegistry.diagnose()) })
    })

    const modelsRecoveryApply = Effect.fn("GlobalHttpApi.modelsRecoveryApply")(function* (ctx: RawCtx) {
      const body = parseBody(yield* Effect.orDie(ctx.request.text)) as
        | { action?: "replace" | "rebuild-empty"; registry?: unknown }
        | undefined
      if (body?.action !== "replace" && body?.action !== "rebuild-empty") {
        return registryErrorResponse(
          new ModelRegistry.ModelRegistryError({
            code: "MODEL_VALIDATION_FAILED",
            message: "Recovery action must be replace or rebuild-empty",
          }),
        )
      }
      const result = yield* Effect.promise(() =>
        tryRegistry(() => ModelRegistry.recoverCorruptRegistry({ action: body.action!, registry: body.registry })),
      )
      if (!result.ok) return registryErrorResponse(result.error)
      return HttpServerResponse.jsonUnsafe({ ok: true, recovery: result.value })
    })

    return handlers
      .handle("health", health)
      .handleRaw("event", event)
      .handle("configGet", configGet)
      .handle("configUpdate", configUpdate)
      .handle("dispose", dispose)
      .handleRaw("upgrade", upgradeRaw)
      .handleRaw("modelsList", modelsList)
      .handleRaw("modelsCreate", modelsCreate)
      .handleRaw("modelsUpdate", modelsUpdate)
      .handleRaw("modelsDelete", modelsDelete)
      .handleRaw("modelsReferences", modelsReferences)
      .handleRaw("modelsTest", modelsTest)
      .handleRaw("modelsRecoveryGet", modelsRecoveryGet)
      .handleRaw("modelsRecoveryApply", modelsRecoveryApply)
  }),
)
