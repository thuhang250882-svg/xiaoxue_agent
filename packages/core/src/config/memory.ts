export * as ConfigMemory from "./memory"

import { Schema } from "effect"
import { NonNegativeInt, PositiveInt } from "../schema"

export class Info extends Schema.Class<Info>("ConfigV2.Memory")({
  enabled: Schema.Boolean.pipe(Schema.optional),
  max_tokens: PositiveInt.pipe(Schema.optional),
  profile_tokens: NonNegativeInt.pipe(Schema.optional),
  review_interval: NonNegativeInt.pipe(Schema.optional),
}) {}
