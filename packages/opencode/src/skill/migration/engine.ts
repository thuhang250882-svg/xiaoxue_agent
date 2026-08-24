import { existsSync, mkdirSync, renameSync, readdirSync, copyFileSync } from "node:fs"
import path from "node:path"
import { ENTRIES } from "./registry"
import { classifyTarget, computeFingerprint, fingerprintsMatch } from "./fingerprint"
import * as State from "./state"
import type { MigrationResult } from "./types"
import { FSUtil } from "@opencode-ai/core/fs-util"

/**
 * Run all pending migrations for the given config directories.
 *
 * This MUST be called from the application startup/upgrade phase,
 * BEFORE any skill discovery occurs. It is NOT part of discovery semantics.
 *
 * Safety guarantees:
 * - Only acts on directories matching EXACT_KNOWN_LEGACY_ASSET fingerprint
 * - Modified or unknown directories are skipped with a warning
 * - Assets are moved to .migration-backup/, never permanently deleted
 * - Run-once: completed/skipped migrations are not re-executed
 * - Idempotent: safe to call on every startup
 */
export function runPending(configDirs: readonly string[]): MigrationResult[] {
  const results: MigrationResult[] = []
  for (const configDir of configDirs) {
    for (const entry of ENTRIES) {
      results.push(runOne(configDir, entry.migrationId))
    }
  }
  return results
}

/**
 * Run a single migration for one config directory.
 * Exported for testing and direct invocation.
 */
export function runOne(configDir: string, migrationId: string): MigrationResult {
  const entry = ENTRIES.find((e) => e.migrationId === migrationId)
  if (!entry) {
    return {
      migrationId,
      status: "pending",
      directoryClassification: "ABSENT",
      message: `Migration ${migrationId} not found in registry`,
    }
  }

  // Run-once: skip if already in a terminal state
  if (State.isTerminal(configDir, migrationId)) {
    const existing = State.get(configDir, migrationId)
    return {
      migrationId,
      status: existing!.status,
      directoryClassification: existing!.directoryClassification ?? "ABSENT",
      message: `Already ${existing!.status}`,
    }
  }

  const targetPath = path.join(configDir, entry.targetRelativePath)
  const classification = classifyTarget(targetPath, entry.expectedFingerprint)

  if (classification === "ABSENT") {
    State.update(configDir, migrationId, {
      status: "completed",
      completedAt: new Date().toISOString(),
      directoryClassification: "ABSENT",
    })
    return { migrationId, status: "completed", directoryClassification: "ABSENT", message: "Target absent, no-op" }
  }

  if (classification === "MODIFIED_LEGACY_ASSET") {
    State.update(configDir, migrationId, {
      status: "skipped_modified",
      completedAt: new Date().toISOString(),
      directoryClassification: "MODIFIED_LEGACY_ASSET",
    })
    return {
      migrationId,
      status: "skipped_modified",
      directoryClassification: "MODIFIED_LEGACY_ASSET",
      message: "Directory has been modified locally; skipping automatic migration to preserve user changes",
    }
  }

  if (classification === "UNKNOWN_SAME_NAME_ASSET") {
    State.update(configDir, migrationId, {
      status: "skipped_unknown",
      completedAt: new Date().toISOString(),
      directoryClassification: "UNKNOWN_SAME_NAME_ASSET",
    })
    return {
      migrationId,
      status: "skipped_unknown",
      directoryClassification: "UNKNOWN_SAME_NAME_ASSET",
      message: "Directory does not match known legacy fingerprint; skipping to prevent data loss",
    }
  }

  // EXACT_KNOWN_LEGACY_ASSET: proceed with backup-and-remove
  const backupDir = path.join(State.backupRoot(configDir), migrationId)
  const backupTarget = path.join(backupDir, entry.targetSkill)

  // Safety: ensure target is under configDir/.opencode/skills
  // (Phase 4.0D path-safety fix: HEAD-level framework used `skills/` which
  // never matches the actual target root `.opencode/skills/`. With EXACT
  // fingerprint matching against rc6 sources, the check is reachable and
  // must point at the real discovery root.)
  const skillsDir = path.join(configDir, ".opencode", "skills")
  const resolvedTarget = path.resolve(targetPath)
  if (!FSUtil.contains(skillsDir, resolvedTarget)) {
    return {
      migrationId,
      status: "pending" as const,
      directoryClassification: classification,
      message: "Path safety check failed: target is not under .opencode/skills directory",
    }
  }

  // Atomic move: rename target → backup
  // Defense in depth: refuse to overwrite an existing backup. This guards
  // against any future state-machine bug that could cause silent data loss.
  if (existsSync(backupTarget)) {
    return {
      migrationId,
      status: "skipped_modified" as const,
      directoryClassification: classification,
      message: `Backup already exists at ${path.relative(configDir, backupTarget)}; refusing to overwrite`,
    }
  }
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true })
  renameSync(resolvedTarget, backupTarget)

  State.update(configDir, migrationId, {
    status: "completed",
    completedAt: new Date().toISOString(),
    directoryClassification: classification,
    backupPath: backupTarget,
  })

  return {
    migrationId,
    status: "completed" as const,
    directoryClassification: classification,
    message: `Moved to ${path.relative(configDir, backupTarget)}`,
  }
}

/**
 * Roll back a completed migration: restore backup to original location.
 *
 * Returns true if rollback succeeded (target restored byte-for-byte),
 * false if rollback was not possible.
 */
export function rollback(configDir: string, migrationId: string): MigrationResult {
  const entry = ENTRIES.find((e) => e.migrationId === migrationId)
  if (!entry) {
    return {
      migrationId,
      status: "pending",
      directoryClassification: "ABSENT",
      message: `Migration ${migrationId} not found in registry`,
    }
  }

  if (!State.canRollback(configDir, migrationId)) {
    const existing = State.get(configDir, migrationId)
    return {
      migrationId,
      status: existing?.status ?? "pending",
      directoryClassification: existing?.directoryClassification ?? "ABSENT",
      message: "Migration is not in a rollback-able state",
    }
  }

  const state = State.get(configDir, migrationId)!
  const backupPath = state.backupPath!
  const targetPath = path.join(configDir, entry.targetRelativePath)

  if (!existsSync(backupPath)) {
    return {
      migrationId,
      status: state.status,
      directoryClassification: state.directoryClassification ?? "ABSENT",
      message: "Backup directory not found on disk",
    }
  }

  // Check target doesn't already exist at destination
  if (existsSync(targetPath)) {
    return {
      migrationId,
      status: state.status,
      directoryClassification: "UNKNOWN_SAME_NAME_ASSET",
      message: "Target path already exists; cannot restore without manual intervention",
    }
  }

  // Restore: copy backup to target, then remove backup entry
  copyDirSync(backupPath, targetPath)

  // Verify byte-for-byte by recomputing fingerprint
  const restored = computeFingerprint(targetPath)
  const fpMatch = fingerprintsMatch(restored, entry.expectedFingerprint)

  State.update(configDir, migrationId, {
    status: "rolled_back",
    completedAt: new Date().toISOString(),
    directoryClassification: fpMatch ? "EXACT_KNOWN_LEGACY_ASSET" : "MODIFIED_LEGACY_ASSET",
    backupPath: undefined,
  })

  return {
    migrationId,
    status: "rolled_back",
    directoryClassification: fpMatch ? "EXACT_KNOWN_LEGACY_ASSET" : "MODIFIED_LEGACY_ASSET",
    message: fpMatch ? "Restored from backup, fingerprint verified" : "Restored from backup, fingerprint mismatch (files may have been modified)",
  }
}

/**
 * Preview what would happen without executing.
 */
export function preview(configDirs: readonly string[]): Array<{ configDir: string; result: MigrationResult }> {
  const out: Array<{ configDir: string; result: MigrationResult }> = []
  for (const configDir of configDirs) {
    for (const entry of ENTRIES) {
      const targetPath = path.join(configDir, entry.targetRelativePath)
      const classification = classifyTarget(targetPath, entry.expectedFingerprint)
      const existing = State.get(configDir, entry.migrationId)
      out.push({
        configDir,
        result: {
          migrationId: entry.migrationId,
          status: existing?.status ?? "pending",
          directoryClassification: classification,
          message: existing ? `State: ${existing.status}` : "Would run",
        },
      })
    }
  }
  return out
}

/** Recursive synchronous directory copy. */
function copyDirSync(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else if (entry.isFile()) {
      copyFileSync(srcPath, destPath)
    }
  }
}
