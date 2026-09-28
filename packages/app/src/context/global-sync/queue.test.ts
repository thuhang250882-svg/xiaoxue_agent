import { describe, expect, test } from "bun:test"
import { createRefreshQueue } from "./queue"
import { directoryKey } from "./utils"

const tick = () => new Promise((resolve) => setTimeout(resolve, 10))

describe("createRefreshQueue", () => {
  test("clears queued directories by normalized key", async () => {
    const calls: string[] = []
    const queue = createRefreshQueue({
      paused: () => false,
      key: directoryKey,
      bootstrap: async () => {},
      bootstrapInstance: (directory) => {
        calls.push(directory)
      },
    })

    queue.push("C:\\tmp\\demo")
    queue.clear("C:/tmp/demo")

    await tick()

    expect(calls).toEqual([])
    queue.dispose()
  })

  test("passes the original directory to bootstrapInstance", async () => {
    const calls: string[] = []
    const queue = createRefreshQueue({
      paused: () => false,
      key: directoryKey,
      bootstrap: async () => {},
      bootstrapInstance: (directory) => {
        calls.push(directory)
      },
    })

    queue.push("C:\\tmp\\demo")

    await tick()

    expect(calls).toEqual(["C:\\tmp\\demo"])
    queue.dispose()
  })

  test("refreshes a directory re-enqueued after a config mutation unpauses", async () => {
    let paused = true
    const calls: string[] = []
    const queue = createRefreshQueue({
      paused: () => paused,
      bootstrap: async () => {},
      bootstrapInstance: (directory) => { calls.push(directory) },
    })
    queue.push("C:/project")
    await tick()
    expect(calls).toEqual([])
    paused = false
    queue.push("C:/project")
    await tick()
    expect(calls).toEqual(["C:/project"])
    queue.dispose()
  })
})
