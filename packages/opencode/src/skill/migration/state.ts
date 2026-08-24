import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import path from "node:path"
import type { MigrationState, MigrationStatus } from "./types"
import { MIGRATION_STATE_FILE, BACKUP_DIR_NAME } from "./types"

/**
 * Migration state persistence.
 *
 * State is stored as a JSON file at `<configDir>/.migration-state.json`.
 * This is a process-local cache; the file is the source of truth.
 * The backup directory `<configDir>/.migration-backup/` holds moved assets.
 */

type StateFile = Record<string, MigrationState>

/** Resolve the state file path for a given config directory. */
export function stateFilePath(configDir: string): string {
  return path.join(configDir, MIGRATION_STATE_FILE)
}

/** Resolve the backup root for a given config directory. */
export function backupRoot(configDir: string): string {
  return path.join(configDir, BACKUP_DIR_NAME)
}

/** Load persisted migration state from disk. Returns empty map if file doesn't exist. */
export function load(configDir: string): StateFile {
  const filePath = stateFilePath(configDir)
  if (!existsSync(filePath)) return {}
  try {
    const raw = readFileSync(filePath, "utf-8")
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as StateFile
    }
    return {}
  } catch {
    return {}
  }
}

/** Save migration state to disk. Creates the config directory if needed. */
export function save(configDir: string, state: StateFile): void {
  const filePath = stateFilePath(configDir)
  const dir = path.dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8")
}

/** Get the state for a specific migration. Returns undefined if not tracked. */
export function get(configDir: string, migrationId: string): MigrationState | undefined {
  const file = load(configDir)
  return file[migrationId]
}

/** Update the state for a specific migration. */
export function update(configDir: string, migrationId: string, state: MigrationState): void {
  const file = load(configDir)
  file[migrationId] = state
  save(configDir, file)
}

/** Check if a migration has been completed (terminal state, not re-runnable). */
export function isTerminal(configDir: string, migrationId: string): boolean {
  const s = get(configDir, migrationId)
  if (!s) return false
  return s.status === "completed" || s.status === "skipped_modified" || s.status === "skipped_unknown"
}

/** Check if a migration is in a state where rollback is possible. */
export function canRollback(configDir: string, migrationId: string): boolean {
  const s = get(configDir, migrationId)
  if (!s) return false
  return s.status === "completed" && !!s.backupPath
}

/** Get all tracked migration states. */
export function all(configDir: string): StateFile {
  return load(configDir)
}
