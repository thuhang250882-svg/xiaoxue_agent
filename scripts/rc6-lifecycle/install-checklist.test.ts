import { expect, test } from "bun:test"

import { configuredApiKeyName, matchesGateAHead } from "./install-checklist-config"

test("requires the exact configured Gate A HEAD", () => {
  expect(matchesGateAHead("abc123", "abc123")).toBe(true)
  expect(matchesGateAHead("abc123", "def456")).toBe(false)
})

test("recognizes supported API key environment variables without reading their values", () => {
  expect(configuredApiKeyName({ XIAOXUE_API_KEY: "secret" })).toBe("XIAOXUE_API_KEY")
  expect(configuredApiKeyName({ XIAOXUE_DEFAULT_API_KEY: "secret" })).toBe("XIAOXUE_DEFAULT_API_KEY")
  expect(configuredApiKeyName({ XIAOXUE_API_KEY: " " })).toBeUndefined()
})
