export type Availability<T> =
  | { readonly status: "AVAILABLE"; readonly value: T }
  | { readonly status: "UNAVAILABLE"; readonly reason: string }

export type LatencySummary = {
  readonly samples: number
  readonly p50Ms: number
  readonly p95Ms: number
  readonly maxMs: number
}

export type TurnMeasurement = {
  readonly turn: number
  readonly appendMs: number
  readonly firstTokenMs: number
  readonly completionMs: number
}

export type Checkpoint = {
  readonly turn: number
  readonly processID: number
  readonly memory: {
    readonly rssBytes: number
    readonly heapUsedBytes: number
    readonly heapTotalBytes: number
    readonly externalBytes: number
  }
  readonly database: {
    readonly databaseBytes: number
    readonly walBytes: number
    readonly shmBytes: number
    readonly totalBytes: number
    readonly inputCount: number
    readonly messageCount: number
    readonly eventCount: number
  }
  readonly state: {
    readonly global: Availability<number>
    readonly workspace: Availability<number>
    readonly draft: Availability<{ readonly count: number; readonly bytes: number }>
  }
  readonly rendererMemory: Availability<number>
  readonly electronMainMemory: Availability<number>
  readonly sessionOpenMs: number
  readonly visibleMessageCount: number
  readonly corruptionCount: number
  readonly duplicateInputCount: number
  readonly incompleteAssistantCount: number
  readonly latency: {
    readonly append: LatencySummary
    readonly firstToken: LatencySummary
    readonly completion: LatencySummary
  }
}

export type WorkerResult = {
  readonly phase: { readonly startTurn: number; readonly endTurn: number }
  readonly sessionID: string
  readonly reopened: boolean
  readonly initialVisibleMessageCount: number
  readonly checkpoints: readonly Checkpoint[]
  readonly turns: readonly TurnMeasurement[]
}

export type LongrunReport = {
  readonly version: 1
  readonly harness: "session-v2-deterministic-stream"
  readonly commit: string
  readonly generatedAt: string
  readonly platform: NodeJS.Platform
  readonly arch: string
  readonly bun: string
  readonly environment: {
    readonly osRelease: string
    readonly cpu: string
    readonly logicalCpuCount: number
    readonly totalMemoryBytes: number
  }
  readonly seed: number
  readonly requestedTurns: number
  readonly checkpoints: readonly Checkpoint[]
  readonly turnMeasurements: readonly TurnMeasurement[]
  readonly restart: {
    readonly requestedAt: number | null
    readonly processBoundary: boolean
    readonly processIDs: readonly number[]
    readonly reopened: boolean
    readonly expectedMessagesBeforeRestart: number
    readonly messagesFoundAfterRestart: number
    readonly beforeExit: Checkpoint | null
    readonly afterReopen: Checkpoint | null
  }
  readonly integrity: {
    readonly expectedMessages: number
    readonly actualMessages: number
    readonly expectedInputs: number
    readonly actualInputs: number
    readonly corruptionCount: number
    readonly duplicateInputCount: number
    readonly incompleteAssistantCount: number
    readonly lostInputCount: number
  }
  readonly metrics: {
    readonly rendererMemory: Availability<number>
    readonly electronMainMemory: Availability<number>
    readonly globalState: Availability<number>
    readonly workspaceState: Availability<number>
    readonly draftState: Availability<{ readonly count: number; readonly bytes: number }>
  }
  readonly scenarioSupport: {
    readonly automated: readonly ["A_TEXT_CHAT", "E_PROCESS_RESTART_RECOVERY"]
    readonly reserved: readonly ["B_LARGE_MESSAGES", "C_ATTACHMENTS", "D_SKILL_REVIEW_EXPORT"]
  }
  readonly result: "PASS" | "FAIL"
}

export function latencySummary(values: readonly number[]): LatencySummary {
  if (values.length === 0) return { samples: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 }
  const sorted = values.toSorted((a, b) => a - b)
  return {
    samples: values.length,
    p50Ms: round(sorted[Math.ceil(sorted.length * 0.5) - 1]),
    p95Ms: round(sorted[Math.ceil(sorted.length * 0.95) - 1]),
    maxMs: round(sorted.at(-1)!),
  }
}

export function expectedPrompt(turn: number, seed: number) {
  return `turn:${String(turn).padStart(4, "0")}:seed:${seed}`
}

export function expectedReply(turn: number, seed: number) {
  return `reply:${String(turn).padStart(4, "0")}:seed:${seed}`
}

export function integrityPassed(input: LongrunReport["integrity"]) {
  return (
    input.actualMessages === input.expectedMessages &&
    input.actualInputs === input.expectedInputs &&
    input.corruptionCount === 0 &&
    input.duplicateInputCount === 0 &&
    input.incompleteAssistantCount === 0 &&
    input.lostInputCount === 0
  )
}

function round(value: number) {
  return Math.round(value * 1_000) / 1_000
}
