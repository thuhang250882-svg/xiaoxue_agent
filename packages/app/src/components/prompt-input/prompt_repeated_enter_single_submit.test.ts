import { beforeAll, beforeEach, describe, expect, test } from "bun:test"
import {
  defaultSubmitInput,
  flushAsync,
  harnessLog,
  initSubmitHarness,
  resetHarness,
  submitEvent,
} from "./submit-mutex-harness"

let createPromptSubmit: typeof import("./submit").createPromptSubmit

beforeAll(async () => {
  createPromptSubmit = (await initSubmitHarness()).createPromptSubmit
})

beforeEach(resetHarness)

describe("repeated enter submits once", () => {
  test("burst of enter presses during one submission dispatches a single prompt", async () => {
    const submit = createPromptSubmit(defaultSubmitInput())

    // 模拟连续按 Enter：多次 handleSubmit 在同一事件循环内排队
    const pending = [
      submit.handleSubmit(submitEvent()),
      submit.handleSubmit(submitEvent()),
      submit.handleSubmit(submitEvent()),
      submit.handleSubmit(submitEvent()),
      submit.handleSubmit(submitEvent()),
    ]
    await Promise.all(pending)
    await flushAsync()

    expect(harnessLog.createdSessions).toEqual(["/repo/main"])
    expect(harnessLog.promptDispatches).toEqual(["/repo/main"])
    expect(harnessLog.optimisticAdds).toHaveLength(1)
    expect(submit.submitGuard.busy()).toBe(false)
  })
})
