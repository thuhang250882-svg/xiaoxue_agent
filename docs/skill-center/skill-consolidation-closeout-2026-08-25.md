# Skill consolidation closeout — 2026-08-25

## Frozen outcome

- `PLATFORM_EFFECTIVE_SKILLS = 69`
- Top-level effective Skill definitions: **75 → 69**.
- Top-level physical Skill directories: **78 → 72**.
- No further physical Skill deletion or archive target is authorized by this batch.
- `autoresearch`, `image-well`, and `nano-banana-pro` remain platform capabilities.

## Consolidation exact files

`CONSOLIDATION_EXACT_FILES` contains exactly the following 21 paths:

| Status | Path |
| --- | --- |
| DELETED | `.opencode/skills/effect/SKILL.md` |
| DELETED | `.opencode/skills/long-document-writing/SKILL.md` |
| DELETED | `.opencode/skills/long-document-writing/references/skill-summary.md` |
| MODIFIED | `.opencode/skills/office-assistant/SKILL.md` |
| NEW, FORCE_ADDED_IGNORED_ASSET | `.opencode/skills/office-assistant/references/humanizer-readme.md` |
| NEW, FORCE_ADDED_IGNORED_ASSET | `.opencode/skills/office-assistant/references/humanizer.md` |
| NEW, FORCE_ADDED_IGNORED_ASSET | `.opencode/skills/office-assistant/references/long-document-writing-summary.md` |
| NEW, FORCE_ADDED_IGNORED_ASSET | `.opencode/skills/office-assistant/references/long-document-writing.md` |
| NEW, FORCE_ADDED_IGNORED_ASSET | `.opencode/skills/office-assistant/references/meeting-minutes-manager.md` |
| NEW, FORCE_ADDED_IGNORED_ASSET | `.opencode/skills/office-assistant/references/meeting-minutes-templates.md` |
| MODIFIED | `docs/skill-center/phase4.0-removal-registry-2026-08-23.tsv` |
| NEW | `docs/skill-center/skill-consolidation-closeout-2026-08-25.md` |
| MODIFIED | `packages/desktop/resources/integrity.json` |
| MODIFIED | `packages/opencode/src/agent/agent.ts` |
| MODIFIED | `packages/opencode/src/skill/migration/engine.ts` |
| MODIFIED | `packages/opencode/src/skill/migration/registry.ts` |
| MODIFIED | `packages/opencode/src/skill/migration/types.ts` |
| MODIFIED | `packages/opencode/test/skill/phase31a-internal-specialist.test.ts` |
| MODIFIED | `packages/opencode/test/skill/reference-integrity.test.ts` |
| MODIFIED | `packages/opencode/test/skill/skill-migration-production-fixture.test.ts` |
| MODIFIED | `packages/opencode/test/skill/skill-migration.test.ts` |

`unrelated_files = 0`

Runtime `.migration-state.json` and `.migration-backup/` are deliberately excluded: they are machine-local rollback evidence, not release source assets.

## Removed as redundant

| Skill | Replacement or retained capability | Migration |
| --- | --- | --- |
| `effect` | `.opencode/references/effect-smol` | `rm-effect-2026-08-24` |
| `minimax-pdf` | `pdfkit-py` and `minimax-docx` | `rm-minimax-pdf-2026-08-24` |
| `sci-employee-deep-research` | `deep-research` | `rm-sci-employee-deep-research-2026-08-25` |

## Merged into `office-assistant`

| Source Skill | Preserved reference assets | Migration |
| --- | --- | --- |
| `long-document-writing` | `long-document-writing.md`, `long-document-writing-summary.md` | `merge-long-document-writing-2026-08-25` |
| `meeting-minutes-manager` | `meeting-minutes-manager.md`, `meeting-minutes-templates.md` | `merge-meeting-minutes-manager-2026-08-25` |
| `humanizer` | `humanizer.md`, `humanizer-readme.md` | `merge-humanizer-2026-08-25` |

The six reference files are byte-for-byte copies of their source knowledge assets. `office-assistant/SKILL.md` routes long-document continuation, professional meeting minutes, and writing naturalization to these references. The three independent office-subagent allowlist entries are removed.

## Migration safety

- A source directory is moved only when its complete SHA-256 manifest matches a registered fingerprint.
- Known historical fingerprints are explicit; modified or unknown same-name assets are preserved.
- Each migration remains independently recoverable with `SkillMigration.rollback(configDir, migrationId)`.
- Machine-local execution evidence remains under `E:\software programming\opencode-dev\.migration-state.json` and `E:\software programming\opencode-dev\.migration-backup`.

## Clean-room verification

| Gate | Result |
| --- | --- |
| Clean-room asset universe | 72 physical directories / 69 effective top-level Skills |
| Production-equivalent migration fixture | 4 passed / 0 failed |
| Complete tracked Skill test suite | 65 passed / 0 failed |
| Agent and Xiaoxue suites | 146 passed / 0 failed |
| Desktop resource-integrity sync | 1 passed / 0 failed |
| Reference missing | 0 |
| Consolidated capability reachability | PASS |
| `bun typecheck` (`tsgo --noEmit`) | PASS |
| New typecheck errors against clean baseline | 0 |

Typecheck A/B:

- Dirty source worktree: four `TS2344` errors, all in the untracked Qoder file `packages/opencode/script/phase3.5C-1-identity-and-archive-gate.ts`.
- Exact clean worktree: zero errors.
- Classification: `EXCLUDED_UNRELATED_DIRTY_WORK`, not consolidation debt and not part of `CONSOLIDATION_EXACT_FILES`.

The clean-room ignored Skill universe was materialized from the isolated
`archive-batch1@9add69b5c33172cee814f11a4d85dc1bc9250e95` snapshot. Files required by
the committed resource manifest were then byte-verified against their recorded
SHA-256 before materialization. None of these fixture-only files are staged.

Capability results:

- `long_document_capability = PASS`
- `meeting_minutes_capability = PASS`
- `humanizer_capability = PASS`
- Runtime discovery contains `office-assistant` and excludes all three former top-level specialists.

The clean worktree and final commit SHA are recorded in the delivery response for this batch.

## Next boundary

Further Skill-count reduction is prohibited. RC reduction must use a release allowlist/profile so platform-only Skills remain in the repository without entering the Xiaoxue RC runtime or installer.
