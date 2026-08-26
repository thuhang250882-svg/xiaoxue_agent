import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { cpus, release, tmpdir, totalmem } from "node:os"
import path from "node:path"
import { parseArgs } from "node:util"
import { integrityPassed, latencySummary, type Checkpoint, type LongrunReport, type WorkerResult } from "./types"

const args = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    turns: { type: "string" },
    seed: { type: "string", default: "20260826" },
    "restart-at": { type: "string" },
    output: { type: "string" },
  },
  strict: true,
})
const requestedTurns = positiveInteger(args.values.turns, "--turns")
const seed = positiveInteger(args.values.seed, "--seed")
const restartAt =
  args.values["restart-at"] === undefined ? undefined : positiveInteger(args.values["restart-at"], "--restart-at")
if (restartAt !== undefined && restartAt >= requestedTurns) throw new Error("--restart-at must be lower than --turns")
if (!args.values.output) throw new Error("--output is required")

const outputPath = path.resolve(args.values.output)
const workdir = await mkdtemp(path.join(tmpdir(), "opencode-chat-longrun-"))
const databasePath = path.join(workdir, "longrun.db")
const workspacePath = path.join(workdir, "workspace")
const xdgRoot = path.join(workdir, "xdg")
const sessionID = `ses_longrun_${seed}_${requestedTurns}`
const checkpointTurns = [...new Set([0, 100, 250, 500, 750, 1_000, requestedTurns, ...(restartAt ? [restartAt] : [])])]
  .filter((turn) => turn <= requestedTurns)
  .toSorted((a, b) => a - b)
await Promise.all([mkdir(workspacePath, { recursive: true }), mkdir(path.dirname(outputPath), { recursive: true })])

const boundaries =
  restartAt === undefined
    ? [[0, requestedTurns] as const]
    : ([[0, restartAt] as const, [restartAt, requestedTurns] as const] as const)
const workers: WorkerResult[] = []
for (const [startTurn, endTurn] of boundaries) {
  const workerOutput = path.join(workdir, `worker-${startTurn}-${endTurn}.json`)
  const workerInput = JSON.stringify({
    databasePath,
    workspacePath,
    outputPath: workerOutput,
    sessionID,
    seed,
    startTurn,
    endTurn,
    checkpoints: checkpointTurns.filter((turn) => turn >= startTurn && turn <= endTurn),
  })
  const child = Bun.spawn([process.execPath, path.join(import.meta.dir, "worker.ts"), workerInput], {
    cwd: path.resolve(import.meta.dir, "../.."),
    env: {
      ...Bun.env,
      XDG_DATA_HOME: path.join(xdgRoot, "data"),
      XDG_CACHE_HOME: path.join(xdgRoot, "cache"),
      XDG_CONFIG_HOME: path.join(xdgRoot, "config"),
      XDG_STATE_HOME: path.join(xdgRoot, "state"),
      OPENCODE_TEST_HOME: workdir,
      NO_COLOR: "1",
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0)
    throw new Error(
      `Long-run worker ${startTurn}-${endTurn} failed (${exitCode})\n${stdout}\n${stderr}\nArtifacts: ${workdir}`,
    )
  workers.push(await Bun.file(workerOutput).json())
}

const turns = workers.flatMap((worker) => worker.turns)
const checkpoints = workers
  .flatMap((worker) => worker.checkpoints)
  .filter((checkpoint, index, values) => values.findIndex((value) => value.turn === checkpoint.turn) === index)
  .map((checkpoint) => withCumulativeLatencies(checkpoint, turns))
  .toSorted((a, b) => a.turn - b.turn)
const final = checkpoints.find((checkpoint) => checkpoint.turn === requestedTurns)
if (!final) throw new Error(`Missing final checkpoint ${requestedTurns}; artifacts: ${workdir}`)
const restartWorker = restartAt === undefined ? undefined : workers[1]
const processIDs = workers.flatMap((worker) => worker.checkpoints.map((checkpoint) => checkpoint.processID))
const integrity = {
  expectedMessages: requestedTurns * 2,
  actualMessages: final.visibleMessageCount,
  expectedInputs: requestedTurns,
  actualInputs: final.database.inputCount,
  corruptionCount: final.corruptionCount,
  duplicateInputCount: final.duplicateInputCount,
  incompleteAssistantCount: final.incompleteAssistantCount,
  lostInputCount: Math.max(0, requestedTurns - final.database.inputCount),
}
const report: LongrunReport = {
  version: 1,
  harness: "session-v2-deterministic-stream",
  commit: await gitHead(),
  generatedAt: new Date().toISOString(),
  platform: process.platform,
  arch: process.arch,
  bun: Bun.version,
  environment: {
    osRelease: release(),
    cpu: cpus()[0]?.model ?? "UNKNOWN",
    logicalCpuCount: cpus().length,
    totalMemoryBytes: totalmem(),
  },
  seed,
  requestedTurns,
  checkpoints,
  turnMeasurements: turns,
  restart: {
    requestedAt: restartAt ?? null,
    processBoundary: restartAt !== undefined && new Set(processIDs).size === 2,
    processIDs: [...new Set(processIDs)],
    reopened: restartWorker?.reopened ?? false,
    expectedMessagesBeforeRestart: (restartAt ?? 0) * 2,
    messagesFoundAfterRestart: restartWorker?.initialVisibleMessageCount ?? 0,
    beforeExit:
      restartAt === undefined
        ? null
        : (workers[0]?.checkpoints.find((checkpoint) => checkpoint.turn === restartAt) ?? null),
    afterReopen:
      restartAt === undefined
        ? null
        : (workers[1]?.checkpoints.find((checkpoint) => checkpoint.turn === restartAt) ?? null),
  },
  integrity,
  metrics: {
    rendererMemory: final.rendererMemory,
    electronMainMemory: final.electronMainMemory,
    globalState: final.state.global,
    workspaceState: final.state.workspace,
    draftState: final.state.draft,
  },
  scenarioSupport: {
    automated: ["A_TEXT_CHAT", "E_PROCESS_RESTART_RECOVERY"],
    reserved: ["B_LARGE_MESSAGES", "C_ATTACHMENTS", "D_SKILL_REVIEW_EXPORT"],
  },
  result:
    integrityPassed(integrity) &&
    (restartAt === undefined || (restartWorker?.reopened === true && new Set(processIDs).size === 2))
      ? "PASS"
      : "FAIL",
}
await Bun.write(outputPath, JSON.stringify(report, null, 2))
if (report.result === "FAIL") throw new Error(`Long-run integrity failed; report: ${outputPath}; artifacts: ${workdir}`)
await cleanup(workdir)
console.log(
  JSON.stringify(
    { output: outputPath, result: report.result, turns: requestedTurns, restart: report.restart, integrity },
    null,
    2,
  ),
)

function positiveInteger(value: string | undefined, name: string) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`)
  return parsed
}

function withCumulativeLatencies(checkpoint: Checkpoint, values: WorkerResult["turns"]): Checkpoint {
  const selected = values.filter((value) => value.turn <= checkpoint.turn)
  return {
    ...checkpoint,
    latency: {
      append: latencySummary(selected.map((value) => value.appendMs)),
      firstToken: latencySummary(selected.map((value) => value.firstTokenMs)),
      completion: latencySummary(selected.map((value) => value.completionMs)),
    },
  }
}

async function gitHead() {
  const child = Bun.spawn(["git", "rev-parse", "HEAD"], {
    cwd: path.resolve(import.meta.dir, "../../../.."),
    stdout: "pipe",
  })
  if ((await child.exited) !== 0) return "UNKNOWN"
  return (await new Response(child.stdout).text()).trim()
}

async function cleanup(target: string) {
  const resolved = path.resolve(target)
  if (
    path.dirname(resolved) !== path.resolve(tmpdir()) ||
    !path.basename(resolved).startsWith("opencode-chat-longrun-")
  )
    throw new Error(`Refusing to remove unexpected harness directory: ${resolved}`)
  await rm(resolved, { recursive: true, force: true })
}
