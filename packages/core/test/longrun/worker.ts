import { stat } from "node:fs/promises"
import { LLMClient, LLMEvent, Model, type LLMClientShape } from "@opencode-ai/llm"
import { route } from "@opencode-ai/llm/protocols/openai-chat"
import { AbsolutePath, NonNegativeInt, PositiveInt } from "@opencode-ai/core/schema"
import { AgentV2 } from "@opencode-ai/core/agent"
import { ApplicationTools } from "@opencode-ai/core/tool/application-tools"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Config } from "@opencode-ai/core/config"
import { ConfigCompaction } from "@opencode-ai/core/config/compaction"
import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { LayerNodePlatform } from "@opencode-ai/core/effect/app-node-platform"
import { Location } from "@opencode-ai/core/location"
import { PermissionV2 } from "@opencode-ai/core/permission"
import { ProjectV2 } from "@opencode-ai/core/project"
import { QuestionV2 } from "@opencode-ai/core/question"
import { ReferenceGuidance } from "@opencode-ai/core/reference/guidance"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionExecution } from "@opencode-ai/core/session/execution"
import { SessionMessage } from "@opencode-ai/core/session/message"
import { SessionInputTable, SessionMessageTable } from "@opencode-ai/core/session/sql"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionRunCoordinator } from "@opencode-ai/core/session/run-coordinator"
import { SessionRunner } from "@opencode-ai/core/session/runner"
import { node } from "@opencode-ai/core/session/runner/llm"
import { SessionRunnerModel } from "@opencode-ai/core/session/runner/model"
import { SessionStore } from "@opencode-ai/core/session/store"
import { SkillGuidance } from "@opencode-ai/core/skill/guidance"
import { Snapshot } from "@opencode-ai/core/snapshot"
import { SystemContext } from "@opencode-ai/core/system-context"
import { SystemContextRegistry } from "@opencode-ai/core/system-context/registry"
import { ToolRegistry } from "@opencode-ai/core/tool/registry"
import { count, eq } from "drizzle-orm"
import { Effect, Layer, Schema, Stream } from "effect"
import { expectedPrompt, expectedReply, latencySummary, type Checkpoint, type TurnMeasurement } from "./types"

const input = Schema.decodeUnknownSync(
  Schema.Struct({
    databasePath: Schema.String,
    workspacePath: Schema.String,
    outputPath: Schema.String,
    sessionID: Schema.String,
    seed: Schema.Number,
    startTurn: NonNegativeInt,
    endTurn: PositiveInt,
    checkpoints: Schema.Array(NonNegativeInt),
  }),
)(JSON.parse(process.argv[2] ?? "{}"))

const timing = { resumeStarted: 0, firstTokenMs: 0, providerTurn: input.startTurn }
const model = Model.make({
  id: "longrun-deterministic",
  provider: "longrun",
  route: route.with({ limits: { context: 100_000_000, output: 4_096 } }),
})
const stream: LLMClientShape["stream"] = (_request) => {
  const turn = ++timing.providerTurn
  const id = `longrun-text-${turn}`
  const first = Stream.fromEffect(
    Effect.sync(() => {
      timing.firstTokenMs = performance.now() - timing.resumeStarted
      return LLMEvent.textDelta({ id, text: expectedReply(turn, input.seed) })
    }),
  )
  return Stream.fromIterable([LLMEvent.stepStart({ index: 0 }), LLMEvent.textStart({ id })]).pipe(
    Stream.concat(first),
    Stream.concat(
      Stream.fromIterable([
        LLMEvent.textEnd({ id }),
        LLMEvent.stepFinish({ index: 0, reason: "stop" }),
        LLMEvent.finish({ reason: "stop" }),
      ]),
    ),
  )
}
const client = Layer.succeed(
  LLMClient.Service,
  LLMClient.Service.of({
    prepare: () => Effect.die("unused"),
    stream,
    generate: () => Effect.die("unused"),
  }),
)
const models = SessionRunnerModel.layerWith(() => Effect.succeed(model))
const permission = Layer.succeed(
  PermissionV2.Service,
  PermissionV2.Service.of({
    assert: () => Effect.die("unused"),
    ask: () => Effect.die("unused"),
    reply: () => Effect.die("unused"),
    get: () => Effect.die("unused"),
    forSession: () => Effect.die("unused"),
    list: () => Effect.die("unused"),
  }),
)
const projects = Layer.succeed(
  ProjectV2.Service,
  ProjectV2.Service.of({
    resolve: (directory) => Effect.succeed({ id: ProjectV2.ID.global, directory }),
    directories: () => Effect.succeed([]),
    commit: () => Effect.void,
  }),
)
const config = Layer.succeed(
  Config.Service,
  Config.Service.of({
    entries: () =>
      Effect.succeed([
        new Config.Document({
          type: "document",
          info: new Config.Info({
            compaction: new ConfigCompaction.Info({
              buffer: 1_000_000,
              keep: new ConfigCompaction.Keep({ tokens: 100_000 }),
            }),
          }),
        }),
      ]),
  }),
)
const systemContextKey = SystemContext.Key.make("longrun/harness")
const systemContext = Layer.effectDiscard(
  SystemContextRegistry.Service.pipe(
    Effect.flatMap((registry) =>
      registry.register({
        key: systemContextKey,
        load: Effect.succeed(
          SystemContext.make({
            key: systemContextKey,
            codec: Schema.toCodecJson(Schema.String),
            load: Effect.succeed(`deterministic-longrun-seed:${input.seed}`),
            baseline: String,
            update: (_previous, current) => current,
            removed: () => "Long-run harness context removed",
          }),
        ),
      }),
    ),
  ),
).pipe(Layer.provideMerge(AppNodeBuilder.build(SystemContextRegistry.node)))
const skillGuidance = Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })
const referenceGuidance = Layer.mock(ReferenceGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })
const database = Database.layerFromPath(input.databasePath)
const location = Location.boundNode({ directory: AbsolutePath.make(input.workspacePath) })
const runnerLayer = AppNodeBuilder.build(node, [
  [Database.node, database],
  [Snapshot.node, Snapshot.noopLayer],
  [LayerNodePlatform.llmClient, client],
  [SessionRunnerModel.node, models],
  [SystemContextRegistry.node, systemContext],
  [Location.node, location],
  [SkillGuidance.node, skillGuidance],
  [ReferenceGuidance.node, referenceGuidance],
  [PermissionV2.node, permission],
  [Config.node, config],
  [ProjectV2.node, projects],
])
const execution = Layer.effect(
  SessionExecution.Service,
  Effect.gen(function* () {
    const runner = yield* SessionRunner.Service
    const coordinator = yield* SessionRunCoordinator.make<SessionV2.ID, SessionRunner.RunError>({
      drain: (sessionID, force) => runner.run({ sessionID, force }),
    })
    return SessionExecution.Service.of({
      active: coordinator.active,
      resume: coordinator.run,
      wake: coordinator.wake,
      interrupt: coordinator.interrupt,
    })
  }),
).pipe(Layer.provide(runnerLayer))
const layer = AppNodeBuilder.build(
  LayerNode.group([
    Database.node,
    EventV2.node,
    QuestionV2.node,
    SessionProjector.node,
    SessionStore.node,
    ApplicationTools.node,
    AgentV2.node,
    ToolRegistry.node,
    ToolRegistry.toolsNode,
    SessionRunnerModel.node,
    SystemContextRegistry.node,
    SkillGuidance.node,
    ReferenceGuidance.node,
    Config.node,
    Snapshot.node,
    node,
    SessionExecution.node,
    SessionV2.node,
  ]),
  [
    [Database.node, database],
    [LayerNodePlatform.llmClient, client],
    [PermissionV2.node, permission],
    [ProjectV2.node, projects],
    [SessionRunnerModel.node, models],
    [SystemContextRegistry.node, systemContext],
    [Location.node, location],
    [SkillGuidance.node, skillGuidance],
    [ReferenceGuidance.node, referenceGuidance],
    [Snapshot.node, Snapshot.noopLayer],
    [SessionExecution.node, execution],
    [Config.node, config],
  ],
)

const sessionID = SessionV2.ID.make(input.sessionID)
const turns: TurnMeasurement[] = []
const checkpoints: Checkpoint[] = []
const program = Effect.gen(function* () {
  const session = yield* SessionV2.Service
  const reopened = input.startTurn > 0
  if (reopened) yield* session.get(sessionID)
  if (!reopened) {
    yield* session.create({
      id: sessionID,
      location: Location.Ref.make({ directory: AbsolutePath.make(input.workspacePath) }),
    })
  }
  const initialVisibleMessageCount = (yield* session.messages({ sessionID })).length
  if (initialVisibleMessageCount !== input.startTurn * 2)
    return yield* Effect.die(
      `Restart mismatch: expected ${input.startTurn * 2} messages, found ${initialVisibleMessageCount}`,
    )
  if (input.checkpoints.includes(input.startTurn)) checkpoints.push(yield* checkpoint(session, input.startTurn, turns))

  for (const turn of Array.from(
    { length: input.endTurn - input.startTurn },
    (_, index) => input.startTurn + index + 1,
  )) {
    const appendStarted = performance.now()
    yield* session.prompt({
      id: SessionMessage.ID.make(`msg_longrun_${input.seed}_${String(turn).padStart(4, "0")}`),
      sessionID,
      prompt: { text: expectedPrompt(turn, input.seed), files: [], agents: [] },
      resume: false,
    })
    const appendMs = performance.now() - appendStarted
    timing.firstTokenMs = 0
    timing.resumeStarted = performance.now()
    yield* session.resume(sessionID)
    const completionMs = performance.now() - timing.resumeStarted
    if (timing.firstTokenMs <= 0) return yield* Effect.die(`Turn ${turn} did not emit a first token`)
    turns.push({ turn, appendMs, firstTokenMs: timing.firstTokenMs, completionMs })
    if (input.checkpoints.includes(turn)) checkpoints.push(yield* checkpoint(session, turn, turns))
  }

  return {
    phase: { startTurn: input.startTurn, endTurn: input.endTurn },
    sessionID,
    reopened,
    initialVisibleMessageCount,
    checkpoints,
    turns,
  }
})

await Effect.runPromise(program.pipe(Effect.scoped, Effect.provide(layer))).then((result) =>
  Bun.write(input.outputPath, JSON.stringify(result, null, 2)),
)

function checkpoint(session: SessionV2.Interface, turn: number, measurements: readonly TurnMeasurement[]) {
  return Effect.gen(function* () {
    const openedAt = performance.now()
    yield* session.get(sessionID)
    const messages = yield* session.messages({ sessionID, order: "asc" })
    const sessionOpenMs = performance.now() - openedAt
    const corruptions = messages.flatMap((message, index) => {
      const expectedTurn = Math.floor(index / 2) + 1
      if (index % 2 === 0)
        return message.type === "user" && message.text === expectedPrompt(expectedTurn, input.seed) ? [] : [message.id]
      if (message.type !== "assistant") return [message.id]
      const text = message.content.find((content) => content.type === "text")
      return text?.text === expectedReply(expectedTurn, input.seed) ? [] : [message.id]
    })
    const incompleteAssistantCount = messages.filter(
      (message) => message.type === "assistant" && (!message.time.completed || !message.finish),
    ).length
    const { db } = yield* Database.Service
    const inputs = yield* db.select({ id: SessionInputTable.id }).from(SessionInputTable).all().pipe(Effect.orDie)
    const inputCount = inputs.length
    const messageCount = yield* db
      .select({ value: count() })
      .from(SessionMessageTable)
      .where(eq(SessionMessageTable.session_id, sessionID))
      .get()
      .pipe(
        Effect.orDie,
        Effect.map((row) => row?.value ?? 0),
      )
    const eventCount = yield* db
      .select({ value: count() })
      .from(EventTable)
      .where(eq(EventTable.aggregate_id, sessionID))
      .get()
      .pipe(
        Effect.orDie,
        Effect.map((row) => row?.value ?? 0),
      )
    const databaseBytes = yield* Effect.promise(() => size(input.databasePath))
    const walBytes = yield* Effect.promise(() => size(`${input.databasePath}-wal`))
    const shmBytes = yield* Effect.promise(() => size(`${input.databasePath}-shm`))
    const memory = process.memoryUsage()
    const values = measurements.filter((measurement) => measurement.turn <= turn)
    const unavailable = {
      status: "UNAVAILABLE" as const,
      reason: "Core SessionV2 harness does not create or read Electron renderer state files.",
    }

    return {
      turn,
      processID: process.pid,
      memory: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
        externalBytes: memory.external,
      },
      database: {
        databaseBytes,
        walBytes,
        shmBytes,
        totalBytes: databaseBytes + walBytes + shmBytes,
        inputCount,
        messageCount,
        eventCount,
      },
      state: { global: unavailable, workspace: unavailable, draft: unavailable },
      rendererMemory: unavailable,
      electronMainMemory: unavailable,
      sessionOpenMs,
      visibleMessageCount: messages.length,
      corruptionCount: corruptions.length,
      duplicateInputCount: inputCount - new Set(inputs.map((row) => row.id)).size,
      incompleteAssistantCount,
      latency: {
        append: latencySummary(values.map((value) => value.appendMs)),
        firstToken: latencySummary(values.map((value) => value.firstTokenMs)),
        completion: latencySummary(values.map((value) => value.completionMs)),
      },
    } satisfies Checkpoint
  })
}

function size(file: string) {
  return stat(file).then(
    (info) => info.size,
    () => 0,
  )
}
