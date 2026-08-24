# Phase 4.1 Batch 1 — Multi-Skill Platform Removal Rehearsal: effect + minimax-pdf

**Status: Runtime Removal Rehearsal = PASS | Fingerprint-Pinned = PASS | Migration = PASS | Release-Safe = PASS (Phase 4.1A)**
**Date: 2026-08-24**
**Targets: `effect`, `minimax-pdf`**
**Approval source: Phase 3.5F decision pack + Phase 4.1A P3 SAFE_ARCHIVE ranking**

> **Note**: This report supplements the original Batch1 commit (`9aeb719d66`)
> by adding a BASELINE_RECONCILIATION section that anchors the rehearsal to
> the AUTHORITATIVE production-equivalent Skill universe established in
> Phase 4.1A.

---

## P0 — Pre-removal Snapshot

| Dimension | Value | Source |
|---|---|---|
| `effect` physical present | true | rc6 @ 747dd6877e, single `SKILL.md` |
| `effect` file count | 1 | `expectedFingerprint.SKILL.md` |
| `effect` fingerprint hash | `0d27f8d40455cd4d509c0c81f3d2b6edb8319cd8ebd12a2e9f21626fc80495d5` | git show + SHA-256 |
| `minimax-pdf` physical present | true | rc6 @ 747dd6877e |
| `minimax-pdf` file count | 12 | `expectedFingerprint.*` |
| `minimax-pdf` fingerprint hashes | (see registry.ts:52-65) | git show + SHA-256, all 12 verified |
| `effect` in xiaoxue allowlist | false | `agent.ts:181-223` (deny-by-default + allowlist) |
| `minimax-pdf` in xiaoxue allowlist | false | `agent.ts:181-223` |
| `effect` in router | false | `configs/xiaoxue/router.md` |
| `minimax-pdf` in router | false | `configs/xiaoxue/router.md` |
| `effect` package_tracked | false | `package.json` no refs |
| `minimax-pdf` package_tracked | false | `package.json` no refs |

Canonical portfolio: both L4 — DISABLE_ARCHIVE (Phase 3.5F platform removal matrix).

---

## P1 — Dependency Audit

### `effect`

| Region | refs | Conclusion |
|---|---:|---|
| `packages/opencode/src/` | 0 | no production consumer |
| `packages/opencode/test/` | 0 | no test dependency |
| `configs/xiaoxue/` | 0 | no allowlist / router / skills.yaml ref |
| `agent.ts` | 0 | no xiaoxue allow / subagent ref |
| `xiaoxue-router.ts` | 0 | no router rule |
| `package.json` | 0 | not tracked |
| `packages/desktop/resources/integrity.json` | 0 | not in manifest |
| `.opencode/references/effect-smol` | (separate) | in-repo Effect v4 reference exists; this skill is redundant |

**PASS — no real consumer found.**

### `minimax-pdf`

| Region | refs | Conclusion |
|---|---:|---|
| `packages/opencode/src/` | 0 | no production consumer |
| `packages/opencode/test/` | 0 | no test dependency |
| `configs/xiaoxue/` | 0 | no allowlist / router / skills.yaml ref |
| `agent.ts` | 0 | no xiaoxue allow / subagent ref |
| `xiaoxue-router.ts` | 0 | no router rule |
| `package.json` | 0 | not tracked |
| `packages/desktop/resources/integrity.json` | 0 | not in manifest |
| xiaoxue workflows | 0 | xiaoxue uses pdfkit-py + minimax-docx (orthogonal) |

**PASS — no real consumer found.**

---

## P2 — Fingerprint-Pinned Migration

Both targets are pinned to `rc6-business-skills@747dd6877e` with full
SHA-256 fingerprint manifests. Verified by `scripts/phase4.1A-verify-p2-fingerprints.py`:

| target | file count | verified |
|---|---:|:---:|
| `effect` | 1 | ✓ |
| `minimax-pdf` | 12 | ✓ |

All fingerprints match the pinned commit byte-for-byte.

---

## P3 — SAFE_ARCHIVE ranking

Re-proven in Phase 4.1A P3. See `.db-rehearsal/phase4.1A-p3-batch1-ranking.md`
for the full ranking table.

**Both targets: APPROVED_FOR_BATCH1.**

---

## P4 — Backup before removal

Migrations registered:
- `rm-effect-2026-08-24` (targetSkill=`effect`)
- `rm-minimax-pdf-2026-08-24` (targetSkill=`minimax-pdf`)

Both `backupPolicy = "restore_on_rollback"`. Backups land under
`.opencode/.migration-backup/<migrationId>/<targetSkill>/`.

---

## P5 — Runtime removal rehearsal (NON_AUTHORITATIVE)

> ⚠️ The original 29→27 evidence captured in commit `9aeb719d66` is now
> classified `NON_AUTHORITATIVE_PARTIAL_WORKTREE_REHEARSAL` (see Phase 4.1A
> P6). It is reproduced here for traceability only. The authoritative source
> for P12 acceptance is the Phase 4.1A P4 production-equivalent fixture.

### 29 → 27 (NON_AUTHORITATIVE)

| Metric | Pre | Post | Delta |
|---|---:|---:|---|
| `Skill.all()` (Batch1 worktree local) | 29 | 27 | -2 |
| Target skills in registry | 3 (giiisp + effect + minimax-pdf) | 3 | 0 |
| Targets present on disk (pre) | 3 | 0 | -3 |
| Targets removed | — | 2 (effect, minimax-pdf) | — |
| Targets skipped (giiisp already migrated) | — | 1 (giiisp — was absent) | — |

Evidence files:
- `phase4.1-batch1-runtime-before-2026-08-24-NON_AUTHORITATIVE_PARTIAL_WORKTREE_REHEARSAL.json`
- `phase4.1-batch1-runtime-after-2026-08-24-NON_AUTHORITATIVE_PARTIAL_WORKTREE_REHEARSAL.json`

### Why NON_AUTHORITATIVE

The Batch1 worktree (`e:\software programming\opencode-dev-phase4.1-batch1`)
only had 29 skills materialized on disk, while the production universe
(`rc6-business-skills@747dd6877e`) contains 41 + giiisp = 42 skill directories
(41 after excluding giiisp).

The 12 missing skills in the Batch1 worktree local are not removed by the
migration; they were simply never present on disk in that worktree. Therefore
the 29→27 evidence only proves the migration operates correctly against
the 29-skill worktree-local subset — NOT against the production universe.

---

## P6 — BASELINE_RECONCILIATION (Phase 4.1A)

> Authoritative source for Batch1 acceptance. Established by Phase 4.1A P4–P5.

### Authoritative universe

The Phase 4.1A P4 production-equivalent Skill asset snapshot fixture
materializes all 41 production skills (rc6 minus giiisp) on disk from the
pinned commit `rc6-business-skills@747dd6877e`. This is the AUTHORITATIVE
runtime universe against which Batch1 acceptance must be measured.

### Reconciliation table

| Set | Classification | Count | Removed |
|---|---|---:|---|
| `NORMAL_PRE` | AUTHORITATIVE | 41 | (start) |
| `NORMAL_POST` | AUTHORITATIVE | 39 | `{effect, minimax-pdf}` |
| `REHEARSAL_PRE` | NON_AUTHORITATIVE | 29 | (start) |
| `REHEARSAL_POST` | NON_AUTHORITATIVE | 27 | `{effect, minimax-pdf}` |

- `REHEARSAL ⊂ NORMAL` (strict subset property).
- `NORMAL_PRE \ REHEARSAL_PRE` = 12 skills present in production but absent
  from Batch1 worktree local.
- `REHEARSAL_PRE \ NORMAL_PRE` = ∅ (no Batch1-only skills).
- Both universes removed exactly `{effect, minimax-pdf}` — no third skill was
  removed in either case.

### Authoritative Batch1 acceptance evidence

| Field | Value | Source |
|---|---|---|
| `Skill.all()` (pre) | 41 | Phase 4.1A P4 fixture |
| `Skill.all()` (post) | 39 | Phase 4.1A P4 fixture (runPending removes 2 targets) |
| Targets removed | `[effect, minimax-pdf]` | registry.ts (post-Batch1 commit) |
| Targets preserved | 39 other skills | runtime snapshot post-migration |
| Rollback available | yes (`SkillMigration.rollback()`) | engine.ts |
| Resource integrity | PASS | `resource-integrity-sync.test.ts` |
| Reference integrity | 0 missing | `reference-integrity.test.ts` |

### Runtime snapshot (authoritative — from production-equivalent fixture)

```
NORMAL_PRE (41 skills, before migration):
  cognitive-profile, deep-research, effect, experiment-design, giiisp-paper-search-apis,
  knowledge-distill, manim-agent, mcp-criticagent, minimax-pdf, mud-logging-review,
  papercheck, pdfkit-py, practical-course-producer, research-baseline-builder,
  sci-employee-deep-research, sci-writer, skill-criticagent, tender-bid-generation,
  xiaoxue-deep-research, xiaoxue-paper-analysis, ... (21 more)

NORMAL_POST (39 skills, after migration removes {effect, minimax-pdf}):
  [same list without effect, minimax-pdf]
```

### Phase 4.0 framework gates re-run on authoritative fixture

| Suite | Result |
|---|:---:|
| `skill-migration-production-fixture.test.ts` (P4 fixture) | 4 / 4 PASS |
| `skill-migration.test.ts` | 18 / 18 PASS |
| `reference-integrity.test.ts` | 7 / 7 PASS |
| `phase3.5C-runtime-api-direct.test.ts` | 4 / 4 PASS |
| `skill.test.ts` | 17 / 17 PASS |
| `discovery.test.ts` | 7 / 7 PASS |
| `skill-migration-interrupted.test.ts` | 5 / 5 PASS |
| `resource-integrity-sync.test.ts` (desktop) | 1 / 1 PASS |
| `bun typecheck` | 4 pre-existing TS2344 (unchanged) |
| **TOTAL** | **63 / 63 PASS** |

No new framework regressions introduced by Phase 4.1A or Batch1.

---

## P7 — Rollback verification

Both `effect` and `minimax-pdf` migrations are reversible via
`SkillMigration.rollback()`:

```
# Restore effect
SkillMigration.rollback({ configDir, migrationId: "rm-effect-2026-08-24" })

# Restore minimax-pdf
SkillMigration.rollback({ configDir, migrationId: "rm-minimax-pdf-2026-08-24" })
```

Rollback restores exact bytes from `.opencode/.migration-backup/`. Verified by
`skill-migration.test.ts:rollback restores exact bytes` and
`skill-migration-interrupted.test.ts:D` (rolled_back + active restored → no
overwrite).

---

## P8 — Decision

| Question | Answer |
|---|:---:|
| Are `effect` and `minimax-pdf` safe to archive? | **YES** (P3 ranking) |
| Do fingerprints match the pinned historical source? | **YES** (P2 verified) |
| Does the framework operate correctly against the production-equivalent universe? | **YES** (P4 fixture, 4/4 PASS) |
| Are backups preserved and rollback reversible? | **YES** (P7) |
| Are there any new framework regressions? | **NO** (P7/P9: 63/63 PASS) |
| Are there any new typecheck regressions? | **NO** (P7: 4 pre-existing unchanged) |

**Batch 1 (effect + minimax-pdf) is APPROVED for Phase 4.1 P12 acceptance.**

---

## Evidence files

| File | Purpose |
|---|---|
| `phase4.1-batch1-runtime-before-2026-08-24-NON_AUTHORITATIVE_PARTIAL_WORKTREE_REHEARSAL.json` | Pre-migration snapshot (Batch1 worktree local — NON_AUTHORITATIVE) |
| `phase4.1-batch1-runtime-after-2026-08-24-NON_AUTHORITATIVE_PARTIAL_WORKTREE_REHEARSAL.json` | Post-migration snapshot (Batch1 worktree local — NON_AUTHORITATIVE) |
| `phase4.0-removal-registry-2026-08-23.tsv` | Registry of all approved migrations |
| `packages/opencode/src/skill/migration/registry.ts` | Live registry (post-Batch1 commit) |
| `packages/opencode/test/skill/fixtures/production-skill-fixture.ts` | P4 production-equivalent fixture module |
| `packages/opencode/test/skill/skill-migration-production-fixture.test.ts` | P4 fixture test (4/4 PASS) |
| `docs/skill-center/phase4.1A-baseline-and-runtime-reconciliation-2026-08-24.md` | Phase 4.1A master deliverable |
| `.db-rehearsal/phase4.1A-runtime-reconciliation.json` | P5 reconciliation data |
| `.db-rehearsal/phase4.1A-p3-batch1-ranking.md` | P3 SAFE_ARCHIVE ranking |
| `.db-rehearsal/phase4.1A-p7-framework-regression.md` | P7 framework regression evidence |
| `.db-rehearsal/phase4.1A-p8-zod-ab-classification.md` | P8 A/B classification |
| `.db-rehearsal/phase4.1A-p9-final-gate-verification.md` | P9 final verification |

## Pinned commits

| Role | Full 40-character SHA |
|---|---|
| Phase 4.0 framework baseline | `fdfff5a9b86b06b4e6362892e6ba521686625fef` |
| Historical sources (rc6) | `747dd6877ea36d1627e601e7c507f6278ba77b20` |
| Batch1 worktree HEAD | `040259f196fedcc5b52c3dda67dbb31e414496f5` |
| Main worktree HEAD | `ec555e4c3839a19cc9d3d330c461eb7260696b7d` |

## Phase 4.1A-Closeout (C1–C6)

All closeout requirements verified. See
`phase4.1A-baseline-and-runtime-reconciliation-2026-08-24.md` for full details.

| # | Condition | Result |
|---|---|:---:|
| 1 | One authoritative worktree fixed | **YES** |
| 2 | Immutable Phase 4 baseline | **YES** |
| 3 | Historical source full SHA | **YES** |
| 4 | Fingerprints reproducible | **YES** — 13/13 |
| 5 | Managed project diff exactly 2 targets | **YES** |
| 6 | Global runtime diff exactly 2 targets | **YES** — 78→76 |
| 7 | New test failures | **YES** — 0 |
| 8 | Phase 4 framework regressions | **YES** — 0 |

**ALL 8 = YES → Phase 4.1 P13 may proceed.**

## Proceed

Batch 1 Closeout is complete. Phase 4.1 P13 may now begin.
Phase 4.2 is NOT started.
