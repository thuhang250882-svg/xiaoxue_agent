import { expect, test } from "bun:test"
import path from "node:path"

test("synthetic personal offline experience workflow uses the actual tool core", async () => {
  const cwd = path.resolve(import.meta.dir, "../..")
  const child = Bun.spawn([process.execPath, "run", "script/simulate-review-strategy.ts"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [output, error, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  expect(exit, error).toBe(0)
  const result = JSON.parse(output)
  expect(result).toMatchObject({
    data: "synthetic-docx-only",
    candidateHiddenBeforeConfirmation: true,
    implicitSaveDenied: true,
    attachedSaveDenied: true,
    explicitSaveRecallable: true,
    wrongReportTypeExcluded: true,
    implicitRemovalDenied: true,
    explicitRemovalStopsRecall: true,
    modelCalls: 0,
    networkCalls: 0,
  })
})
