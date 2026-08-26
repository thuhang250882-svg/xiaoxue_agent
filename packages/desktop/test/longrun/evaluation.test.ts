import { describe, expect, test } from "bun:test"
import { evaluateDesktopAc02, type GateCheckpoint, type GateInput } from "./evaluation"

const MiB = 1024 * 1024
const checkpoint = (turn: number, stateBytes = turn * 1_000): GateCheckpoint => ({
  turn,
  state: {
    globalBytes: stateBytes,
    workspaceBytes: stateBytes,
    draftBytes: 0,
    orphanDrafts: 0,
    semanticAmplification: false,
  },
  memory: {
    rendererMedianBytes: 256 * MiB,
    rendererPeakBytes: 300 * MiB,
    mainMedianBytes: 128 * MiB,
    mainPeakBytes: 160 * MiB,
  },
})
const passing = (): GateInput => ({
  checkpoints: [checkpoint(0), checkpoint(500), checkpoint(1_000)],
  integrity: { expectedMessages: 2_000, actualMessages: 2_000, lost: 0, duplicate: 0, corrupt: 0, unfinished: 0 },
  restart: {
    mainPidChanged: true,
    rendererPidChanged: true,
    reopened: true,
    continued: true,
    fullUsableReopenMs: 1_000,
    preRestartRendererPeakBytes: 400 * MiB,
    postRestartRendererBytes: 250 * MiB,
  },
  firstTokenP95Ms: 100,
})

describe("desktop AC02 gate evaluation", () => {
  test("passes an in-bounds run", () => {
    expect(evaluateDesktopAc02(passing())).toMatchObject({ result: "PASS", failures: [], warnings: [] })
  })

  test("does not lower state, memory, or restart gates", () => {
    const input = passing()
    input.checkpoints[2]!.state.globalBytes = 9 * MiB
    input.checkpoints[2]!.memory.rendererPeakBytes = 1536 * MiB + 1
    input.restart.fullUsableReopenMs = 5_001
    expect(evaluateDesktopAc02(input).failures).toEqual(
      expect.arrayContaining(["STATE_GLOBAL_DELTA", "MEMORY_RENDERER_PEAK", "RESTART_REOPEN_TIME"]),
    )
  })

  test("reports diagnostic warnings without turning them into failures", () => {
    const input = passing()
    input.checkpoints[2]!.memory.mainPeakBytes = 513 * MiB
    input.firstTokenP95Ms = 501
    expect(evaluateDesktopAc02(input)).toMatchObject({
      result: "PASS",
      warnings: expect.arrayContaining(["MEMORY_MAIN_PEAK", "FIRST_TOKEN_P95"]),
    })
  })
})
