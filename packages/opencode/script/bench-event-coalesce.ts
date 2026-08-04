// Event 流式写入节流基准：模拟 10000 字流式输出（逐 delta 全快照），对比
// 节流关闭（旧行为）与节流开启（服务端统一持久化边界合并）的落盘差异。
//
// 用法（仓库根目录）：
//   bun script/bench-event-coalesce.ts
//
// 输出 JSON：event 新增行数、message.part.updated.1 数量、持久化字节、数据库/WAL
// 增长、首 Token 时间、UI 更新次数、最终正文与重启重放正文的 SHA-256。

import { Effect, Layer, Schema } from "effect"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { Database as BunDatabase } from "bun:sqlite"
import { EventV2 } from "@opencode-ai/core/event"
import { Database } from "@opencode-ai/core/database/database"
import { SessionV1 } from "@opencode-ai/schema/session-v1"
import { SessionID } from "@opencode-ai/schema/session-id"

const TOTAL_CHARS = 10000
const DELTA_CHARS = 10
const ARRIVAL_MS = 5
const COALESCE_MS = 300

const CORPUS = "录井地质审核要求对气测值、钻时与岩性描述进行交叉验证，并核对测井解释与录井剖面的一致性。".repeat(200)

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")

const buildLayer = (dbFile: string, coalesce: { enabled: boolean; intervalMs: number }) =>
  EventV2.layerWith({ coalesce }).pipe(Layer.provideMerge(Database.layerFromPath(dbFile)))

type StreamOutcome = {
  readonly sessionID: SessionID
  readonly finalText: string
  readonly uiUpdates: number
  readonly firstTokenMs: number
  readonly streamMs: number
}

const runStream = (enabled: boolean) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "event-bench-"))
  const dbFile = path.join(dir, "bench.db")
  const outcome = {} as { current?: StreamOutcome }
  const program = Effect.gen(function* () {
    const events = yield* EventV2.Service
    const sessionID = SessionID.create()
    const partID = SessionV1.PartID.ascending()
    const messageID = SessionV1.MessageID.ascending()
    let uiUpdates = 0
    let firstNotifyAt: number | undefined
    yield* events.listen((event) =>
      Effect.sync(() => {
        if (event.type !== "message.part.updated") return
        uiUpdates += 1
        firstNotifyAt ??= Date.now()
      }),
    )
    const started = Date.now()
    let text = ""
    const publishes = Math.ceil(TOTAL_CHARS / DELTA_CHARS)
    for (let i = 1; i <= publishes; i += 1) {
      text = CORPUS.slice(0, Math.min(i * DELTA_CHARS, TOTAL_CHARS))
      yield* events.publish(SessionV1.Event.PartUpdated, {
        sessionID,
        part: { type: "text", id: partID, sessionID, messageID, text },
        time: Date.now(),
      })
      if (i < publishes) yield* Effect.sleep(`${ARRIVAL_MS} millis`)
    }
    const streamEndAt = Date.now()
    // 流结束强制保存最终完整快照
    yield* events.flush()
    outcome.current = {
      sessionID,
      finalText: text,
      uiUpdates,
      firstTokenMs: (firstNotifyAt ?? Date.now()) - started,
      streamMs: streamEndAt - started,
    }
  })
  return Effect.runPromise(program.pipe(Effect.scoped, Effect.provide(buildLayer(dbFile, { enabled, intervalMs: COALESCE_MS })))).then(
    () => {
      const stats = {
        dbBytes: statSync(dbFile).size,
        walBytes: existsSync(`${dbFile}-wal`) ? statSync(`${dbFile}-wal`).size : 0,
      }
      const ro = new BunDatabase(dbFile, { readonly: true })
      const rows = ro.prepare("SELECT COUNT(*) AS c, COALESCE(SUM(LENGTH(data)), 0) AS b FROM event").get() as {
        c: number
        b: number
      }
      const partRows = ro.prepare("SELECT COUNT(*) AS c FROM event WHERE type LIKE 'message.part.updated.%'").get() as {
        c: number
      }
      ro.close()
      const result = {
        dir,
        dbFile,
        ...outcome.current!,
        ...stats,
        eventRows: rows.c,
        eventBytes: rows.b,
        partUpdatedRows: partRows.c,
        finalSha256: sha256(outcome.current!.finalText),
      }
      return result
    },
  )
}

const replayText = (dbFile: string, sessionID: SessionID) => {
  const program = Effect.gen(function* () {
    const { db } = yield* Database.Service
    const read = yield* EventV2.readAggregate(db, {
      aggregateID: sessionID,
      limit: 100000,
      manifest: {
        definitions: new Map([[EventV2.versionedType("message.part.updated", 1), SessionV1.Event.PartUpdated]]),
        schema: Schema.Unknown,
      },
    })
    const events = read.events as Array<{ readonly type: string; readonly data: unknown }>
    const last = events.filter((event) => event.type === "message.part.updated").at(-1)
    const data = (last?.data ?? {}) as Record<string, unknown>
    const part = (data.part ?? {}) as Record<string, unknown>
    return typeof part.text === "string" ? part.text : ""
  })
  return Effect.runPromise(program.pipe(Effect.scoped, Effect.provide(buildLayer(dbFile, { enabled: false, intervalMs: COALESCE_MS }))))
}

const bench = async () => {
  const off = await runStream(false)
  const offReplay = await replayText(off.dbFile, off.sessionID)
  const on = await runStream(true)
  const onReplay = await replayText(on.dbFile, on.sessionID)

  const pct = (before: number, after: number) => ((before === 0 ? 0 : (before - after) / before) * 100).toFixed(1)
  // 报告只保留 hash 与指标，不落 10000 字全文与临时路径
  const summarize = (entry: typeof off, replaySha256: string) => {
    const { finalText, dir, dbFile, ...metrics } = entry
    return { ...metrics, replaySha256 }
  }
  const report = {
    corpusChars: TOTAL_CHARS,
    deltaChars: DELTA_CHARS,
    publishes: Math.ceil(TOTAL_CHARS / DELTA_CHARS),
    arrivalMs: ARRIVAL_MS,
    coalesceWindowMs: COALESCE_MS,
    before: summarize(off, sha256(offReplay)),
    after: summarize(on, sha256(onReplay)),
    reduction: {
      eventRowsPct: pct(off.eventRows, on.eventRows),
      eventBytesPct: pct(off.eventBytes, on.eventBytes),
      partUpdatedRowsPct: pct(off.partUpdatedRows, on.partUpdatedRows),
    },
    consistency: {
      finalTextMatch: off.finalSha256 === on.finalSha256,
      replayMatchesFinal: offReplay === off.finalText && onReplay === on.finalText,
    },
  }
  console.log(JSON.stringify(report, undefined, 2))
  // Windows 下 WAL 句柄释放可能有延迟，清理失败不影响基准结果
  for (const dir of [off.dir, on.dir]) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
    } catch {
      console.error(`未能清理临时目录：${dir}`)
    }
  }
}

await bench()
