export * as StorageHealth from "./storage-health"

import { Schema } from "effect"
import { NonNegativeInt } from "./schema"

export const Category = Schema.Literals([
  "SQLITE",
  "GLOBAL_STATE",
  "WORKSPACE_STATE",
  "DRAFT",
  "ATTACHMENT",
  "LOG",
  "CACHE",
  "DOCUMENT_EXTRACTION_CACHE",
  "OCR_CACHE",
  "VECTOR_INDEX",
  "TEMP",
]).annotate({ identifier: "StorageHealth.Category" })
export type Category = typeof Category.Type

export const HealthStatus = Schema.Literals(["HEALTHY", "WARNING", "CRITICAL", "UNKNOWN"]).annotate({
  identifier: "StorageHealth.HealthStatus",
})
export type HealthStatus = typeof HealthStatus.Type

export const DiscoveryStatus = Schema.Literals([
  "DISCOVERED",
  "NOT_DISCOVERED",
  "NOT_APPLICABLE",
  "INACCESSIBLE",
]).annotate({ identifier: "StorageHealth.DiscoveryStatus" })
export type DiscoveryStatus = typeof DiscoveryStatus.Type

export interface LargestItem extends Schema.Schema.Type<typeof LargestItem> {}
export const LargestItem = Schema.Struct({
  path: Schema.String,
  sizeBytes: NonNegativeInt,
  lastModified: NonNegativeInt,
}).annotate({ identifier: "StorageHealth.LargestItem" })

export interface Finding extends Schema.Schema.Type<typeof Finding> {}
export const Finding = Schema.Struct({
  id: Schema.String,
  category: Category,
  path: Schema.String,
  discoveryStatus: DiscoveryStatus,
  sizeBytes: NonNegativeInt,
  objectCount: NonNegativeInt,
  orphanCount: NonNegativeInt,
  orphanCountKnown: Schema.Boolean,
  healthStatus: HealthStatus,
  largestItems: Schema.Array(LargestItem),
  lastModified: NonNegativeInt,
  recommendedAction: Schema.String,
  scannedItems: NonNegativeInt,
  skippedItems: NonNegativeInt,
  truncated: Schema.Boolean,
  errors: Schema.Array(Schema.String),
}).annotate({ identifier: "StorageHealth.Finding" })

export interface Report extends Schema.Schema.Type<typeof Report> {}
export const Report = Schema.Struct({
  version: Schema.Literal(1),
  mode: Schema.Literal("DIAGNOSE"),
  startedAt: NonNegativeInt,
  completedAt: NonNegativeInt,
  durationMs: NonNegativeInt,
  healthStatus: HealthStatus,
  findings: Schema.Array(Finding),
  totalSizeBytes: NonNegativeInt,
  totalObjectCount: NonNegativeInt,
  mutationCount: Schema.Literal(0),
  complete: Schema.Boolean,
}).annotate({ identifier: "StorageHealth.Report" })
