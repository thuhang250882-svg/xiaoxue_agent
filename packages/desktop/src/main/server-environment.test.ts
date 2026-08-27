import { describe, expect, test } from "bun:test"

import { applyOfflineSidecarPolicy } from "./sidecar-environment"

describe("desktop sidecar environment", () => {
  test("office-network policy disables public model catalog refresh", () => {
    expect(applyOfflineSidecarPolicy({}, { offline: true })).toEqual({ OPENCODE_DISABLE_MODELS_FETCH: "1" })
  })

  test("managed online deployments may retain their configured model catalog", () => {
    expect(applyOfflineSidecarPolicy({}, { offline: false })).toEqual({})
  })
})
