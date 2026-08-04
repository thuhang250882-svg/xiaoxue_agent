import { afterEach, describe, expect, test } from "bun:test"
import { parseTrustedAttachmentUrl, trustedAttachmentUrl } from "@opencode-ai/core/util/trusted-attachment"
import { createFile, createHarness, type TestHarness } from "./helper"

let harness: TestHarness | undefined

afterEach(async () => {
  await harness?.cleanup()
  harness = undefined
})

describe("unicode and special-character paths", () => {
  test("chinese paths with spaces and reserved url characters survive registration", async () => {
    harness = await createHarness()
    const file = await createFile(harness.dataDir, "公司 资料 #1 (2026) 50%/报告 终版.docx", "PK\u0003\u0004 body")

    const [entry] = await harness.registry.register(1, "native-picker", [{ absolutePath: file }])
    const consumed = await harness.registry.consume(entry.id)
    expect(consumed.fileName).toBe("报告 终版.docx")
    expect(consumed.canonicalPath.toLowerCase()).toBe(file.toLowerCase())
  })

  test("percent signs and hashes in folder names do not break revalidation", async () => {
    harness = await createHarness()
    const file = await createFile(harness.dataDir, "100% #hash (x)/a.txt", "body")
    const [entry] = await harness.registry.register(1, "native-picker", [{ absolutePath: file }])

    const retry = await harness.registry.consume(entry.id)
    expect(retry.consumed).toBeTrue()
  })

  test("credential urls round-trip and reject malformed ids", () => {
    const url = trustedAttachmentUrl("A".repeat(32))
    expect(url).toBe("xiaoxue-attachment:" + "A".repeat(32))
    expect(parseTrustedAttachmentUrl(url)).toBe("A".repeat(32))
    expect(parseTrustedAttachmentUrl("xiaoxue-attachment:short")).toBeUndefined()
    expect(parseTrustedAttachmentUrl("xiaoxue-attachment:" + "A".repeat(33))).toBeUndefined()
    expect(parseTrustedAttachmentUrl("file:///D:/报告.docx")).toBeUndefined()
    expect(parseTrustedAttachmentUrl("xiaoxue-attachment:" + "A".repeat(31) + "$")).toBeUndefined()
  })
})
