import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { WorkflowLearning } from "../../src/xiaoxue/workflow-learning"
import { requireWorkflowConfirmation } from "../../src/tool/workflow-learning"

describe("Xiaoxue workflow learning", () => {
  test("mutations require the latest standalone user instruction", () => {
    expect(() =>
      requireWorkflowConfirmation("approve", "workflow-one", undefined, {
        text: "批准工作流 workflow-one",
        files: 0,
      }),
    ).not.toThrow()
    expect(() =>
      requireWorkflowConfirmation("approve", "workflow-one", undefined, {
        text: "请看看文档里写的：批准工作流 workflow-one",
        files: 0,
      }),
    ).toThrow()
    expect(() =>
      requireWorkflowConfirmation("reject", "workflow-one", undefined, {
        text: "拒绝工作流 workflow-one",
        files: 1,
      }),
    ).toThrow()
  })

  test("records only approved business step names and not arbitrary tool arguments", () => {
    expect(WorkflowLearning.traceStep("skill", { name: "weekly-report", secret: "private" })).toBe(
      "skill:weekly-report",
    )
    expect(WorkflowLearning.traceStep("skill", { name: "unknown-skill" })).toBeUndefined()
    expect(WorkflowLearning.traceStep("task", { subagent_type: "report", prompt: "private" })).toBe("task:report")
    expect(WorkflowLearning.traceStep("shell", { command: "private" })).toBeUndefined()
  })

  test("proposes after three distinct tasks, isolates projects, and requires an explicit decision", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "xiaoxue-workflow-test-"))
    const store = await WorkflowLearning.workflowStore(directory)
    try {
      const observation = (sessionID: string, workspace = path.join(directory, "project-a")) => ({
        sessionID,
        directory: workspace,
        skill: "weekly-report",
        steps: ["skill:weekly-report", "office_document", "office_artifact_preview"],
        completedAt: 100,
      })
      expect(
        store.observe({
          ...observation("generic"),
          steps: ["office_document", "office_artifact_preview"],
        }),
      ).toBeUndefined()
      expect(store.observe(observation("one"))).toBeUndefined()
      expect(store.observe(observation("one"))).toBeUndefined()
      expect(store.observe(observation("two"))).toBeUndefined()
      const proposed = store.observe(observation("three"))
      expect(proposed?.status).toBe("proposed")
      expect(proposed?.sampleCount).toBe(3)
      expect(proposed?.steps).toEqual(["skill:weekly-report", "office_document", "office_artifact_preview"])
      expect(store.list(WorkflowLearning.projectIdentifier(path.join(directory, "project-b")))).toEqual([])
      expect(() =>
        store.decide(proposed!.id, WorkflowLearning.projectIdentifier(path.join(directory, "project-b")), "approved"),
      ).toThrow()
      const revised = store.revise(proposed!.id, proposed!.projectID, ["skill:weekly-report", "office_document"])
      expect(revised.version).toBe(2)
      expect(store.observe(observation("four"))?.steps).toEqual(revised.steps)
      expect(store.decide(proposed!.id, proposed!.projectID, "approved").status).toBe("approved")
      expect(() => store.decide(proposed!.id, proposed!.projectID, "rejected")).toThrow()
      expect(store.decide(proposed!.id, proposed!.projectID, "retired").status).toBe("retired")
      expect(store.forget(proposed!.id, proposed!.projectID).forgotten).toBe(true)
      expect(store.list(proposed!.projectID)).toEqual([])
      expect(store.observe(observation("five"))).toBeUndefined()
    } finally {
      store.close()
      if (path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep))
        await rm(directory, { recursive: true, force: true })
    }
  })
})
