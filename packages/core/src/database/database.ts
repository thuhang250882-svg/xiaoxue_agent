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
    yield* compactIfRequested(db)

    return { db }
  }).pipe(Effect.orDie),
)

// 数据迁移删除大字段后 SQLite 文件不会自动缩小。迁移在事务内写入压缩标记，
// 这里在事务外执行一次性 VACUUM 并记录前后体积；失败时保留标记下次重试，
// 不阻塞应用启动。VACUUM 是原子重建，失败不会损坏原有数据。
function compactIfRequested(db: DatabaseShape) {
  return Effect.gen(function* () {
    yield* db.run(`CREATE TABLE IF NOT EXISTS compaction (id TEXT PRIMARY KEY, requested_at INTEGER NOT NULL)`)
    const pending = yield* db.get<{ id: string }>(
      `SELECT id FROM compaction WHERE id = 'strip-oversized-attachments'`,
    )
    if (!pending) return
    const before = yield* db.get<{ bytes: number }>(
      `SELECT (SELECT page_count FROM pragma_page_count()) * (SELECT page_size FROM pragma_page_size()) AS bytes`,
    )
    yield* Effect.logInfo("database compaction started", { bytes: before?.bytes ?? 0 })
    yield* db.run(`PRAGMA wal_checkpoint(TRUNCATE)`)
    yield* db.run(`VACUUM`)
    const after = yield* db.get<{ bytes: number }>(
      `SELECT (SELECT page_count FROM pragma_page_count()) * (SELECT page_size FROM pragma_page_size()) AS bytes`,
    )
    yield* db.run(`DELETE FROM compaction WHERE id = 'strip-oversized-attachments'`)
    yield* Effect.logInfo("database compaction completed", {
      before: before?.bytes ?? 0,
      after: after?.bytes ?? 0,
    })
  }).pipe(
    Effect.catch((error) => Effect.logWarning("database compaction failed; will retry on next startup", { error })),
  )
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
