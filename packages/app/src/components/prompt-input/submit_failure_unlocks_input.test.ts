import { beforeAll, beforeEach, describe, expect, test } from "bun:test"
import type { Prompt } from "@/context/prompt"
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

describe("submit failure unlocks input", () => {
  test("session creation failure releases the guard and allows retry", async () => {
    harnessState.failSessionCreate = true
    const submit = createPromptSubmit(defaultSubmitInput())

    await submit.handleSubmit(submitEvent())

    expect(harnessLog.createdSessions).toEqual([])
    // 失败后状态机必须回到 idle，否则用户永远无法重试
    expect(submit.submitGuard.busy()).toBe(false)

    harnessState.failSessionCreate = false
    await submit.handleSubmit(submitEvent())
    await flushAsync()

    expect(harnessLog.createdSessions).toEqual(["/repo/main"])
    expect(harnessLog.promptDispatches).toEqual(["/repo/main"])
  })

  test("prompt dispatch failure releases the guard for resubmission", async () => {
    harnessState.failPromptDispatch = true
    const submit = createPromptSubmit(defaultSubmitInput())

    await submit.handleSubmit(submitEvent())
    await flushAsync()

    expect(harnessLog.createdSessions).toEqual(["/repo/main"])
    expect(harnessLog.promptDispatches).toEqual([])
    expect(submit.submitGuard.busy()).toBe(false)

    // 重试：会话已创建并被导航接管，复用同一会话发送，不再新建空会话
    harnessState.failPromptDispatch = false
    harnessState.params = { id: "session-1" }
    await submit.handleSubmit(submitEvent())
    await flushAsync()

    expect(harnessLog.createdSessions).toEqual(["/repo/main"])
    expect(harnessLog.promptDispatches).toEqual(["/repo/main"])
  })

  test("validation rejection keeps the guard idle", async () => {
    harnessState.promptParts = [{ type: "text", content: "   ", start: 0, end: 3 }] as Prompt
    const submit = createPromptSubmit(defaultSubmitInput())

    await submit.handleSubmit(submitEvent())

    expect(harnessLog.createdSessions).toEqual([])
    expect(submit.submitGuard.busy()).toBe(false)
    expect(submit.submitGuard.phase()).toBe("idle")
  })
})
