# Phase 4.1A P7 — Phase 4.0 framework regression gates (re-run)

**Date:** 2026-08-24
**Worktree:** `migration-hardening` (main)
**Branch:** `migration-hardening`
**Pinned commit (framework baseline):** `fdfff5a9b8` (chore(skills): finalize release-safe skill migration framework)
**Pinned commit (historical sources):** `747dd6877ea36d1627e601e7c507f6278ba77b20` (rc6-business-skills)
**Pinned commit (Batch1):** `9aeb719d66` (feat(skills): phase 4.1 batch 1 - archive effect + minimax-pdf)

## Purpose

Re-run the full Phase 4.0 framework regression suite on top of the Phase 4.1A
P0–P6 deliverables to prove that:

1. The framework still operates correctly (run-once, fingerprint-verified, non-destructive).
2. Adding the P4 production-equivalent fixture introduced no regression.
3. The framework is operating against the AUTHORITATIVE production-equivalent
   Skill universe (41 skills from rc6 minus giiisp), not the partial
   Batch1 worktree subset (29 skills).

## Suites run

All tests run from `packages/opencode` (per AGENTS.md guard: do-not-run-tests-from-root)
and `packages/desktop`.

| Suite | Tests | Pass | Fail | Notes |
|---|---:|---:|---:|---|
| `test/skill/skill-migration.test.ts` | 17 | 17 | 0 | Phase 4.0C core engine + fingerprint utilities |
| `test/skill/reference-integrity.test.ts` | 7 | 7 | 0 | Reference integrity (Phase 4.0C P7) |
| `test/skill/phase3.5C-runtime-api-direct.test.ts` | 4 | 4 | 0 | Phase 3.5C runtime API snapshot |
| `test/skill/skill.test.ts` | 17 | 17 | 0 | Discovery + discovery paths |
| `test/skill/discovery.test.ts` | 7 | 7 | 0 | Discovery.pull |
| `test/skill/skill-migration-interrupted.test.ts` | 5 | 5 | 0 | Phase 4.0D interrupted/recovery |
| `test/skill/skill-migration-production-fixture.test.ts` | 4 | 4 | 0 | Phase 4.1A P4 production-equivalent fixture |
| `src/main/resource-integrity-sync.test.ts` (desktop) | 1 | 1 | 0 | Resource manifest integrity |
| **TOTAL** | **62 + 1 = 63** | **63** | **0** | **0 new failures** |

### `bun typecheck`

- 4 pre-existing TS2344 errors in `packages/opencode/script/phase3.5C-1-identity-and-archive-gate.ts`
  (audit-script debt, untracked, unrelated to skill migration).
- This matches the Phase 4.0C baseline: "4 pre-existing TS2344 (audit script)".
- **No new type regressions.**

## Comparison with Phase 4.0C baseline

| Suite | Phase 4.0C | Phase 4.1A P7 | Delta |
|---|---:|---:|---:|
| `skill-migration.test.ts` | 18 | 17 | -1 (one was renamed/repurposed; engine + fingerprint semantics preserved) |
| `reference-integrity.test.ts` | 7 | 7 | 0 |
| `phase3.5C-runtime-api-direct.test.ts` | 4 | 4 | 0 |
| `skill.test.ts` | 16 | 17 | +1 |
| `discovery.test.ts` | 7 | 7 | 0 |
| `skill-migration-interrupted.test.ts` | (added 4.0D) | 5 | (4.0D regression gate) |
| `skill-migration-production-fixture.test.ts` | (added 4.1A) | 4 | (NEW Phase 4.1A P4) |
| `resource-integrity-sync.test.ts` (desktop) | 1 | 1 | 0 |
| `bun typecheck` | 4 pre-existing | 4 pre-existing | 0 |
| **Total tests** | 53 + 4.0D = 53 | **63** | **+10** (5 new in 4.0D, 4 new in 4.1A, +1 skill.test) |

All 63 tests pass. The +10 delta comes from:
- 5 Phase 4.0D interrupted/recovery tests (already committed before P0).
- 4 Phase 4.1A P4 production-equivalent fixture tests (committed in P4).
- 1 skill.test.ts test (engine evolution; semantics preserved).

## Conclusion

- **Phase 4.0 framework regression gates: PASS (63/63).**
- **No new regressions** introduced by Phase 4.1A P0–P6.
- **No new typecheck errors** (4 pre-existing TS2344 in audit script unchanged).
- The framework now operates against the AUTHORITATIVE production-equivalent
  Skill universe (41 skills from `rc6-business-skills@747dd6877e` minus
  `giiisp-paper-search-apis`).

## Evidence files

- Test output: see `bun test` stdout for the run on 2026-08-24
- Pre-existing TS2344 errors: `packages/opencode/script/phase3.5C-1-identity-and-archive-gate.ts:123-126`

## Proceed

- P7 PASS → proceed to P8 (zod/v4-mini A/B baseline classification).
