import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { expectedPrompt, integrityPassed, type LongrunReport } from "./longrun/types"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("chat long-run harness", () => {
  test("runs deterministic chat across a real worker-process restart", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "opencode-chat-longrun-test-"))
    roots.push(root)
    const output = path.join(root, "report.json")
    const child = Bun.spawn(
      [
        process.execPath,
        "test/longrun/run.ts",
        "--turns",
        "10",
        "--restart-at",
        "5",
        "--seed",
        "7",
        "--output",
        output,
      ],
      { cwd: path.resolve(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" },
    )
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])

    expect({ exitCode, stdout, stderr }).toMatchObject({ exitCode: 0 })
    const report: LongrunReport = await Bun.file(output).json()
    expect(report).toMatchObject({
      result: "PASS",
      requestedTurns: 10,
      restart: {
        requestedAt: 5,
        processBoundary: true,
        reopened: true,
        expectedMessagesBeforeRestart: 10,
        messagesFoundAfterRestart: 10,
      },
      integrity: {
        expectedMessages: 20,
        actualMessages: 20,
        expectedInputs: 10,
        actualInputs: 10,
        corruptionCount: 0,
        duplicateInputCount: 0,
        incompleteAssistantCount: 0,
        lostInputCount: 0,
      },
    })
    expect(report.checkpoints.map((checkpoint) => checkpoint.turn)).toEqual([0, 5, 10])
    expect(new Set(report.restart.processIDs).size).toBe(2)
    expect(report.restart.beforeExit?.processID).not.toBe(report.restart.afterReopen?.processID)
    expect(report.turnMeasurements).toHaveLength(10)
    expect(report.checkpoints.every((checkpoint) => checkpoint.database.totalBytes > 0)).toBe(true)
    expect(report.checkpoints.every((checkpoint) => checkpoint.memory.rssBytes > 0)).toBe(true)
    expect(await Bun.file(output).text()).not.toContain(root)
  }, 30_000)

  test("keeps synthetic traces reproducible and rejects corrupted integrity", () => {
    expect(expectedPrompt(7, 42)).toBe(expectedPrompt(7, 42))
    expect(expectedPrompt(7, 42)).not.toBe(expectedPrompt(7, 43))
    expect(
      integrityPassed({
        expectedMessages: 20,
        actualMessages: 20,
        expectedInputs: 10,
        actualInputs: 10,
        corruptionCount: 1,
        duplicateInputCount: 0,
        incompleteAssistantCount: 0,
        lostInputCount: 0,
      }),
    ).toBe(false)
  })
})
