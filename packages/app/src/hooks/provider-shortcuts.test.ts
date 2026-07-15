import { describe, expect, test } from "bun:test"
import { popularProviders, providerShortcuts } from "./provider-shortcuts"

describe("provider shortcuts", () => {
  test("only exposes the supported domestic quick connections", () => {
    expect(providerShortcuts.map((x) => x.id)).toEqual([
      "xiaomi-token-plan-cn",
      "kimi-for-coding",
      "moonshotai-cn",
      "deepseek",
      "alibaba-cn",
    ])
    expect(popularProviders).toEqual(providerShortcuts.map((x) => x.id))
    expect(new Set(popularProviders).size).toBe(popularProviders.length)
  })
})