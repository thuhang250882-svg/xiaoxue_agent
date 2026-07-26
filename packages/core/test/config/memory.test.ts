import { describe, expect, test } from "bun:test"
import { Config } from "../../src/config"
import { ConfigMigrateV1 } from "../../src/v1/config/migrate"
import { Schema } from "effect"

describe("config memory", () => {
  test("decodes persistent memory settings", () => {
    expect(
      Schema.decodeUnknownSync(Config.Info)({
        memory: {
          enabled: true,
          max_tokens: 2_000,
          profile_tokens: 600,
          review_interval: 10,
        },
      }).memory,
    ).toEqual({
      enabled: true,
      max_tokens: 2_000,
      profile_tokens: 600,
      review_interval: 10,
    })
  })

  test("preserves memory settings during v1 migration", () => {
    expect(
      ConfigMigrateV1.migrate({
        memory: {
          enabled: true,
          max_tokens: 2_000,
          profile_tokens: 600,
          review_interval: 10,
        },
      }).memory,
    ).toEqual({
      enabled: true,
      max_tokens: 2_000,
      profile_tokens: 600,
      review_interval: 10,
    })
  })
})
