import { describe, expect, test } from "bun:test"

const source = await Bun.file(new URL("./session-new-design-view.tsx", import.meta.url)).text()

describe("new session branding", () => {
  test("uses Xiaoxue instead of the OpenCode wordmark", () => {
    expect(source).toContain('src="/logo-xiaoxue.png"')
    expect(source).toContain("XIAOXUE")
    expect(source).not.toContain("WordmarkV2")
  })
})
