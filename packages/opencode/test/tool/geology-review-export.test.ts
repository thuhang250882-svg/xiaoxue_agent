import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createReviewResult } from "../../../../document_engine/review_result"
import { exportPersistedGeologyReview } from "../../src/tool/geology-review-export"
import { xiaoxueOutputDirectory } from "../../src/tool/xiaoxue-output-directory"

const workspaces: string[] = []

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })))
})

describe("geology review delivery", () => {
  test("writes the opinion DOCX into the workspace without reusing an earlier file name", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "xiaoxue-geology-export-"))
    workspaces.push(workspace)
    const outputPath = xiaoxueOutputDirectory(workspace)
    const result = createReviewResult({ taskId: "review-test-1", fileName: "虚构井录井报告.docx", issues: [] })

    const exported = await exportPersistedGeologyReview(result, outputPath)

    expect(path.dirname(exported.filePath)).toBe(outputPath)
    expect(exported.fileName).toContain("review-test-1")
    expect(exported.size).toBeGreaterThan(1000)
    expect(await Bun.file(exported.filePath).exists()).toBe(true)
  })
})
