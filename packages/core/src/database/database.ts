export * as Database from "./database"

import { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"
import { layer as sqliteLayer } from "#sqlite"
import { Context, Effect, Layer } from "effect"
import { Global } from "../global"
import { Flag } from "../flag/flag"
import { isAbsolute, join } from "path"
import { DatabaseMigration } from "./migration"
import { InstallationChannel } from "../installation/version"
import { makeGlobalNode } from "../effect/app-node"

const makeDatabase = EffectDrizzleSqlite.makeWithDefaults()
type DatabaseShape = Effect.Success<typeof makeDatabase>

export interface Interface {
  db: DatabaseShape
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/storage/Database") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = yield* makeDatabase

    yield* db.run("PRAGMA journal_mode = WAL")
    yield* db.run("PRAGMA synchronous = NORMAL")
    yield* db.run("PRAGMA busy_timeout = 5000")
    yield* db.run("PRAGMA cache_size = -64000")
    yield* db.run("PRAGMA foreign_keys = ON")
    yield* db.run("PRAGMA wal_checkpoint(PASSIVE)")
    yield* DatabaseMigration.apply(db)
    yield* reportPendingCompaction(db)

    return { db }
  }).pipe(Effect.orDie),
)

// 启动阶段只报告待维护状态。VACUUM 可能长时间阻塞大型数据库，并且需要接近
// 数据库体积的额外磁盘空间；它只能在应用停止并完成可验证备份后由维护入口执行。
function reportPendingCompaction(db: DatabaseShape) {
  return Effect.gen(function* () {
    yield* db.run(`CREATE TABLE IF NOT EXISTS compaction (id TEXT PRIMARY KEY, requested_at INTEGER NOT NULL)`)
    const pending = yield* db.get<{ id: string }>(`SELECT id FROM compaction WHERE id = 'strip-oversized-attachments'`)
    if (!pending) return
    const size = yield* db.get<{ bytes: number }>(
      `SELECT (SELECT page_count FROM pragma_page_count()) * (SELECT page_size FROM pragma_page_size()) AS bytes`,
    )
    yield* Effect.logWarning("database has reclaimable attachment pages; run controlled maintenance while stopped", {
      bytes: size?.bytes ?? 0,
    })
  }).pipe(Effect.catch((error) => Effect.logWarning("database maintenance status check failed", { error })))
}

export function layerFromPath(filename: string) {
  return layer.pipe(Layer.provide(sqliteLayer({ filename })))
}

export function path() {
  if (Flag.OPENCODE_DB) {
    if (Flag.OPENCODE_DB === ":memory:" || isAbsolute(Flag.OPENCODE_DB)) return Flag.OPENCODE_DB
    return join(Global.Path.data, Flag.OPENCODE_DB)
  }
  if (
    ["latest", "beta", "prod"].includes(InstallationChannel) ||
    process.env.OPENCODE_DISABLE_CHANNEL_DB === "1" ||
    process.env.OPENCODE_DISABLE_CHANNEL_DB === "true"
  )
    return join(Global.Path.data, "opencode.db")
  return join(Global.Path.data, `opencode-${InstallationChannel.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`)
}

export const node = makeGlobalNode({ service: Service, layer: layerFromPath(path()), deps: [] })
