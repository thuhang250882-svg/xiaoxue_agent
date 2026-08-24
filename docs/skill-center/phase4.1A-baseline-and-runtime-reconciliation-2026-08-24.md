# Phase 4.1A — Baseline Pinning & Production-Equivalent Rehearsal

**Status: COMPLETE — All P0–P9 PASS**
**Date: 2026-08-24**
**Scope: Re-anchor Batch1 (effect + minimax-pdf) to an authoritative, production-equivalent baseline before Phase 4.1 P12 acceptance.**

---

## Summary

Phase 4.1 Batch 1 proposed to archive `effect` and `minimax-pdf` from
`.opencode/skills/`. Before this could be accepted as Phase 4.1 P12 evidence, we
needed to prove three things:

1. **The two targets are safe to archive** — no production consumer, no router
   reference, no agent allowlist entry, no persistent state. (P3 ranking)
2. **The migration framework operates correctly against the AUTHORITATIVE
   production-equivalent Skill universe** — not against the partial 29-skill
   Batch1 worktree subset that previously produced the 29→27 evidence. (P4 fixture)
3. **The 29→27 evidence is correctly classified as NON_AUTHORITATIVE** and is
   not used as P12 acceptance evidence. (P5 + P6)

All three are now proven. Phase 4.1 P13 may proceed.

---

## P0 — Path safety fix + immutable framework pin

- Commit: `fdfff5a9b8` (`chore(skills): finalize release-safe skill migration framework`)
- Phase 4.0 framework is now an immutable baseline. Path safety check verified.

## P1 — Batch1 worktree reset to baseline

- Branch: `archive-batch1` at `opencode-dev-phase4.1-batch1`
- Reset to `fdfff5a9b8` (P0 framework baseline) before re-applying Batch1.

## P2 — Historical source pinning

- Pinned commit: `747dd6877ea36d1627e601e7c507f6278ba77b20`
- Pinned branch: `rc6-business-skills`
- All Batch1 migration fingerprints were regenerated from this pinned commit
  via `git show <commit>:<path>` + SHA-256.
- Evidence: `scripts/phase4.1A-verify-p2-fingerprints.py`

## P3 — SAFE_ARCHIVE ranking (effect + minimax-pdf)

| Field | `effect` | `minimax-pdf` |
|---|---|---|
| explicit runtime refs | 0 | 0 |
| router refs (`configs/xiaoxue/router.md`) | 0 | 0 |
| agent refs (`agent.ts:181-223` skill allowlist) | 0 | 0 |
| replacement/overlap | Effect v4 → `.opencode/references/effect-smol` (in-repo) | design-PDF → pdfkit-py (xiaoxue uses pdfkit-py + minimax-docx) |
| unique capability | generic Effect documentation | designer-PDF creation (orthogonal to xiaoxue workflows) |
| wildcard reachable | false (no router/allowlist) | false (no router/allowlist) |
| removal impact | LOW (in-repo references cover same ground) | LOW (xiaoxue uses orthogonal stack) |
| historical source | rc6 @ 747dd6877e | rc6 @ 747dd6877e |
| fingerprint confidence | HIGH (SHA-256 matches rc6 bytes) | HIGH (SHA-256 matches rc6 bytes) |
| **final decision** | **APPROVED_FOR_BATCH1** | **APPROVED_FOR_BATCH1** |

Evidence: `.db-rehearsal/phase4.1A-p3-batch1-ranking.md`

## P4 — Production-equivalent Skill asset snapshot fixture

- Fixture module: `packages/opencode/test/skill/fixtures/production-skill-fixture.ts`
- Test: `packages/opencode/test/skill/skill-migration-production-fixture.test.ts`
- Production skill names: `packages/opencode/test/skill/fixtures/production-skill-names.json`
  (41 skills derived from `rc6-business-skills@747dd6877e` minus `giiisp-paper-search-apis`)
- Enumeration script: `scripts/phase4.1A-enumerate-skills.py`

The fixture materializes the **full production-equivalent** Skill universe on
disk from the pinned commit (using `git -c core.quotepath=off show ...`),
allowing the migration framework to operate against the same scope it would
in production.

| Test | Result |
|---|---|
| fixture metadata: pinned commit, branch, shape correct | PASS |
| materialize: 41 skills produced, both Batch1 targets present, no duplicates | PASS |
| isolation: migration removes ONLY registry targets present in fixture, never a third skill | PASS |
| byte-identity: every preserved skill's SKILL.md is byte-identical to the pinned commit | PASS |

## P5 — Runtime set reconciliation

| Set | Classification | Count | Source |
|---|---|---:|---|
| `NORMAL_PRE` | AUTHORITATIVE_PRODUCTION_EQUIVALENT_FIXTURE | 41 | Phase 4.1A P4 fixture |
| `NORMAL_POST` | AUTHORITATIVE_PRODUCTION_EQUIVALENT_FIXTURE | 39 | NORMAL_PRE minus {effect, minimax-pdf} |
| `REHEARSAL_PRE` | NON_AUTHORITATIVE_PARTIAL_WORKTREE_REHEARSAL | 29 | Batch1 worktree local |
| `REHEARSAL_POST` | NON_AUTHORITATIVE_PARTIAL_WORKTREE_REHEARSAL | 27 | 29 minus {effect, minimax-pdf} |

- NORMAL_PRE and REHEARSAL_PRE intersection = REHEARSAL_PRE (29).
- NORMAL_PRE-only = 12 (skills the Batch1 worktree never had on disk).
- REHEARSAL_PRE-only = 0 (no skills present in Batch1 absent from production).
- Both universes remove exactly {effect, minimax-pdf}.
- REHEARSAL ⊂ NORMAL (strict subset property).

Evidence:
- `.db-rehearsal/phase4.1A-runtime-reconciliation.json`
- `.db-rehearsal/phase4.1A-runtime-reconciliation.md`
- `scripts/phase4.1A-runtime-reconciliation.py`

## P6 — Mark 29→27 evidence as NON_AUTHORITATIVE

The original 29→27 evidence captured in Batch1 (commit `9aeb719d66`) is now
explicitly classified `NON_AUTHORITATIVE_PARTIAL_WORKTREE_REHEARSAL`:

- `docs/skill-center/phase4.1-batch1-runtime-before-2026-08-24-NON_AUTHORITATIVE_PARTIAL_WORKTREE_REHEARSAL.json`
- `docs/skill-center/phase4.1-batch1-runtime-after-2026-08-24-NON_AUTHORITATIVE_PARTIAL_WORKTREE_REHEARSAL.json`

These files MUST NOT be used as Phase 4.1 P12 acceptance evidence. The
authoritative source for P12 acceptance is the Phase 4.1A P4 fixture
(41 → 39 universe).

## P7 — Phase 4.0 framework regression gates (re-run)

| Suite | Phase 4.0C | Phase 4.1A P7 | Delta |
|---|---:|---:|---:|
| `skill-migration.test.ts` | 18 | 18 | 0 |
| `reference-integrity.test.ts` | 7 | 7 | 0 |
| `phase3.5C-runtime-api-direct.test.ts` | 4 | 4 | 0 |
| `skill.test.ts` | 16 | 17 | +1 |
| `discovery.test.ts` | 7 | 7 | 0 |
| `skill-migration-interrupted.test.ts` | (added 4.0D) | 5 | +5 |
| `skill-migration-production-fixture.test.ts` | (added 4.1A) | 4 | +4 |
| `resource-integrity-sync.test.ts` (desktop) | 1 | 1 | 0 |
| `bun typecheck` | 4 pre-existing | 4 pre-existing | 0 |
| **TOTAL** | **53** | **63** | **+10** |

All 63 framework tests pass. No new regressions. No new typecheck errors.

Evidence: `.db-rehearsal/phase4.1A-p7-framework-regression.md`

## P8 — zod/v4-mini A/B baseline classification

| Failure | Classification | Batch1 fix required? |
|---|---|---|
| `Cannot find module 'zod/v4-mini'` (from `@modelcontextprotocol/sdk@1.29.0`) | PRE_EXISTING_ENVIRONMENTAL | No |
| `Cannot find module './ja.js'` (from `zod@4.4.3/locales/index.js`) | PRE_EXISTING_ENVIRONMENTAL | No |
| `skill-migration` engine test `expect(results.length).toBe(1)` | BATCH1_INDUCED_EXPECTED | Yes — relax/filter assertion |
| `reference-integrity` canonical count assertion | BATCH1_INDUCED_EXPECTED | Yes — recompute or update count |

The zod/v4-mini error is an upstream version mismatch between
`@modelcontextprotocol/sdk@1.29.0` and `zod@4.4.3`. The Batch1 worktree
triggers it more often due to its expanded registry, but the latent issue
exists in both worktrees. Fix is out of Phase 4.1A scope.

Evidence: `.db-rehearsal/phase4.1A-p8-zod-ab-classification.md`

## P9 — Final gate verification

**Decision: PASS** — proceed to Phase 4.1 P13.

- All framework gates PASS (63/63 in main worktree).
- P4 production-equivalent fixture PASSES in BOTH worktrees (4/4 actual tests).
- All Batch1 worktree failures are classified (P8): none are framework regressions.
- Zero new typecheck regressions.

Evidence: `.db-rehearsal/phase4.1A-p9-final-gate-verification.md`

---

## Pinned commits

| Role | Commit | Branch |
|---|---|---|
| Phase 4.0 framework baseline | `fdfff5a9b8` | `dev` |
| Phase 4.0C release-safe migration | `16dfd7ab2f` | `dev` |
| Historical sources (rc6) | `747dd6877ea36d1627e601e7c507f6278ba77b20` | `rc6-business-skills` |
| Batch1 (effect + minimax-pdf) | `9aeb719d66` | `archive-batch1` |

## Artifacts

| File | Purpose |
|---|---|
| `.db-rehearsal/phase4.1A-p3-batch1-ranking.md` | P3 SAFE_ARCHIVE ranking |
| `.db-rehearsal/phase4.1A-production-skill-names.json` | 41 production skill names |
| `packages/opencode/test/skill/fixtures/production-skill-fixture.ts` | Fixture module |
| `packages/opencode/test/skill/skill-migration-production-fixture.test.ts` | Fixture test |
| `scripts/phase4.1A-enumerate-skills.py` | Enumeration script |
| `scripts/phase4.1A-verify-p2-fingerprints.py` | P2 fingerprint verifier |
| `scripts/phase4.1A-regenerate-fingerprints.py` | P2 fingerprint regenerator |
| `scripts/phase4.1A-runtime-reconciliation.py` | P5 reconciliation script |
| `.db-rehearsal/phase4.1A-runtime-reconciliation.json` | P5 reconciliation data |
| `.db-rehearsal/phase4.1A-runtime-reconciliation.md` | P5 reconciliation report |
| `.db-rehearsal/phase4.1A-p7-framework-regression.md` | P7 framework regression evidence |
| `.db-rehearsal/phase4.1A-p8-zod-ab-classification.md` | P8 A/B classification |
| `.db-rehearsal/phase4.1A-p9-final-gate-verification.md` | P9 final verification |

## Proceed

Phase 4.1A is COMPLETE. The framework now operates against the AUTHORITATIVE
production-equivalent Skill universe (41 skills), Batch1 (effect + minimax-pdf)
is approved for archive, and the previously-captured 29→27 evidence is
correctly classified as non-authoritative.

Phase 4.1 P13 may now begin, using the P4 fixture as the acceptance baseline.
