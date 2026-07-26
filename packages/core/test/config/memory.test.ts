import { describe, expect, test } from "bun:test"
import { Config } from "../../src/config"
import { ConfigMigrateV1 } from "../../src/v1/config/migrate"
import { Schema } from "effect"

describe("config memory", () => {
  test("decodes Xiaoxue memory and Obsidian settings", () => {
    expect(
      Schema.decodeUnknownSync(Config.Info)({
        xiaoxue: {
          memory: {
            enabled: true,
            max_tokens: 6_000,
            profile_tokens: 1_200,
            review_interval: 10,
          },
          obsidian: {
            enabled: true,
            vault_path: "D:\\知识库",
            archive_directory: "06-日常工作管理\\智能体协作",
            archive_mode: "confirm",
            exclude_patterns: [".obsidian", ".git"],
            search_limit: 8,
          },
        },
      }).xiaoxue,
    ).toEqual({
      memory: {
        enabled: true,
        max_tokens: 6_000,
        profile_tokens: 1_200,
        review_interval: 10,
      },
      obsidian: {
        enabled: true,
        vault_path: "D:\\知识库",
        archive_directory: "06-日常工作管理\\智能体协作",
        archive_mode: "confirm",
        exclude_patterns: [".obsidian", ".git"],
        search_limit: 8,
      },
    })
  })

  test("migrates legacy memory settings into the Xiaoxue namespace", () => {
    expect(
      ConfigMigrateV1.migrate({
        memory: {
          enabled: true,
          max_tokens: 2_000,
          profile_tokens: 600,
          review_interval: 10,
        },
      }).xiaoxue,
    ).toEqual({
      memory: {
        enabled: true,
        max_tokens: 2_000,
        profile_tokens: 600,
        review_interval: 10,
      },
    })
  })
})
