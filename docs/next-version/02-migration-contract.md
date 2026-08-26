# Migration contract

## Required migration

Normalized `TaskRun`, document, evidence, well-context, review-lifecycle, storage-health, and provider-health records require additive database migrations. The implementation must extend the existing `packages/core` migration ledger; it must not create a competing migration runner.

The fresh schema and migration ledger must stay equivalent: a new database created from the generated schema and an old database upgraded through every migration must expose the same tables, indexes, constraints, and defaults.

## Migration phases

1. Preflight validates the existing database, migration ledger, foreign-key state, and available disk space. It records no secrets or raw attachment payloads.
2. Schema migration adds normalized tables and indexes in one normal Core migration transaction. Existing tables and columns remain intact.
3. Compatibility reads become available immediately. New writes go to normalized tables.
4. Optional backfill runs separately through the existing `data_migration` mechanism so it can checkpoint and resume without blocking startup. Batch 1 does not require an eager full-history backfill.
5. Postflight verifies row counts, foreign keys, sample adapters, and old-session readability before recording completion evidence.

## Legacy source-to-target mapping

| Legacy source | Normalized target | Rule |
| --- | --- | --- |
| `metadata.xiaoxue_business_tasks[].id` | `TaskRun.legacy_source_id` | Preserve exact legacy ID; normalized ID is deterministic for idempotent import |
| `sessionId` | `TaskRun.session_id` | Must resolve to the owning session or remain compatibility-only |
| `taskType` | `TaskRun.task_type` | Map known values; preserve unknown raw value in bounded legacy metadata |
| `running/completed/failed` | `RUNNING/SUCCEEDED/FAILED` | No inferred success from result presence |
| ISO timestamps | millisecond timestamps | Invalid values become null and retain the raw value |
| `sourceFiles[]` | task input/document-source records | Preserve name, MIME, size, modified time, and hash; do not assume a legacy path is still authoritative |
| legacy `ReviewResult` | `ReviewRun` and `ReviewIssue` | Create a legacy ruleset/version marker and preserve original summary/score |
| `location` and `originalText` | `EvidenceRef` | Resolve only when an exact part can be proven; otherwise use `LEGACY_TEXT` with `LEGACY_ONLY` or `UNRESOLVED` status |
| exported file records | generated-artifact relation | Verify presence separately; never fabricate a live file |

Malformed or partially recognized legacy records remain readable through the legacy adapter and are reported as migration diagnostics. They are never dropped merely to satisfy a normalized constraint.

## Idempotency and concurrency

- The schema migration ID is unique and transactionally recorded by the existing ledger.
- Backfill identity is deterministic from legacy source, session, and record ID; upserts may fill missing normalized data but cannot replace a conflicting completed import.
- A `data_migration` checkpoint records the last successfully examined session plus counts for imported, skipped, unresolved, malformed, and conflicted records.
- The backfill is safe to stop between checkpoints and safe to resume. It must avoid holding a write transaction while parsing documents.
- Concurrent normal writes use normalized tables. The backfill detects an existing normalized lineage and skips or reconciles it rather than duplicating it.

## Rollback

- Before an operator-triggered backfill, require a recoverable database backup or application-supported snapshot and record its path outside public logs.
- A failed schema migration rolls back through the existing database transaction and must not mark the migration complete.
- A failed backfill leaves additive tables and its prior checkpoints. The application falls back to legacy reads for records lacking a valid normalized lineage.
- Rollback never means deleting the legacy metadata. Destructive table removal or down-migration is not part of Batch 1.
- If a released binary must be rolled back, the older binary continues reading its unchanged legacy session/message/part/metadata records. New normalized-only results may be invisible to it but cannot make old records unreadable.

## Explicit exclusions

No migration may vacuum automatically, delete archived attachment payloads, rewrite original documents, infer missing well values, upgrade unresolved evidence by fuzzy matching, or place document binary data in session metadata.
