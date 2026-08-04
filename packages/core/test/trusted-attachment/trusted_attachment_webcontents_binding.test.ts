import { afterEach, describe, expect, test } from "bun:test"
import { createFile, createHarness, type TestHarness } from "./helper"

let harness: TestHarness | undefined

afterEach(async () => {
  await harness?.cleanup()
  harness = undefined
})

describe("trusted attachment webcontents binding", () => {
  test("another window cannot steal a token it did not create", async () => {
    harness = await createHarness()
    const file = await createFile(harness.dataDir, "a.txt", "body")
    const [entry] = await harness.registry.register(1, "native-picker", [{ absolutePath: file }])

    await expect(harness.registry.consume(entry.id, { webContentsId: 2 })).rejects.toMatchObject({
      code: "ATTACHMENT_NOT_TRUSTED",
    })
    // 盗用失败后凭证仍然可用，原窗口不受影响
    const consumed = await harness.registry.consume(entry.id, { webContentsId: 1 })
    expect(consumed.senderWebContentsId).toBe(1)
  })

  test("consume without a caller id skips the binding check (sidecar service path)", async () => {
    harness = await createHarness()
    const file = await createFile(harness.dataDir, "a.txt", "body")
    const [entry] = await harness.registry.register(9, "native-picker", [{ absolutePath: file }])
    const consumed = await harness.registry.consume(entry.id)
    expect(consumed.id).toBe(entry.id)
  })

  test("entries from different windows stay isolated in the same registry", async () => {
    harness = await createHarness()
    const first = await createFile(harness.dataDir, "1.txt", "one")
    const second = await createFile(harness.dataDir, "2.txt", "two")
    const [a] = await harness.registry.register(1, "native-picker", [{ absolutePath: first }])
    const [b] = await harness.registry.register(2, "native-picker", [{ absolutePath: second }])

    await expect(harness.registry.consume(b.id, { webContentsId: 1 })).rejects.toMatchObject({
      code: "ATTACHMENT_NOT_TRUSTED",
    })
    await expect(harness.registry.consume(a.id, { webContentsId: 2 })).rejects.toMatchObject({
      code: "ATTACHMENT_NOT_TRUSTED",
    })
  })
})
