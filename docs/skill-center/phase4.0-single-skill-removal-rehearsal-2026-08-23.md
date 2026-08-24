# Phase 4.0 — Single-Skill Platform Removal Rehearsal: giiisp-paper-search-apis

**Status: Runtime Removal Rehearsal = PASS | Durable Removal = PASS (Phase 4.0A) | Full Rollback Verified = PASS (Phase 4.0A) | Migration = PASS (Phase 4.0B) | Release-Safe Migration = PASS (Phase 4.0C)**
**Date: 2026-08-23**
**Target: giiisp-paper-search-apis**
**Approval source: Phase 3.5F decision pack (REMOVE_WITH_APPROVAL, user approved Phase 4.0)**

> **Note**: Xiaoxue = 38 is the post-Phase 3.5E tender-bid-generation baseline, unrelated to giiisp removal.
> giiisp was never in the xiaoxue allowlist.

---

## P0 — Pre-removal Snapshot

| Dimension | Value | Source |
|---|---|---|
| runtime_directory_skill_count | 87 | physical `.opencode/skills/*/SKILL.md` dirs |
| runtime_discovered_count | 80 | `Skill.all()` (pre) |
| explore_effective_count | 80 | `Skill.available(explore)` (pre) |
| xiaoxue_effective_count | 38 | `Skill.available(xiaoxue)` (pre) |
| target_in_skill_all | true | pre |
| target_explore_reachable | true | pre |
| target_xiaoxue_reachable | false | pre |
| target_physical_present | true | pre |
| package_tracked | false | `package.json` has no giiisp ref |
| integrity_manifest_entries | 11 | `packages/desktop/resources/integrity.json` |

Canonical portfolio: L4 — DISABLE_ARCHIVE (skill-portfolio-inventory-2026-08-22.tsv row 39)

---

## P1 — Dependency Audit

| Region | giiisp-paper-search-apis refs | Conclusion |
|---|---|---|
| `packages/opencode/src/` | 0 | no production consumer |
| `packages/opencode/test/` | 0 (excluding our own phase4.0 test) | no test dependency |
| `configs/xiaoxue/` | 0 | no allowlist / router / skills.yaml ref |
| `agent.ts` | 0 | no xiaoxue allow / subagent ref |
| `xiaoxue-router.ts` | 0 | no router rule |
| `package.json` | 0 | not tracked |
| `packages/desktop/resources/integrity.json` | 11 | pre-P4 snapshot, regenerated in P4 |
| docs/skill-center/ (audit history) | many | historical audit trail, not runtime |
| scripts/ (Phase 3.5 audit scripts) | 2 | literal strings in phase3.5C-1 + phase3.5D, not consumers |
| `.opencode/skills/` (self) | 1 directory (11 files) | the skill itself |

**PASS — no real consumer found.**

---

## P2 — Removal Method

- Physical deletion via `Remove-Item -Recurse -Force` (PowerShell)
- The directory was **gitignored** (`.opencode/.gitignore:8: skills/`), never tracked
- `git ls-tree -r HEAD --name-only` confirms 0 tracked giiisp files
- Only `Remove-Item` was needed; no `git rm` required

**Shared assets preserved**: NONE — all 11 files were exclusive to this skill.

---

## P3 — Canonical Portfolio Status

Final status: **PLATFORM_REMOVED_WITH_APPROVAL**

Registry record created:
- `docs/skill-center/phase4.0-removal-registry-2026-08-23.tsv`
- Fields: skill_name, final_status, removal_phase, removal_date, reason, replacement, rollback_path, approval_source, recovery_cost, overlap completeness

---

## P4 — integrity.json Regeneration

- Generator: `bun packages/desktop/scripts/generate-resource-integrity.ts`
- Guard test: `bun test src/main/resource-integrity-sync.test.ts` → **1 pass / 0 fail**
- giiisp entries in integrity.json: **11 → 0** (verified via grep)

---

## P5 — Runtime Truth

### Before (from phase4.0-runtime-snapshot-pre2026-08-23.json)

| Metric | Value |
|---|---|
| runtime_discovered_count | 80 |
| explore_effective_count | 80 |
| xiaoxue_effective_count | 38 |
| target_in_skill_all | true |
| target_explore_reachable | true |
| target_xiaoxue_reachable | false |
| target_physical_present | true |
| runtime_directory_skill_count | 87 |

### After (from phase4.0-runtime-snapshot-post2026-08-23.json)

| Metric | Value |
|---|---|
| runtime_discovered_count | **79** |
| explore_effective_count | **79** |
| xiaoxue_effective_count | 38 (unchanged) |
| target_in_skill_all | **false** |
| target_explore_reachable | **false** |
| target_xiaoxue_reachable | false |
| target_physical_present | **false** |
| runtime_directory_skill_count | **86** |

### Name Diff

- **removed**: `["giiisp-paper-search-apis"]`
- **added**: `[]`

---

## P6 — Reference Integrity

- stale allowlist: 0
- stale router (router.md / xiaoxue-router.ts): 0
- stale Skill reference (in src/): 0
- stale package manifest entry: 0
- integrity.json giiisp entries: 0
- inter-skill refs in `.opencode/skills/`: 0 (sci-employee-deep-research references `giiisp.com` API URL, not the skill)

**missing = 0**

---

## P7 — Regression Tests

| Suite | Result | Notes |
|---|---|---|
| `test/agent/` (agent, router, plan-mode, plugin) | 146 pass / 0 fail / 408 expect | full agent suite |
| `test/skill/reference-integrity.test.ts` | 7 pass / 0 fail / 54 expect | updated count 77→76 |
| `test/skill/phase3.5C-runtime-api-direct.test.ts` | 4 pass / 0 fail | snapshot captured correctly with 86 SKILL.md |
| `test/skill/phase3-snapshot.test.ts` | 3 pass / 0 fail | Phase 3.0/3.1 |
| `test/skill/phase31a-internal-specialist.test.ts` | 6 pass / 0 fail | internal specialist surface |
| `test/skill/discovery.test.ts` | 7 pass / 0 fail | skill discovery |
| `test/skill/skill.test.ts` | 16 pass / 1 fail (EFAULT) | pre-existing Windows SQLite WAL EFAULT |
| `packages/desktop resource-integrity-sync` | 1 pass / 0 fail | integrity.json matches disk |
| `bun typecheck` | 4 pre-existing TS2344 | phase3.5C-1 audit script, not production |

**Pre-existing blocker (NOT caused by removal)**:
- `test/skill/skill.test.ts` unnamed hook EFAULT: Windows SQLite WAL handle cleanup race (known, documented)
- `script/phase3.5C-1-identity-and-archive-gate.ts` 4× TS2344: generic constraint in Phase 3.5 audit script (known, documented)

**New test regression caused by removal**: 0 (reference-integrity count updated from 77→76)

---

## P8 — Rollback Proof

| Asset | Git Status | Rollback Command |
|---|---|---|
| `packages/desktop/resources/integrity.json` | tracked | `git restore packages/desktop/resources/integrity.json` |
| `.opencode/skills/giiisp-paper-search-apis/` (11 files) | gitignored, never tracked on dev | `bun -e "..."` (see below) |

**Phase 4.0A verified rollback path**:

Restore skill files from rc6 branch (they exist in `rc6-business-skills` branch as git-tracked content):
```powershell
bun -e "
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const files = ['SKILL.md','ACCEPTANCE.md','agents/openai.yaml','examples/end_to_end_example.json','examples/failure_response_examples.json','examples/normalized_result_example.json','examples/request_matrix.json','scripts/dry_run_paper_search.py','scripts/progressive_paper_search.py','tests/test_dry_run_paper_search.py','tests/test_progressive_paper_search.py'];
const base = '.opencode/skills/giiisp-paper-search-apis';
for (const f of files) {
  const dir = path.dirname(path.join(base, f));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(base, f), execSync('git show rc6-business-skills:.opencode/skills/giiisp-paper-search-apis/' + f));
}
console.log('Restored', files.length, 'files');
"
```

Then regenerate integrity.json:
```powershell
bun packages/desktop/scripts/generate-resource-integrity.ts
```

**Why `git checkout` doesn't work**: `.opencode/.gitignore:8: skills/` prevents `git checkout` from creating gitignored paths. Must use `git show` to extract raw content.

**Note**: The directory was gitignored from the beginning (`.opencode/.gitignore:8: skills/`). It was force-committed to `rc6-*` branches for release packaging but never merged to `dev`.

---

## P9 — Commit

Not committed (rehearsal mode). Recommended commit when ready:
```
chore(skills): remove approved giiisp paper search skill

Phase 4.0 removal of giiisp-paper-search-apis per Phase 3.5F
REMOVE_WITH_APPROVAL decision. Skill was L4 DISABLE_ARCHIVE,
no production consumers, superseded by deep-research (NEAR_COMPLETE
overlap). Recovery cost: MEDIUM (requires GIIISP_AUTH_TOKEN + 5
endpoint templates).

docs(skills): record phase 4.0 single-skill removal rehearsal
```

---

## P10 — Final Report

```
Phase 4.0: PASS (with Phase 4.0A Durable Removal & Rollback Closeout)

Removed:
  giiisp-paper-search-apis

Before:
  Skill.all             = 80
  Explore               = 80
  Xiaoxue               = 38 (Phase 3.5E baseline, unrelated to giiisp)
  physical SKILL.md     = 87 dirs
  integrity missing     = 0

After:
  Skill.all             = 79
  Explore               = 79
  Xiaoxue               = 38 (unchanged — giiisp was never in xiaoxue)
  physical SKILL.md     = 86 dirs
  integrity missing     = 0

Runtime name diff:
  removed = ["giiisp-paper-search-apis"]
  added   = []

Count semantics (Phase 4.0A clarified):
  physical SKILL.md dirs:     87 → 86   (filesystem)
  simulated_disk_config_count: 77 → 76   (reference-integrity.test.ts)
  runtime Skill.all:          80 → 79   (Effect runtime API)
  Three distinct metrics — must not conflate.

Source of truth:
  SOURCE_OF_TRUTH = LOCAL_ONLY
  REAPPEARS_ON_FRESH_ENV = NO
  Reason: .opencode/skills/ is gitignored on dev; no install/sync/copy mechanism exists.
  The files were force-committed to rc6-* branches only (release packaging).

Durable removal mechanism:
  - Physical deletion: Remove-Item -Recurse -Force (skill directory, gitignored)
  - Tracked change: integrity.json regeneration (11 entries removed, tracked in git)
  - No automated mechanism exists to restore the skill directory

Git tracked removal proof:
  git diff HEAD -- packages/desktop/resources/integrity.json shows 11 deleted entries
  This is the only tracked change needed — skill directory was never tracked on dev.

Rollback verified (Phase 4.0A):
  removed → restored = PASS (git show rc6-business-skills + bun extraction + integrity regen)
  restored → removed = PASS (Remove-Item + integrity regen)
  After restore: Skill.all=80, Explore=80, target_in_all=true, missing=0
  After re-delete: Skill.all=79, Explore=79, target_in_all=false, missing=0

Explicit consumers before removal  = 0
Shared assets preserved            = N/A (all files exclusive)
Integrity regenerated              = YES (generator + guard pass)
Tests                              = 146+7+4+3+6+7+16+1 pass, 1 pre-existing EFAULT, 4 pre-existing TS2344
Rollback verified                  = PASS (bidirectional)

Unexpected regressions             = NONE
Canonical lifecycle state          = PLATFORM_REMOVED_WITH_APPROVAL
Phase 4.1 recommendation           = Await product approval for sci-employee-deep-research (second REMOVE_WITH_APPROVAL candidate) or other KEEP/DEFER decisions
```

---

## Phase 4.0B — Durable Skill Removal Migration

**Status: PASS**
**Date: 2026-08-23**
**Migration target: giiisp-paper-search-apis only**

### P0 — Existing Migration Mechanism

EXISTING_MIGRATION_MECHANISM = NO for skills.

- `packages/desktop/src/main/migrate.ts` — Tauri→Electron store migration (not reusable)
- `packages/desktop/src/main/store-cleanup.ts` — stale draft cleanup (not reusable)
- `packages/desktop/src/main/index.ts` — startup: `migrate()` → `cleanupStoreFiles()` (not for skills)
- Plugin `deprecated` flag in `packages/opencode/src/plugin/loader.ts` (plugin-only, not skills)
- `packages/opencode/src/project/instance-store.ts` — per-instance initialization (no skill lifecycle)

Created minimal new mechanism: `packages/opencode/src/skill/deprecated.ts`.

---

### P1 — Upgrade Scenarios

| Scenario | Before | After | Result |
|---|---|---|---|
| A. Fresh install | target dir absent | target dir absent | PASS — no error, no creation |
| B. Existing install | `.opencode/skills/giiisp-paper-search-apis/` present | target deleted by migration | PASS — directory removed on first `discoverSkills()` call |

Scenario B verified via upgrade rehearsal (P5 below).

---

### P2 — Durable Tracked Intent

Deletion intent is recorded in version-controlled code:
- **File**: `packages/opencode/src/skill/deprecated.ts`
- **Manifest**: `DEPRECATED_SKILLS` array with `name`, `reason`, `removalPhase`
- **Execution**: `removeDeprecatedSkills(skillsDir)` called from `discoverSkills()` in `packages/opencode/src/skill/index.ts`
- **Registry**: `docs/skill-center/phase4.0-removal-registry-2026-08-23.tsv` with `migration_id: deprecated.ts:DEPRECATED_SKILLS`

Answer to “why does machine B delete the old skill after pull?”:
> Because `discoverSkills()` reads `DEPRECATED_SKILLS` from `deprecated.ts` (tracked in git), and calls `removeDeprecatedSkills()` before scanning skill directories. This removes approved deprecations automatically.

---

### P3 — Safety Boundary

`removeDeprecatedSkills()` safety guarantees:
- Only deletes directories whose name exactly matches an entry in `DEPRECATED_SKILLS`
- Uses `FSUtil.contains(skillsDir, resolved)` to prevent path traversal
- Never deletes the skills root itself
- Never deletes unknown user skills
- Never deletes home-level skills (only operates on per-project `configDirs`)
- Never follows symlinks/junctions outside the skills root
- No wildcard deletions

---

### P4 — Idempotency

| Test | Result |
|---|---|
| Target present → deleted | PASS |
| Target absent → no-op | PASS |
| Second run after deletion → no-op | PASS |
| No errors thrown on any run | PASS |

---

### P5 — Upgrade Rehearsal

Full rehearsal executed:

1. Restored giiisp from `rc6-business-skills` branch (11 files)
2. Regenerated integrity.json
3. Verified target physically present
4. Executed `removeDeprecatedSkills()` on real `.opencode/skills/` directory
5. Verified directory deleted: `before: true, after: false`
6. Regenerated integrity.json
7. Verified `target_in_skill_all = false`, `Skill.all = 79`, `Explore = 79`
8. Xiaoxue = 38 (unchanged, baseline)
9. missing refs = 0
10. Second migration run → no-op (PASS)

Pre-migration snapshot: `docs/skill-center/phase4.0-runtime-snapshot-pre-migration2026-08-23.json`
Post-migration snapshot: `docs/skill-center/phase4.0-runtime-snapshot-post-migration2026-08-23.json`

---

### P6 — Rollback Semantics

**CRITICAL DISTINCTION**: Code rollback ≠ Asset restoration.

| Type | Method | What it recovers |
|---|---|---|
| **Code rollback** | `git revert` of `deprecated.ts` + `index.ts` changes | Removes migration logic, stops auto-deletion |
| **Asset restoration** | `bun -e` extraction from `rc6-business-skills` branch | Restores the 11 skill files to `.opencode/skills/giiisp-paper-search-apis/` |

`git revert` alone does NOT restore gitignored asset files. After code rollback, asset restoration is still required.

**Formal restore command** (Phase 4.0A verified):
```powershell
bun -e "
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const files = ['SKILL.md','ACCEPTANCE.md','agents/openai.yaml','examples/end_to_end_example.json','examples/failure_response_examples.json','examples/normalized_result_example.json','examples/request_matrix.json','scripts/dry_run_paper_search.py','scripts/progressive_paper_search.py','tests/test_dry_run_paper_search.py','tests/test_progressive_paper_search.py'];
const base = '.opencode/skills/giiisp-paper-search-apis';
for (const f of files) {
  const dir = path.dirname(path.join(base, f));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(base, f), execSync('git show rc6-business-skills:.opencode/skills/giiisp-paper-search-apis/' + f));
}
console.log('Restored', files.length, 'files');
"
```

Then: `bun packages/desktop/scripts/generate-resource-integrity.ts`

---

### P7 — Canonical Removal Registry

Updated `docs/skill-center/phase4.0-removal-registry-2026-08-23.tsv`:

| Field | Value |
|---|---|
| skill_name | giiisp-paper-search-apis |
| final_status | PLATFORM_REMOVED_WITH_APPROVAL |
| removal_phase | Phase 4.0 |
| removal_date | 2026-08-23 |
| reason | Giiisp private API wrapper superseded by deep-research (NEAR_COMPLETE overlap) |
| replacement | deep-research |
| migration_id | deprecated.ts:DEPRECATED_SKILLS |
| restore_method | Code rollback: git revert. Asset restore: bun -e extraction from rc6-business-skills |
| historical_source | rc6-business-skills branch |
| approval_source | Phase 3.5F decision pack: REMOVE_WITH_APPROVAL |
| recovery_cost | MEDIUM |

integrity.json does NOT carry lifecycle registry responsibility — it tracks resource hashes only.

---

### P8 — Migration Tests

**New test file**: `packages/opencode/test/skill/deprecated-skill-migration.test.ts`

| Test | Result |
|---|---|
| removes deprecated target when present | PASS |
| no-op when target absent | PASS |
| idempotent — second run still passes | PASS |
| does not delete sibling skill | PASS |
| path safety — only deletes exact match under skillsDir | PASS |
| DEPRECATED_SKILLS manifest is non-empty | PASS |

**Existing test suites (post-migration, removed state)**:

| Suite | Result |
|---|---|
| deprecated-skill-migration | 6 pass / 0 fail |
| reference-integrity | 7 pass / 0 fail |
| phase3.5C-runtime-api-direct | 4 pass / 0 fail |
| skill.test.ts | 16 pass / 0 fail |
| discovery.test.ts | 7 pass / 0 fail |
| agent tests | 139 pass / 0 fail |
| resource-integrity-sync | 1 pass / 0 fail |

**Total**: 180 pass / 0 fail (excl. pre-existing EFAULT/TS2344)

---

### P9 — Phase 4.0B Final Gate

```
Phase 4.0B: PASS

Existing migration mechanism = NO (created deprecated.ts)
Tracked deletion intent       = deprecated.ts:DEPRECATED_SKILLS (git-tracked code)

Fresh install:
  target absent = PASS (no error, no creation)

Existing install upgrade:
  target before migration = present
  target after migration  = absent
  runtime before          = Skill.all=80, target_in_all=true
  runtime after           = Skill.all=79, target_in_all=false
  explore before          = 80
  explore after           = 79

Migration idempotent      = PASS
Sibling skills preserved  = PASS
Home skills untouched     = PASS (migration only runs on project configDirs)

Code rollback method      = git revert (deprecated.ts + index.ts changes)
Asset restore method      = bun -e extraction from rc6-business-skills branch
                          → git revert alone does NOT restore gitignored assets

missing refs = 0
tests        = 180 pass / 0 fail (excl. pre-existing)

Can Phase 4.0 now be FINAL PASS? YES
Can Phase 4.1 start?         YES
```
