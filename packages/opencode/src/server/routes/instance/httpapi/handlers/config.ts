import { Config } from "@/config/config"
import { Provider } from "@/provider/provider"
import * as InstanceState from "@/effect/instance-state"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { markInstanceForDisposal } from "../lifecycle"
import { XiaoxueMemory } from "@/xiaoxue/memory"

export const configHandlers = HttpApiBuilder.group(InstanceHttpApi, "config", (handlers) =>
  Effect.gen(function* () {
    const providerSvc = yield* Provider.Service
    const configSvc = yield* Config.Service

    const get = Effect.fn("ConfigHttpApi.get")(function* () {
      return yield* configSvc.get()
    })

    const update = Effect.fn("ConfigHttpApi.update")(function* (ctx) {
      yield* configSvc.update(ctx.payload)
      yield* markInstanceForDisposal(yield* InstanceState.context)
      return ctx.payload
    })

    const providers = Effect.fn("ConfigHttpApi.providers")(function* () {
      const providers = yield* providerSvc.list()
      return {
        providers: Object.values(providers).map(Provider.toPublicInfo),
        default: Provider.defaultModelIDs(providers),
      }
    })

    const xiaoxueMemory = Effect.fn("ConfigHttpApi.xiaoxueMemory")(function* () {
      return yield* Effect.promise(() => XiaoxueMemory.overview())
    })

    const xiaoxueMemoryUpdate = Effect.fn("ConfigHttpApi.xiaoxueMemoryUpdate")(function* (ctx: {
      params: { id: string }
      payload: { content: string }
    }) {
      const info = yield* configSvc.get()
      return yield* Effect.promise(() =>
        XiaoxueMemory.manage(ctx.params.id, "revise", info.xiaoxue?.memory ?? info.memory, ctx.payload.content),
      )
    })

    const xiaoxueMemoryHistory = Effect.fn("ConfigHttpApi.xiaoxueMemoryHistory")(function* (ctx: {
      params: { id: string }
    }) {
      return yield* Effect.promise(() => XiaoxueMemory.history(ctx.params.id))
    })

    const xiaoxueMemoryForget = Effect.fn("ConfigHttpApi.xiaoxueMemoryForget")(function* (ctx: {
      params: { id: string }
    }) {
      const info = yield* configSvc.get()
      return yield* Effect.promise(() =>
        XiaoxueMemory.manage(ctx.params.id, "forget", info.xiaoxue?.memory ?? info.memory),
      )
    })

    return handlers
      .handle("get", get)
      .handle("update", update)
      .handle("providers", providers)
      .handle("xiaoxueMemory", xiaoxueMemory)
      .handle("xiaoxueMemoryUpdate", xiaoxueMemoryUpdate)
      .handle("xiaoxueMemoryHistory", xiaoxueMemoryHistory)
      .handle("xiaoxueMemoryForget", xiaoxueMemoryForget)
  }),
)
