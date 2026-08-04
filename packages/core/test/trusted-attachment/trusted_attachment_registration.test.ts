import { afterEach, describe, expect, test } from "bun:test"
import { TRUSTED_ATTACHMENT_TTL_MS } from "@opencode-ai/core/util/trusted-attachment"
import { createFile, createHarness, type TestHarness } from "./helper"

let harness: TestHarness | undefined

afterEach(async () => {
  await harness?.cleanup()
  harness = undefined
})

describe("trusted attachment registration", () => {
  test("native-picker registration stores a complete auditable entry", async () => {
    harness = await createHarness()
    const file = await createFile(harness.dataDir, "报告.docx", "PK\u0003\u0004 fake docx body")

    const [entry] = await harness.registry.register(7, "native-picker", [{ absolutePath: file, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }])

    expect(entry.id).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(entry.absolutePath).toBe(file)
    expect(entry.canonicalPath.toLowerCase()).toBe(file.toLowerCase())
    expect(entry.fileName).toBe("报告.docx")
    expect(entry.extension).toBe(".docx")
    expect(entry.size).toBeGreaterThan(0)
    expect(entry.mime).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    expect(entry.source).toBe("native-picker")
    expect(entry.senderWebContentsId).toBe(7)
    expect(entry.expiresAt).toBe(entry.createdAt + TRUSTED_ATTACHMENT_TTL_MS)
    expect(entry.consumed).toBeFalse()
  })

  test("ids are high-entropy and unique across registrations", async () => {
    harness = await createHarness()
    const file = await createFile(harness.dataDir, "a.txt", "body")
    const entries = await harness.registry.register(1, "native-picker", [
      { absolutePath: file },
      { absolutePath: file },
      { absolutePath: file },
    ])
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(3)
  })

  test("multiple attachments in one prompt are all registered", async () => {
    harness = await createHarness()
    const first = await createFile(harness.dataDir, "1.xlsx", "PK\u0003\u0004 sheet")
    const second = await createFile(harness.dataDir, "2.docx", "PK\u0003\u0004 doc")
    const entries = await harness.registry.register(3, "native-picker", [
      { absolutePath: first, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      { absolutePath: second, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    ])
    expect(entries.length).toBe(2)
    expect(await harness.store.list()).toHaveLength(2)
  })

  test("oversized office files are rejected at registration", async () => {
    harness = await createHarness({ maxBytes: 16 })
    const file = await createFile(harness.dataDir, "big.txt", "x".repeat(64))
    await expect(
      harness.registry.register(1, "native-picker", [{ absolutePath: file }]),
    ).rejects.toMatchObject({ code: "ATTACHMENT_TOO_LARGE" })
  })

  test("forged extension with mismatching file header is rejected", async () => {
    harness = await createHarness()
    const file = await createFile(harness.dataDir, "forged.docx", "plain text pretending to be docx")
    await expect(
      harness.registry.register(1, "native-picker", [{ absolutePath: file }]),
    ).rejects.toMatchObject({ code: "ATTACHMENT_TYPE_MISMATCH" })
  })
})
