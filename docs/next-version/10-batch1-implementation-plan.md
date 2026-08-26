# Batch 1 implementation plan

## Authorization boundary

This is an implementation specification only. B1A-B1E remain `NOT_STARTED` until the design gate is approved. Product-code edits, migrations, generated clients, commits, and PRs are outside this planning turn.

Each sub-batch follows the same evidence sequence:

1. record branch, HEAD, dirty state, migration head, and relevant package baseline;
2. implement only the named scope with additive contracts;
3. run focused unit tests from package directories;
4. run integration and compatibility tests;
5. run affected package typechecks and required browser tests;
6. retain commands, logs, fixtures/hashes, and machine-readable reports;
7. review the diff for layering, privacy, rollback, and unrelated changes;
8. create one conventional commit only after all gates pass.

## B1A - Storage Health baseline

Scope: implement the read-only scan model/service and a diagnostic report for approved application roots and SQLite indicators. No cleanup command, delete button, vacuum, compaction, or automatic mutation is allowed.

Tests: category/threshold unit tests; path-boundary, reparse-point, permission, cancellation, partial-result, and mutation-proof integration tests; AC10. Regression covers database startup and existing pending-compaction reporting.

Evidence: versioned fixture manifest and hashes, pre/post filesystem snapshot, scan JSON, exact commands, and `mutation_count = 0` assertion.

Suggested commit after passing: `feat(core): add storage health diagnostics`.

## B1B - Chat long-run harness

Scope: implement deterministic scenarios A-G, metric checkpoints, restart orchestration, trace validation, and sanitized evidence output. First establish measured baselines; then propose numeric thresholds for reviewer approval before enforcing them.

Tests: harness self-tests for seed reproducibility, trace mismatch detection, metric completeness, restart phases, and redaction; execute at least A and a reduced restart scenario on normal CI, with B/C as scheduled or release gates; AC02 uses the full C scenario.

Evidence: scenario config, seed, commit/build, raw metric samples, summary, storage deltas, restart trace, sanitized failure bundle, and approved thresholds.

Suggested commit after passing: `test(session): add long-run chat harness`.

## B1C - Structured document pipeline

Scope: add `DocumentContext`/`DocumentPart` schemas, additive persistence, parser registry, and format adapters for DOCX, XLS/XLSX, PPTX, text PDF, TXT/Markdown, and CSV. Preserve current callers through an adapter. OCR and legacy binary PPT are excluded; legacy DOC remains compatible but is not required to gain every new structural guarantee in this batch.

Tests: parser unit fixtures, deterministic retry, corrupt/encrypted/unsupported limits, archive-bomb and external-relationship safety, persistence round-trip, legacy adapter regression, and AC03-AC06.

Evidence: licensed/synthetic fixture manifest and hashes, parser/contract versions, part snapshots, failure classifications, exact tests/typechecks, and size-limit results.

Suggested commit after passing: `feat(core): add structured document context`.

## B1D - Evidence references

Scope: add `EvidenceRef` schema/persistence, typed locator validation, source/part hash validation, stale detection, bounded quote handling, and derived/cross-document lineage. Free-form legacy evidence remains compatibility-only.

Tests: every locator variant, wrong-context/part/hash rejection, repeated-text disambiguation, stale source behavior, derived lineage, legacy unresolved adapter, persistence round-trip, and evidence portions of AC03-AC07.

Evidence: locator fixtures, validation matrix, resolved/stale/unresolved snapshots, negative-test output, and proof that no fuzzy rebinding occurred.

Suggested commit after passing: `feat(core): add evidence reference model`.

## B1E - Well context

Scope: add `WellContext`, field registry, attributed observations, unit normalization, conflict classification, append-only resolution, and consumer read service. Undefined units remain unresolved. No source observation may be overwritten.

Tests: alias/type/unit conversion, tolerance, missing-versus-unknown, multi-source conflict, identity-critical blocking, re-resolution lineage, persistence round-trip, and AC07.

Evidence: three-document fixture bundle and hashes, observation/evidence snapshot, unit/rule registry version, conflict result, before/after resolution lineage, and exact commands.

Suggested commit after passing: `feat(core): add attributed well context`.

## Sequencing and dependencies

- B1A and B1B may be implemented independently once approved.
- B1C precedes B1D because evidence requires stable parts.
- B1D precedes B1E because every well observation requires evidence.
- The normalized task foundation and additive migration needed by B1C-B1E must land without creating a public HTTP API unless separately approved.
- The review/fix/recheck persistence implementation follows B1E in a later batch; its contract is frozen now so B1D evidence does not require redesign.

## Batch 1 completion gate

Batch 1 is not complete until AC01-AC07 and AC10 pass, AC02 passes at the approved long-run threshold, all affected package tests/typechecks/browser cases pass, upgrade/rollback evidence is retained, and a reviewer confirms no automatic cleanup, OCR, failover, Model Registry, or Skill Center work entered the diff. AC08 and AC09 remain contract-level unless separately pulled into the implementation batch.
