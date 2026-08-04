import { describe, expect } from "bun:test"
import { Effect, Schema } from "effect"
import { EventV2 } from "@opencode-ai/core/event"
import { SessionV1 } from "@opencode-ai/schema/session-v1"
import { SessionID } from "@opencode-ai/schema/session-id"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventTable } from "@opencode-ai/core/event/sql"
import { eq } from "drizzle-orm"
import { testEffect } from "./lib/effect"

const coalesced = (coalesce?: { readonly enabled?: boolean; readonly intervalMs?: number }) =>
  LayerNode.compile(
    LayerNode.group([
      LayerNode.make({
        service: EventV2.Service,
        layer: EventV2.layerWith({ coalesce }),
        deps: [Database.node],
      }),
      Database.node,
    ]),
  )

// Long window: persistence is driven by explicit flush or non-coalescible events, not timers
const it = testEffect(coalesced({ enabled: true, intervalMs: 60_000 }))
const itDisabled = testEffect(coalesced({ enabled: false }))
const itTimer = testEffect(coalesced({ enabled: true, intervalMs: 60 }))

const textPart = (sessionID: SessionID, text: string) => ({
  type: "text" as const,
  id: SessionV1.PartID.ascending(),
  sessionID,
  messageID: SessionV1.MessageID.ascending(),
  text,
})

const partRows = (sessionID: SessionID) =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    return yield* db
      .select()
      .from(EventTable)
      .where(eq(EventTable.aggregate_id, sessionID))
      .all()
      .pipe(Effect.orDie)
  })

describe("EventV2 coalescing", () => {
  it.effect("merges streamed text snapshots into the latest one per part", () =>
    Effect.gen(function* () {
      const events = yield* EventV2.Service
      const sessionID = SessionID.create()
      const partID = SessionV1.PartID.ascending()
      const messageID = SessionV1.MessageID.ascending()
      for (const text of ["地", "地质", "地质审", "地质审核完成"]) {
        yield* events.publish(SessionV1.Event.PartUpdated, {
          sessionID,
          part: { type: "text", id: partID, sessionID, messageID, text },
          time: 1,
        })
      }

      expect(yield* partRows(sessionID)).toHaveLength(0)

      yield* events.flush(sessionID)
      const rows = yield* partRows(sessionID)
      expect(rows).toHaveLength(1)
      expect((rows[0]?.data as { part?: { text?: string } }).part?.text).toBe("地质审核完成")
    }),
  )

  it.effect("keeps realtime notifications for every streamed snapshot", () =>
    Effect.gen(function* () {
      const events = yield* EventV2.Service
      const sessionID = SessionID.create()
      const notified = new Array<string>()
      const unsubscribe = yield* events.listen((event) =>
        Effect.sync(() => {
          if (event.type === "message.part.updated") {
            notified.push((event.data as { part: { text: string } }).part.text)
          }
        }),
      )
      const partID = SessionV1.PartID.ascending()
      const messageID = SessionV1.MessageID.ascending()
      for (const text of ["一", "一二", "一二三"]) {
        yield* events.publish(SessionV1.Event.PartUpdated, {
          sessionID,
          part: { type: "text", id: partID, sessionID, messageID, text },
          time: 1,
        })
      }

      expect(notified).toEqual(["一", "一二", "一二三"])
      yield* unsubscribe
      yield* events.flush(sessionID)
    }),
  )

  it.effect("flushes pending snapshots before a non-coalescible event keeps seq order", () =>
    Effect.gen(function* () {
      const events = yield* EventV2.Service
      const sessionID = SessionID.create()
      const partID = SessionV1.PartID.ascending()
      const messageID = SessionV1.MessageID.ascending()
      yield* events.publish(SessionV1.Event.PartUpdated, {
        sessionID,
        part: { type: "text", id: partID, sessionID, messageID, text: "第一段" },
        time: 1,
      })
      yield* events.publish(SessionV1.Event.PartUpdated, {
        sessionID,
        part: { type: "text", id: partID, sessionID, messageID, text: "第一段续" },
        time: 1,
      })
      yield* events.publish(SessionV1.Event.PartUpdated, {
        sessionID,
        part: { type: "step-start", id: SessionV1.PartID.ascending(), sessionID, messageID },
        time: 1,
      })

      const rows = yield* partRows(sessionID)
      expect(rows.map((row) => row.seq)).toEqual([0, 1])
      expect((rows[0]?.data as { part?: { text?: string } }).part?.text).toBe("第一段续")
      expect((rows[1]?.data as { part?: { type?: string } }).part?.type).toBe("step-start")
    }),
  )

  it.effect("keeps the latest snapshot per part across interleaved parts", () =>
    Effect.gen(function* () {
      const events = yield* EventV2.Service
      const sessionID = SessionID.create()
      const messageID = SessionV1.MessageID.ascending()
      const first = SessionV1.PartID.ascending()
      const second = SessionV1.PartID.ascending()
      const publish = (id: typeof first, text: string) =>
        events.publish(SessionV1.Event.PartUpdated, {
          sessionID,
          part: { type: "text", id, sessionID, messageID, text },
          time: 1,
        })
      yield* publish(first, "甲")
      yield* publish(second, "乙")
      yield* publish(first, "甲甲")
      yield* publish(second, "乙乙")
      yield* publish(first, "甲甲甲")

      yield* events.flush()
      const rows = yield* partRows(sessionID)
      expect(rows).toHaveLength(2)
      const texts = rows.map((row) => (row.data as { part?: { text?: string } }).part?.text)
      expect(texts).toEqual(["甲甲甲", "乙乙"])
    }),
  )

  it.effect("coalesces reasoning snapshots the same way", () =>
    Effect.gen(function* () {
      const events = yield* EventV2.Service
      const sessionID = SessionID.create()
      const partID = SessionV1.PartID.ascending()
      const messageID = SessionV1.MessageID.ascending()
      for (const text of ["推理", "推理中"]) {
        yield* events.publish(SessionV1.Event.PartUpdated, {
          sessionID,
          part: { type: "reasoning", id: partID, sessionID, messageID, text, time: { start: 0 } },
          time: 1,
        })
      }

      expect(yield* partRows(sessionID)).toHaveLength(0)
      yield* events.flush(sessionID)
      const rows = yield* partRows(sessionID)
      expect(rows).toHaveLength(1)
      expect((rows[0]?.data as { part?: { text?: string } }).part?.text).toBe("推理中")
    }),
  )

  itDisabled.effect("persists every snapshot immediately when coalescing is disabled", () =>
    Effect.gen(function* () {
      const events = yield* EventV2.Service
      const sessionID = SessionID.create()
      const partID = SessionV1.PartID.ascending()
      const messageID = SessionV1.MessageID.ascending()
      for (const text of ["一", "一二", "一二三"]) {
        yield* events.publish(SessionV1.Event.PartUpdated, {
          sessionID,
          part: { type: "text", id: partID, sessionID, messageID, text },
          time: 1,
        })
      }

      expect(yield* partRows(sessionID)).toHaveLength(3)
    }),
  )

  itTimer.live("persists pending snapshots when the window timer fires", () =>
    Effect.gen(function* () {
      const events = yield* EventV2.Service
      const sessionID = SessionID.create()
      yield* events.publish(SessionV1.Event.PartUpdated, {
        sessionID,
        part: textPart(sessionID, "窗口落盘"),
        time: 1,
      })
      yield* Effect.sleep(400)

      const rows = yield* partRows(sessionID)
      expect(rows).toHaveLength(1)
      expect((rows[0]?.data as { part?: { text?: string } }).part?.text).toBe("窗口落盘")
    }),
  )

  it.effect("skips tombstone rows when reading an aggregate", () =>
    Effect.gen(function* () {
      const events = yield* EventV2.Service
      const sessionID = SessionID.create()
      yield* events.publish(SessionV1.Event.PartUpdated, {
        sessionID,
        part: textPart(sessionID, "待压缩"),
        time: 1,
      })
      yield* events.flush(sessionID)
      const rows = yield* partRows(sessionID)
      expect(rows).toHaveLength(1)

      const { db } = yield* Database.Service
      yield* db
        .update(EventTable)
        .set({ data: { compacted: true } })
        .where(eq(EventTable.id, rows[0]!.id))
        .run()
        .pipe(Effect.orDie)

      const read = yield* EventV2.readAggregate(db, {
        aggregateID: sessionID,
        limit: 10,
        manifest: {
          definitions: new Map([
            [EventV2.versionedType("message.part.updated", 1), SessionV1.Event.PartUpdated],
          ]),
          schema: Schema.Unknown,
        },
      })
      expect(read.events).toHaveLength(0)
    }),
  )
})
