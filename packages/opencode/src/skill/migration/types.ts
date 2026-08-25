/** Directory classification before migration action. */
export type DirectoryClassification =
  | "EXACT_KNOWN_LEGACY_ASSET"
  | "MODIFIED_LEGACY_ASSET"
  | "UNKNOWN_SAME_NAME_ASSET"
  | "ABSENT"

/** Backup retention policy. */
export type BackupPolicy = "restore_on_rollback" | "delete_after_confirm"

/** Single migration entry in the registry. */
export interface MigrationEntry {
  readonly migrationId: string
  readonly targetSkill: string
  readonly targetRelativePath: string
  readonly introducedIn: string
  readonly action: "backup_and_remove"
  readonly expectedFingerprint: FingerprintManifest
  readonly acceptedFingerprints?: readonly FingerprintManifest[]
  readonly backupPolicy: BackupPolicy
  readonly reason: string
  readonly historicalSource: string
}

/** Fingerprint manifest: map of relative paths to SHA-256 hex digests. */
export interface FingerprintManifest {
  readonly [relativePath: string]: string
}

/** Persisted state for one migration. */
export interface MigrationState {
  status: MigrationStatus
  completedAt?: string
  directoryClassification?: DirectoryClassification
  backupPath?: string
}

export type MigrationStatus =
  | "pending"
  | "completed"
  | "skipped_modified"
  | "skipped_unknown"
  | "rolled_back"

/** Result of running one migration entry. */
export interface MigrationResult {
  migrationId: string
  status: MigrationStatus
  directoryClassification: DirectoryClassification
  message?: string
}

/** Name of the backup root directory under `.opencode/`. */
export const BACKUP_DIR_NAME = ".migration-backup"

/** Name of the migration state file under `.opencode/`. */
export const MIGRATION_STATE_FILE = ".migration-state.json"
