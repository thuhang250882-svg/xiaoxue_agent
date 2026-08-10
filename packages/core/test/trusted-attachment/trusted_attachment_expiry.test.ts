import { afterEach, describe, expect, test } from "bun:test"
import { TRUSTED_ATTACHMENT_TTL_MS } from "@opencode-ai/core/util/trusted-attachment"
import { createFile, createHarness, type TestHarness } from "./helper"

let harness: TestHarness | undefined

afterEach(async () => {
  await harness?.cleanup()
  harness = undefined
})

describe("trusted attachment expiry", () => {
  test("expired tokens are rejected with a dedicated error code", async () => {
    harness = await createHarness()
    const file = await createFile(harness.dataDir, "a.txt", "body")
    const [entry] = await harness.registry.register(1, "native-picker", [{ absolutePath: file }])

    harness.setNow(entry.expiresAt + 1)
    await expect(harness.registry.consume(entry.id)).rejects.toMatchObject({ code: "ATTACHMENT_TOKEN_EXPIRED" })
  })

  test("tokens remain valid right up to the expiry boundary", async () => {
    harness = await createHarness()
    const file = await createFile(harness.dataDir, "a.txt", "body")
    const [entry] = await harness.registry.register(1, "native-picker", [{ absolutePath: file }])

    harness.setNow(entry.expiresAt)
    const consumed = await harness.registry.consume(entry.id)
    expect(consumed.id).toBe(entry.id)
  })

  test("custom ttl shortens the validity window", async () => {
    harness = await createHarness({ ttlMs: 5_000 })
    const file = await createFile(harness.dataDir, "a.txt", "body")
    const [entry] = await harness.registry.register(1, "native-picker", [{ absolutePath: file }])
    expect(entry.expiresAt - entry.createdAt).toBe(5_000)

    harness.setNow(entry.createdAt + 6_000)
    await expect(harness.registry.consume(entry.id)).rejects.toMatchObject({ code: "ATTACHMENT_TOKEN_EXPIRED" })
  })

  test("purgeExpired removes stale entries but keeps valid ones", async () => {
    harness = await createHarness({ ttlMs: 10_000 })
    const stale = await createFile(harness.dataDir, "stale.txt", "old")
    const fresh = await createFile(harness.dataDir, "fresh.txt", "new")
    const [staleEntry] = await harness.registry.register(1, "native-picker", [{ absolutePath: stale }])

    harness.setNow(staleEntry.createdAt + 20_000)
    const [freshEntry] = await harness.registry.register(1, "native-picker", [{ absolutePath: fresh }])

    await harness.registry.purgeExpired()
    const remaining = await harness.store.list()
    expect(remaining.map((entry) => entry.id)).toEqual([freshEntry.id])
    expect(TRUSTED_ATTACHMENT_TTL_MS).toBe(60 * 60 * 1000)
  })
})
