export * as ConfigXiaoxue from "./xiaoxue"

import { Schema } from "effect"
import { NonNegativeInt, PositiveInt } from "../schema"

export class Memory extends Schema.Class<Memory>("Config.Xiaoxue.Memory")({
  enabled: Schema.Boolean.pipe(Schema.optional),
  max_tokens: PositiveInt.pipe(Schema.optional),
  profile_tokens: NonNegativeInt.pipe(Schema.optional),
  review_interval: NonNegativeInt.pipe(Schema.optional),
}) {}

export class Obsidian extends Schema.Class<Obsidian>("Config.Xiaoxue.Obsidian")({
  enabled: Schema.Boolean.pipe(Schema.optional),
  vault_path: Schema.String.pipe(Schema.optional),
  archive_directory: Schema.String.pipe(Schema.optional),
  archive_mode: Schema.Literals(["manual", "confirm", "auto"]).pipe(Schema.optional),
  exclude_patterns: Schema.Array(Schema.String).pipe(Schema.optional),
  search_limit: PositiveInt.pipe(Schema.optional),
  companion_plugin: Schema.Boolean.pipe(Schema.optional),
}) {}

export class Info extends Schema.Class<Info>("Config.Xiaoxue")({
  memory: Memory.pipe(Schema.optional),
  obsidian: Obsidian.pipe(Schema.optional),
}) {}
