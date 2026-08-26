# B1A AC10 evidence

Date: 2026-08-26

## Acceptance target

AC10 requires a read-only diagnosis across normal and oversized storage fixtures, including SQLite placeholders, global/workspace/draft state, attachments, logs, cache, and temporary storage. The diagnosis must find large items, classify category health, stay bounded, and produce zero storage mutation.

## Automated fixture

`packages/core/test/storage-health.test.ts` creates an isolated temporary tree with:

- normal and oversized SQLite placeholders;
- oversized global state and warning-sized workspace state;
- six draft stores;
- log, cache, and temporary files;
- a missing attachment-registry target;
- an external directory linked through a junction/symbolic link.

The test fingerprints every fixture file before and after the scan using relative path, type, size, modified time, and SHA-256. It asserts exact pre/post equality, `mutationCount = 0`, expected healthy/warning/critical classifications, bounded-scan truncation, largest-item selection, missing-path reporting, and that the external linked directory is not traversed.

## Read-only implementation controls

- Scanner imports only `lstat` and `readdir` from `node:fs/promises`.
- It never imports runtime globals whose module initialization creates storage directories.
- It never opens file contents or a SQLite connection.
- It never follows a symbolic link/reparse point.
- It never invokes store cleanup, store repair, attachment cleanup, tool-output cleanup, migration, checkpoint, compaction, truncate, or vacuum code.
- Missing paths remain missing and are reported as `NOT_DISCOVERED`.
- The schema fixes report mode to `DIAGNOSE` and mutation count to literal `0`.

## Verification result

All commands below were run from their package directories on Windows with Bun 1.3.14.

| Command | Result |
| --- | --- |
| `packages/core: bun test test/storage-health.test.ts` | PASS: 3 tests, 21 assertions, including exact pre/post SHA-256 fixture equality |
| `packages/desktop: bun test src/main/storage-health.test.ts src/main/store-cleanup.test.ts src/main/orphan_draft_cleanup.test.ts src/main/preflight_repair_is_idempotent.test.ts src/main/renderer_starts_after_store_repair.test.ts` | PASS: 13 tests, 44 assertions |
| `packages/core: bun test test/session-create.test.ts test/session-prompt.test.ts test/session-history.test.ts test/session-projector.test.ts test/session-runner.test.ts test/database-migration.test.ts` | PASS: 156 tests, 425 assertions |
| `packages/app: bun run test:unit` | PASS: 716 tests, 1,897 assertions |
| `packages/app: bun run test:browser` | PASS: 30 tests, 69 assertions |
| `packages/schema: bun typecheck` | PASS |
| `packages/core: bun typecheck` | PASS |
| `packages/desktop: bun typecheck` | PASS |

AC10 result: **PASS**. The oversized fixtures were detected and classified, the largest cache item was reported, bounded and missing-path behavior was verified, the external junction/symbolic link was not followed, and the fixture fingerprint was byte-for-byte and metadata-for-metadata unchanged after diagnosis.

No production migration was added. No database, global/workspace/draft store, attachment registry, log, cache, or temporary item was deleted, truncated, vacuumed, compacted, repaired, rewritten, or created by the scanner.
