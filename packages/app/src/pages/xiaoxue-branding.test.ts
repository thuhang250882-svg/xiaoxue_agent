import { describe, expect, test } from "bun:test"

const home = await Bun.file(new URL("./home.tsx", import.meta.url)).text()
const error = await Bun.file(new URL("./error.tsx", import.meta.url)).text()

describe("xiaoxue app branding", () => {
  test("uses Xiaoxue artwork instead of the upstream logo on empty and error pages", () => {
    expect(home).toContain("/assets/pet/xiaoxue-portrait-front.png")
    expect(error).toContain("/assets/pet/xiaoxue-portrait-front.png")
    expect(home).not.toContain("<Logo")
    expect(error).not.toContain("<Logo")
  })

  test("routes product feedback to the Xiaoxue repository", () => {
    expect(home).toContain("https://github.com/thuhang250882-svg/xiaoxue_agent/issues")
    expect(home).not.toContain("https://opencode.ai/desktop-feedback")
  })
})
