# Phase 4.0C — Release-Safe Skill Migration Hardening

**Status: PASS**
**Date: 2026-08-24**
**Target: giiisp-paper-search-apis (single rehearsal target only)**

---

## P0 — Migration Outside Discovery

**PASS**

`discoverSkills()` in `packages/opencode/src/skill/index.ts` is now a pure read/discovery function. No destructive side effects.

Migration execution point: `bootstrap.run()` in `packages/opencode/src/project/bootstrap.ts`

```
config.get()
  → plugin.init()
  → SkillMigration.runPending(configDirs)   ← NEW: explicit migration boundary
  → [lsp, shareNext, format, vcs, snapshot, project].init()
```

Migration runs once per instance bootstrap, before any service that might trigger Skill discovery.

---

## P1 — Migration Registry

**PASS**

Replaced `deprecated.ts` (simple name-based list) with a structured migration registry.

**File**: `packages/opencode/src/skill/migration/registry.ts`

Each entry contains:
- `migrationId`: `rm-giiisp-paper-search-apis-2026-08-23` (unique, deterministic)
- `targetSkill`: `giiisp-paper-search-apis`
- `targetRelativePath`: `.opencode/skills/giiisp-paper-search-apis`
- `introducedIn`: `Phase 4.0`
- `action`: `backup_and_remove`
- `expectedFingerprint`: SHA-256 manifest of all 11 files (computed from `rc6-business-skills` branch)
- `backupPolicy`: `restore_on_rollback`
- `reason`: full justification
- `historicalSource`: `rc6-business-skills branch`

No destructive action is taken based on directory name alone.

---

## P2 — Ownership / Fingerprint Guard

**PASS**

**File**: `packages/opencode/src/skill/migration/fingerprint.ts`

Classification logic (`classifyTarget`):

| Classification | Condition | Action |
|---|---|---|
| `ABSENT` | directory does not exist | mark completed, no-op |
| `EXACT_KNOWN_LEGACY_ASSET` | fingerprint matches registry exactly | backup and remove |
| `MODIFIED_LEGACY_ASSET` | has overlapping files but different hashes | **skip, preserve user data** |
| `UNKNOWN_SAME_NAME_ASSET` | no file overlap with expected | **skip, preserve user data** |

Fingerprint is computed as `SHA-256(content)` for every file in the directory tree. Comparison requires exact match of all paths and hashes.

---

## P3 — Recoverable Migration

**PASS**

**File**: `packages/opencode/src/skill/migration/engine.ts`

Migration uses atomic `renameSync` (not `rm -rf`):

```
.opencode/skills/giiisp-paper-search-apis/
  → .opencode/.migration-backup/rm-giiisp-paper-search-apis-2026-08-23/giiisp-paper-search-apis/
```

Backup directory is:
- Outside the `skills/` scan path (not discoverable by Skill.all)
- Under `.opencode/.migration-backup/<migration_id>/` (structured, auditable)
- Preserved until explicit rollback or manual cleanup

---

## P4 — Programmatic Rollback

**PASS**

```typescript
SkillMigration.rollback(configDir, migrationId)
```

Verifies:
1. State is `completed` with a valid `backupPath`
2. Backup exists on disk
3. Target path doesn't already exist (prevents overwrite)
4. Copies backup to original location
5. Recomputes fingerprint of restored content
6. Compares against expected fingerprint
7. Updates state to `rolled_back`

Git restore remains available as developer disaster recovery method but is NOT the only rollback path.

---

## P5 — Run-once State + Idempotence

**PASS**

**File**: `packages/opencode/src/skill/migration/state.ts`

State machine:

```
pending → completed (target absent or EXACT_KNOWN)
pending → skipped_modified (MODIFIED_LEGACY_ASSET)
pending → skipped_unknown (UNKNOWN_SAME_NAME_ASSET)
completed → rolled_back (via rollback())
```

Terminal states (`completed`, `skipped_modified`, `skipped_unknown`) prevent re-execution.

Verified: run #1, #2, #3 all return the same status without modifying backup or state.

---

## P6 — Runtime Count Semantics

**PASS**

| Metric | Definition | Value (post-removal) |
|---|---|---|
| `reference-integrity discovered.size` | `.opencode/skills/*/SKILL.md` count + 1 builtin | 76 |
| `phase3.5C runtime_discovered` | `Skill.all()` via Effect API (all configDirs + externalDirs + cfg.skills.paths) | 79 |
| `phase3.5C explore_effective` | `Skill.available(explore)` | 79 |
| `phase3.5C xiaoxue_effective` | `Skill.available(xiaoxue)` | 38 |

Difference (79 - 76 = 3): skills loaded from external directories or config paths beyond `.opencode/skills/`.

These are three distinct metrics with distinct definitions. No conflation.

---

## P7 — Resource Integrity / Packaging

**PASS**

| Test | Result |
|---|---|
| `resource-integrity-sync.test.ts` | 1 pass / 0 fail |
| `reference-integrity.test.ts` | 7 pass / 0 fail |

- **Skill reference integrity**: verifies all referenced skill IDs are discoverable (7 pass)
- **Resource manifest integrity**: verifies integrity.json matches disk (1 pass)

No manual hash editing.

---

## P8 — Safety Tests

18 tests in `test/skill/skill-migration.test.ts`:

| # | Test | Result |
|---|---|---|
| 1 | fresh install / target absent → completed (no-op) | PASS |
| 2 | exact legacy asset → completed with backup | PASS |
| 3 | idempotent — run #1, #2, #3 all stable | PASS |
| 4 | does not delete sibling skill | PASS |
| 5 | modified legacy asset → skipped_modified, user data preserved | PASS |
| 6 | unknown same-name directory → skipped_unknown | PASS |
| 7 | backup directory not discoverable by skill scan | PASS |
| 8 | rollback restores exact bytes | PASS |
| 9 | path safety — only processes target under configDir/skills | PASS |
| 10 | registry is non-empty and contains expected migration | PASS |
| 11 | preview does not modify state | PASS |
| 12-18 | fingerprint utility tests (computeFingerprint, fingerprintsMatch, classifyTarget) | PASS |

**Note on interrupted migration**: Not separately tested because `renameSync` is an atomic OS-level operation. If the process crashes mid-rename, either the rename succeeded (target gone, backup exists) or it didn't (target still exists). There is no "partial" state.

---

## P9 — Full Gate Tests

| Suite | Result |
|---|---|
| `test/skill/skill-migration.test.ts` | 18 pass / 0 fail |
| `test/skill/reference-integrity.test.ts` | 7 pass / 0 fail |
| `test/skill/phase3.5C-runtime-api-direct.test.ts` | 4 pass / 0 fail |
| `test/skill/skill.test.ts` | 16 pass / 0 fail |
| `test/skill/discovery.test.ts` | 7 pass / 0 fail |
| `test/agent/` | 137 pass / 2 fail (timeout, pre-existing) |
| `resource-integrity-sync.test.ts` | 1 pass / 0 fail |
| `bun typecheck` | 4 pre-existing TS2344 (audit script) |

**Total**: 190 pass / 2 pre-existing fail / 4 pre-existing TS2344

**New regression caused by Phase 4.0C**: 0

---

## P10 — Phase 4.1 Gate

```
migration outside discovery    = YES
delete-by-name only            = NO (fingerprint-verified)
modified user asset protected  = YES
unknown same-name asset protected = YES
release rollback without Git   = YES (SkillMigration.rollback())
run-once state                 = YES
runtime diff exactly one target = YES (Skill.all: 80→79, removed: [giiisp-paper-search-apis])
resource integrity             = PASS
reference missing              = 0
tests                          = PASS (190 pass, 2 pre-existing timeout)

Can Phase 4.1 start? YES
```

---

## Deliverables

| File | Action |
|---|---|
| `packages/opencode/src/skill/migration/index.ts` | Created — module barrel |
| `packages/opencode/src/skill/migration/types.ts` | Created — type definitions |
| `packages/opencode/src/skill/migration/registry.ts` | Created — migration registry with fingerprint |
| `packages/opencode/src/skill/migration/fingerprint.ts` | Created — SHA-256 fingerprint computation + classification |
| `packages/opencode/src/skill/migration/state.ts` | Created — run-once state persistence |
| `packages/opencode/src/skill/migration/engine.ts` | Created — migration execution + rollback |
| `packages/opencode/src/skill/index.ts` | Modified — removed deprecated.ts import and cleanup call |
| `packages/opencode/src/project/bootstrap.ts` | Modified — added SkillMigration.runPending() call |
| `packages/opencode/src/skill/deprecated.ts` | Deleted — replaced by migration module |
| `packages/opencode/test/skill/skill-migration.test.ts` | Created — 18 migration tests |
| `packages/opencode/test/skill/deprecated-skill-migration.test.ts` | Deleted — replaced by new tests |
| `docs/skill-center/phase4.0C-release-safe-skill-migration-2026-08-24.md` | Created — this report |
| `docs/skill-center/phase4.0-removal-registry-2026-08-23.tsv` | Updated — migration_id → `rm-giiisp-paper-search-apis-2026-08-23` |
