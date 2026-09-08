import { Config } from "@/config/config"
import { Provider } from "@/provider/provider"
import * as InstanceState from "@/effect/instance-state"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { markInstanceForDisposal } from "../lifecycle"
import { XiaoxueMemory } from "@/xiaoxue/memory"
import { listKnowledgeRecords } from "@/tool/knowledge-manage"
import { Global } from "@opencode-ai/core/global"
import path from "node:path"

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

    const xiaoxueKnowledge = Effect.fn("ConfigHttpApi.xiaoxueKnowledge")(function* () {
      return yield* Effect.promise(async () => {
        // 知识库管理界面的直览数据：分类计数 + 全量记录清单。
        const result = await listKnowledgeRecords(path.join(Global.Path.data, "knowledge"))
        const counts = new Map<string, number>()
        for (const record of result.records) {
          counts.set(record.category, (counts.get(record.category) ?? 0) + 1)
        }
        return {
          counts: [...counts.entries()].map(([category, count]) => ({ category, count })),
          entries: result.records.map((record) => ({
            id: record.id,
            title: record.title,
            category: record.category,
            fileName: record.fileName,
            importedAt: record.importedAt,
            size: record.size,
            fileType: record.fileType,
            version: record.version,
            updatedAt: record.updatedAt,
          })),
        }
      })
    })

    return handlers
      .handle("get", get)
      .handle("update", update)
      .handle("providers", providers)
      .handle("xiaoxueMemory", xiaoxueMemory)
      .handle("xiaoxueMemoryUpdate", xiaoxueMemoryUpdate)
      .handle("xiaoxueMemoryHistory", xiaoxueMemoryHistory)
      .handle("xiaoxueMemoryForget", xiaoxueMemoryForget)
      .handle("xiaoxueKnowledge", xiaoxueKnowledge)
  }),
)
