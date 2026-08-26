export * as StorageHealthScanner from "./storage-health"

import { lstat, readdir } from "node:fs/promises"
import path from "node:path"
import { StorageHealth } from "@opencode-ai/schema/storage-health"

export type Threshold = {
  readonly warningBytes: number
  readonly criticalBytes: number
  readonly warningObjects: number
  readonly criticalObjects: number
}

export type Policy = Readonly<Record<StorageHealth.Category, Threshold>>

export type Target = {
  readonly id: string
  readonly category: StorageHealth.Category
  readonly path: string
  readonly discoveryStatus?: "NOT_DISCOVERED" | "NOT_APPLICABLE"
  readonly reason?: string
  readonly include?: RegExp
  readonly maxDepth?: number
  readonly maxItems?: number
  readonly timeoutMs?: number
  readonly largestItemLimit?: number
  readonly orphanCount?: number
}

export type Options = {
  readonly policy?: Policy
  readonly clock?: () => number
}

export type Report = StorageHealth.Report

const GiB = 1024 * 1024 * 1024
const MiB = 1024 * 1024
const maximum = Number.MAX_SAFE_INTEGER

// Diagnostic thresholds only. They classify observations and never authorize cleanup.
// Each storage category owns its policy so callers, tests, and future UI cannot drift.
export const defaultPolicy: Policy = {
  SQLITE: threshold(1 * GiB, 5 * GiB, 8, 24),
  GLOBAL_STATE: threshold(32 * MiB, 128 * MiB, 2, 5),
  WORKSPACE_STATE: threshold(64 * MiB, 256 * MiB, 500, 2_000),
  DRAFT: threshold(16 * MiB, 64 * MiB, 50, 200),
  ATTACHMENT: threshold(1 * GiB, 5 * GiB, 10_000, 50_000),
  LOG: threshold(256 * MiB, 1 * GiB, 500, 5_000),
  CACHE: threshold(1 * GiB, 5 * GiB, 100_000, 500_000),
  DOCUMENT_EXTRACTION_CACHE: threshold(1 * GiB, 5 * GiB, 100_000, 500_000),
  OCR_CACHE: threshold(1 * GiB, 5 * GiB, 100_000, 500_000),
  VECTOR_INDEX: threshold(1 * GiB, 5 * GiB, 100_000, 500_000),
  TEMP: threshold(512 * MiB, 2 * GiB, 10_000, 100_000),
}

export async function scan(targets: readonly Target[], options: Options = {}): Promise<Report> {
  const clock = options.clock ?? Date.now
  const startedAt = Math.trunc(clock())
  const findings: StorageHealth.Finding[] = []
  // Run roots sequentially so diagnostics cannot create a burst across large disks.
  for (const target of targets) findings.push(await scanTarget(target, options.policy ?? defaultPolicy, clock))
  const completedAt = Math.trunc(clock())
  const healthStatus = overall(findings)

  return {
    version: 1,
    mode: "DIAGNOSE",
    startedAt,
    completedAt,
    durationMs: Math.max(0, completedAt - startedAt),
    healthStatus,
    findings,
    totalSizeBytes: findings.reduce((total, finding) => total + finding.sizeBytes, 0),
    totalObjectCount: findings.reduce((total, finding) => total + finding.objectCount, 0),
    mutationCount: 0,
    complete: findings.every((finding) => !finding.truncated && finding.errors.length === 0),
  }
}

function threshold(warningBytes: number, criticalBytes: number, warningObjects = maximum, criticalObjects = maximum) {
  return { warningBytes, criticalBytes, warningObjects, criticalObjects }
}

async function scanTarget(target: Target, policy: Policy, clock: () => number): Promise<StorageHealth.Finding> {
  if (target.discoveryStatus) return unavailable(target)

  const startedAt = clock()
  const limits = {
    maxDepth: Math.max(0, target.maxDepth ?? 3),
    maxItems: Math.max(1, target.maxItems ?? 10_000),
    timeoutMs: Math.max(1, target.timeoutMs ?? 5_000),
    largestItemLimit: Math.max(1, target.largestItemLimit ?? 10),
  }
  const state = {
    sizeBytes: 0,
    objectCount: 0,
    scannedItems: 0,
    skippedItems: 0,
    lastModified: 0,
    truncated: false,
    errors: [] as string[],
    largestItems: [] as StorageHealth.LargestItem[],
  }
  const root = await lstat(target.path).then(
    (info) => ({ info }),
    (error: unknown) => ({ error }),
  )
  if ("error" in root) return inaccessible(target, root.error)
  if (root.info.isSymbolicLink()) return inaccessible(target, new Error("root is a symbolic link or reparse point"))

  if (root.info.isFile()) {
    state.scannedItems = 1
    if (matches(target, path.basename(target.path))) addFile(state, target.path, root.info, limits.largestItemLimit)
    return finding(target, policy, state, "DISCOVERED")
  }
  if (!root.info.isDirectory()) return inaccessible(target, new Error("target is not a regular file or directory"))

  const pending = [{ path: target.path, relative: "", depth: 0 }]
  while (pending.length > 0) {
    if (clock() - startedAt >= limits.timeoutMs || state.scannedItems >= limits.maxItems) {
      state.truncated = true
      break
    }

    const current = pending.shift()!
    const entries = await readdir(current.path, { withFileTypes: true }).then(
      (items) => ({ items }),
      (error: unknown) => ({ error }),
    )
    if ("error" in entries) {
      addError(state, current.path, entries.error)
      continue
    }

    for (const entry of entries.items) {
      if (state.scannedItems >= limits.maxItems || clock() - startedAt >= limits.timeoutMs) {
        state.truncated = true
        break
      }

      state.scannedItems++
      const absolute = path.join(current.path, entry.name)
      const relative = current.relative ? path.join(current.relative, entry.name) : entry.name
      const info = await lstat(absolute).then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      )
      if ("error" in info) {
        addError(state, absolute, info.error)
        continue
      }
      if (info.value.isSymbolicLink()) {
        state.skippedItems++
        continue
      }
      if (info.value.isDirectory()) {
        if (current.depth < limits.maxDepth) pending.push({ path: absolute, relative, depth: current.depth + 1 })
        else state.skippedItems++
        continue
      }
      if (!info.value.isFile() || !matches(target, relative)) continue
      addFile(state, absolute, info.value, limits.largestItemLimit)
    }
  }

  return finding(target, policy, state, "DISCOVERED")
}

function unavailable(target: Target): StorageHealth.Finding {
  return {
    id: target.id,
    category: target.category,
    path: target.path,
    discoveryStatus: target.discoveryStatus!,
    sizeBytes: 0,
    objectCount: 0,
    orphanCount: target.orphanCount ?? 0,
    orphanCountKnown: target.orphanCount !== undefined,
    healthStatus: "UNKNOWN",
    largestItems: [],
    lastModified: 0,
    recommendedAction: target.reason ?? "Storage location is not available; no path was guessed.",
    scannedItems: 0,
    skippedItems: 0,
    truncated: false,
    errors: [],
  }
}

function inaccessible(target: Target, error: unknown): StorageHealth.Finding {
  const missing = code(error) === "ENOENT"
  return {
    ...unavailable({ ...target, discoveryStatus: missing ? "NOT_DISCOVERED" : "NOT_APPLICABLE" }),
    discoveryStatus: missing ? "NOT_DISCOVERED" : "INACCESSIBLE",
    recommendedAction: missing
      ? "Storage location was not discovered; no path was created."
      : "Storage location could not be inspected; review permissions or path safety.",
    errors: missing ? [] : [describe(error)],
  }
}

function finding(
  target: Target,
  policy: Policy,
  state: {
    sizeBytes: number
    objectCount: number
    scannedItems: number
    skippedItems: number
    lastModified: number
    truncated: boolean
    errors: string[]
    largestItems: StorageHealth.LargestItem[]
  },
  discoveryStatus: StorageHealth.DiscoveryStatus,
): StorageHealth.Finding {
  const healthStatus = classify(state, policy[target.category])
  return {
    id: target.id,
    category: target.category,
    path: target.path,
    discoveryStatus,
    sizeBytes: state.sizeBytes,
    objectCount: state.objectCount,
    orphanCount: target.orphanCount ?? 0,
    orphanCountKnown: target.orphanCount !== undefined,
    healthStatus,
    largestItems: state.largestItems,
    lastModified: state.lastModified,
    recommendedAction: recommendation(healthStatus, state.truncated, state.errors.length > 0),
    scannedItems: state.scannedItems,
    skippedItems: state.skippedItems,
    truncated: state.truncated,
    errors: state.errors,
  }
}

function addFile(
  state: {
    sizeBytes: number
    objectCount: number
    lastModified: number
    largestItems: StorageHealth.LargestItem[]
  },
  target: string,
  info: { size: number; mtimeMs: number },
  limit: number,
) {
  const item = {
    path: target,
    sizeBytes: Math.max(0, Math.trunc(info.size)),
    lastModified: Math.max(0, Math.trunc(info.mtimeMs)),
  }
  state.sizeBytes += item.sizeBytes
  state.objectCount++
  state.lastModified = Math.max(state.lastModified, item.lastModified)
  state.largestItems.push(item)
  state.largestItems.sort((a, b) => b.sizeBytes - a.sizeBytes || a.path.localeCompare(b.path))
  if (state.largestItems.length > limit) state.largestItems.length = limit
}

function addError(state: { errors: string[]; skippedItems: number }, target: string, error: unknown) {
  state.skippedItems++
  if (state.errors.length >= 20) return
  state.errors.push(`${target}: ${describe(error)}`)
}

function matches(target: Target, relative: string) {
  if (!target.include) return true
  target.include.lastIndex = 0
  return target.include.test(relative.replaceAll("\\", "/"))
}

function classify(
  state: { sizeBytes: number; objectCount: number; truncated: boolean; errors: string[] },
  policy: Threshold,
): StorageHealth.HealthStatus {
  if (state.sizeBytes >= policy.criticalBytes || state.objectCount >= policy.criticalObjects) return "CRITICAL"
  if (state.sizeBytes >= policy.warningBytes || state.objectCount >= policy.warningObjects) return "WARNING"
  if (state.truncated || state.errors.length > 0) return "WARNING"
  return "HEALTHY"
}

function recommendation(status: StorageHealth.HealthStatus, truncated: boolean, errors: boolean) {
  if (truncated || errors) return "Review the partial scan and rerun with an explicitly approved larger bound; no cleanup was performed."
  if (status === "CRITICAL")
    return "Review the largest items and prepare a separately approved maintenance plan; no cleanup was performed."
  if (status === "WARNING") return "Monitor growth and review the largest items; no cleanup was performed."
  return "No action recommended; continue read-only monitoring."
}

function overall(findings: readonly StorageHealth.Finding[]): StorageHealth.HealthStatus {
  const discovered = findings.filter((finding) => finding.discoveryStatus === "DISCOVERED")
  if (discovered.some((finding) => finding.healthStatus === "CRITICAL")) return "CRITICAL"
  if (discovered.some((finding) => finding.healthStatus === "WARNING")) return "WARNING"
  if (discovered.some((finding) => finding.healthStatus === "HEALTHY")) return "HEALTHY"
  return "UNKNOWN"
}

function code(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return
  return typeof error.code === "string" ? error.code : undefined
}

function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
