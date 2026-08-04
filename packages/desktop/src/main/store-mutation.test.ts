import { describe, expect, test } from "bun:test"
import { queueStoreMutation, retryStoreMutation } from "./store-mutation"

describe("store mutation", () => {
  test("retries transient Windows rename failures", async () => {
    let attempts = 0
    await retryStoreMutation(() => {
      attempts += 1
      if (attempts < 3) throw Object.assign(new Error("rename failed"), { code: "EPERM" })
    })
    expect(attempts).toBe(3)
  })

  test("serializes writes to the same store", async () => {
    const events: string[] = []
    const first = queueStoreMutation("draft", async () => {
      events.push("first:start")
      await Promise.resolve()
      events.push("first:end")
    })
    const second = queueStoreMutation("draft", () => {
      events.push("second")
    })
    await Promise.all([first, second])
    expect(events).toEqual(["first:start", "first:end", "second"])
  })

  test("does not block a store after a failed mutation", async () => {
    await queueStoreMutation("recover", () => {
      throw new Error("permanent")
    }).catch(() => undefined)
    let completed = false
    await queueStoreMutation("recover", () => {
      completed = true
    })
    expect(completed).toBe(true)
  })
})
