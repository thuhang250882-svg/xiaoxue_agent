import { beforeAll, beforeEach, describe, expect, test } from "bun:test"
import {
  defaultSubmitInput,
  flushAsync,
  harnessLog,
  harnessState,
  initSubmitHarness,
  resetHarness,
  submitEvent,
} from "./submit-mutex-harness"

let createPromptSubmit: typeof import("./submit").createPromptSubmit

beforeAll(async () => {
  createPromptSubmit = (await initSubmitHarness()).createPromptSubmit
})

beforeEach(resetHarness)

describe("prompt double click creates a single session", () => {
  test("concurrent submits while session creation is in flight create one session", async () => {
    let release = () => {}
    harnessState.createSessionGate = new Promise<void>((resolve) => {
      release = resolve
    })
    const submit = createPromptSubmit(defaultSubmitInput())

    // 双击：第一次提交还卡在 session.create 时第二次提交到达
    const first = submit.handleSubmit(submitEvent())
    const second = submit.handleSubmit(submitEvent())
    release()
    await Promise.all([first, second])
    await flushAsync()

    expect(harnessLog.createdSessions).toEqual(["/repo/main"])
    expect(harnessLog.promptDispatches).toEqual(["/repo/main"])
    expect(harnessLog.optimisticAdds).toHaveLength(1)
    expect(submit.submitGuard.busy()).toBe(false)
  })

  test("rapid clicks after completion are independent submissions", async () => {
    const submit = createPromptSubmit(defaultSubmitInput())

    await submit.handleSubmit(submitEvent())
    await flushAsync()
    // 第一次完整结束后锁已释放，下一次提交属于新会话
    await submit.handleSubmit(submitEvent())
    await flushAsync()

    expect(harnessLog.createdSessions).toHaveLength(2)
    expect(harnessLog.promptDispatches).toHaveLength(2)
  })
})
