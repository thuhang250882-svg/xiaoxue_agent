# NEXT_VERSION design gate

## Decision

This directory is the design contract for the first implementation batch. The gate is limited to architecture, schemas, migration, compatibility, acceptance, and implementation sequencing. It does not authorize product-code changes.

Design gate status: `PASS`, subject to reviewer approval before Batch 1 starts.

## Live baseline

| Item | Observed value |
| --- | --- |
| Branch | `dev` |
| HEAD | `143f31e0d7d9426753eb61711365fe02d491f9d9` |
| Upstream relation | `dev` is 20 commits ahead of `origin/dev` |
| Registered worktrees | One |
| Pre-existing worktree state | Dirty: 13 files under `_asset_backup_20260825/` and 3 files under `docs/product/` were untracked before this gate and were not modified |
| Current migration count | 40 TypeScript migrations |
| Current migration head | `20260710090000_request_compaction_for_fragmented_databases` |

## Verification boundary

- Targeted tests: 270 passed, 0 failed.
- Package typechecks: 7 passed, 0 failed (`schema`, `core`, `protocol`, `server`, `opencode`, `desktop`, `app`).
- The full test suite, browser suite, packaged application, GUI, installer lifecycle, and clean-machine acceptance were not run.
- Passing the design gate means the contracts are reviewable and implementation-ready. It does not mean the product behavior exists.

## Current implementation audit

| Area | Current implementation evidence | Design consequence |
| --- | --- | --- |
| SQLite/schema | Core has a generated fresh schema plus a transactionally applied `migration` ledger; 40 migrations are present, with a separate `data_migration` table for named data work | Reuse both mechanisms; keep fresh-schema and upgraded-schema parity |
| Database health | Startup enables WAL, bounded busy timeout, foreign keys, and passive checkpointing; the latest migrations archive oversized attachment payloads and request compaction, while startup deliberately does not auto-vacuum | Storage Health begins as read-only diagnosis and does not promise automatic cleanup |
| Session/message | Core persists session, legacy message/part, todo, V2 durable `session_input`, projected `session_message`, and context epochs | New task/document records remain additive and cannot disturb durable prompt admission |
| Business task | `packages/opencode/src/tool/business-task.ts` stores up to 50 `BusinessTask` records under `metadata.xiaoxue_business_tasks` | Add `TaskRun` and a legacy compatibility adapter; do not invalidate metadata history |
| Attachments | Schema file parts carry MIME/name/URL/source; desktop/core trusted-attachment registration records canonical path, size, MIME, hash/mtime when available, TTL, sender, and consumed state | Reuse trusted-source validation and keep raw paths local-only |
| Document parsing | `document_engine` currently parses DOC/DOCX/XLS/XLSX/PDF/TXT/CSV into paragraphs/tables; native-text PDF is distinct from unsupported OCR; PPTX is absent | Introduce a common part model and PPTX parser while adapting existing callers |
| Review/geology | Current `ReviewResult`/`ReviewIssue` uses flat location/text plus optional sources; geology bundle logic is limited and current formal history is projected through session metadata | Normalize evidence and lifecycle records without claiming existing flat locations are exact |
| Provider/model | Protocol health currently reports only generic health; Provider/Model groups list/get configuration, and provider errors/retry exist without unified persisted `ProviderHealth` or automatic failover; Model Registry productization is absent from current `dev` | Design health classification only; defer failover and Registry implementation |
| Skill runtime | Runtime discovery exposes `Record<string, Skill.Info>` and source directories; same-name later discovery can replace the earlier entry with a warning; policy and permission filtering already exist | Defer Skill Center redesign and preserve current runtime behavior |

## Fixed architectural decisions

1. Use additive migrations through the existing Core migration ledger. Do not introduce a second schema migration system.
2. Read legacy records through compatibility adapters; write new records to normalized tables. Legacy metadata remains readable and is never silently deleted.
3. Store document structure separately from evidence references. Evidence points to stable structured locators and never relies on a free-form location string alone.
4. Preserve competing well-field values with attribution. Resolution creates a decision; it does not overwrite source observations.
5. Keep task execution separate from review execution and retain the complete fix/revision/recheck lineage.
6. Batch 1 storage work is diagnostic only. It may scan and report but cannot delete, vacuum, compact, or mutate user data.
7. Batch 1 provider work is a health contract only. Automatic provider failover is out of scope.
8. Batch 1 document parsing covers DOCX, XLS/XLSX, text PDFs, PPTX, TXT, and CSV. Image-only PDF OCR is a later stage.
9. Model Registry and Skill Center redesign remain deferred. Nothing in this gate revives frozen implementations.

## Runtime dependency placement

- Public value objects and wire-safe schemas belong in `packages/schema`.
- Persistence, adapters, migrations, and resolution services belong in `packages/core`.
- Public HTTP contracts, if later approved, belong in `packages/protocol` and `packages/server`.
- Client code may depend on Schema and Protocol but not Core or Server.
- Any later public Protocol or Server `HttpApi` change requires `bun run generate` from `packages/client`; generated sources are never edited directly.

## Gate exit criteria

The gate passes only when all required documents exist, AC01-AC10 are traceable, B1A-B1E each define tests and evidence, old-data compatibility and rollback are explicit, and no product code has changed. Implementation begins only after explicit review approval.
