import { describe, expect, test } from "bun:test"
import { currentPendingPetAction } from "./pending-pet-action"

describe("pending Xiaoxue pet action", () => {
  test("accepts an action queued by the current app run", () => {
    const action = { prompt: "review", queuedAt: 10_000 }
    expect(currentPendingPetAction(action, 20_000)).toBe(action)
  })

  test("ignores stale actions restored after reopening the app", () => {
    expect(currentPendingPetAction({ prompt: "review", queuedAt: 10_000 }, 30_001)).toBeUndefined()
  })

  test("ignores legacy cached actions without a timestamp", () => {
    expect(currentPendingPetAction({ prompt: "review" }, 20_000)).toBeUndefined()
  })
})
