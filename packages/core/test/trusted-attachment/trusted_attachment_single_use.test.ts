import { afterEach, describe, expect, test } from "bun:test"
import { createFile, createHarness, type TestHarness } from "./helper"

let harness: TestHarness | undefined

afterEach(async () => {
  await harness?.cleanup()
  harness = undefined
})

describe("trusted attachment single-use semantics", () => {
  test("first consume marks the entry consumed", async () => {
    harness = await createHarness()
    const file = await createFile(harness.dataDir, "a.txt", "body")
    const [entry] = await harness.registry.register(1, "native-picker", [{ absolutePath: file }])

    const consumed = await harness.registry.consume(entry.id)
    expect(consumed.consumed).toBeTrue()
    expect(consumed.consumedAt).toBeNumber()
  })

  test("controlled retry after a failed submission succeeds inside the retry window", async () => {
    harness = await createHarness({ retryWindowMs: 30 * 60 * 1000 })
    const file = await createFile(harness.dataDir, "a.txt", "body")
    const [entry] = await harness.registry.register(1, "native-picker", [{ absolutePath: file }])
    await harness.registry.consume(entry.id)

    // 提交失败后的受控重试：窗口内再次消费必须成功
    const retry = await harness.registry.consume(entry.id)
    expect(retry.id).toBe(entry.id)
  })

  test("double consume outside the retry window fails", async () => {
    harness = await createHarness({ retryWindowMs: 60_000 })
    const file = await createFile(harness.dataDir, "a.txt", "body")
    const [entry] = await harness.registry.register(1, "native-picker", [{ absolutePath: file }])
    const consumed = await harness.registry.consume(entry.id)

    harness.setNow((consumed.consumedAt ?? 0) + 61_000)
    await expect(harness.registry.consume(entry.id)).rejects.toMatchObject({ code: "ATTACHMENT_NOT_TRUSTED" })
  })

  test("unknown ids cannot be consumed", async () => {
    harness = await createHarness()
    await expect(harness.registry.consume("Z".repeat(32))).rejects.toMatchObject({ code: "ATTACHMENT_NOT_FOUND" })
  })

  test("clearing the registry on app exit drops every entry", async () => {
    harness = await createHarness()
    const file = await createFile(harness.dataDir, "a.txt", "body")
    const [entry] = await harness.registry.register(1, "native-picker", [{ absolutePath: file }])

    await harness.registry.clear()
    await expect(harness.registry.consume(entry.id)).rejects.toMatchObject({ code: "ATTACHMENT_NOT_FOUND" })
  })
})
