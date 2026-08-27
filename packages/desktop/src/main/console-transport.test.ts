import { describe, expect, test } from "bun:test"
import { configureConsoleTransport } from "./console-transport"

describe("console transport", () => {
  test("disables console logging before a packaged app writes to a detached pipe", () => {
    const transport = {
      level: "info" as string | false,
      writeFn: () => {
        throw Object.assign(new Error("broken pipe"), { code: "EPIPE" })
      },
    }

    configureConsoleTransport(transport, true)

    expect(transport.level).toBe(false)
  })

  test("keeps development console logging and disables it after a synchronous broken pipe", () => {
    const transport = {
      level: "info" as string | false,
      writeFn: () => {
        throw Object.assign(new Error("broken pipe"), { code: "EPIPE" })
      },
    }

    configureConsoleTransport(transport, false)
    transport.writeFn()

    expect(transport.level).toBe(false)
  })

  test("does not hide unrelated development console failures", () => {
    const transport = {
      level: "info" as string | false,
      writeFn: () => {
        throw new Error("write failed")
      },
    }

    configureConsoleTransport(transport, false)

    expect(() => transport.writeFn()).toThrow("write failed")
  })
})
