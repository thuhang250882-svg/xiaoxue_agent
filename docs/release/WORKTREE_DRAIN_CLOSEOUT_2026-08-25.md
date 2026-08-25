# Final worktree drain and history preservation — 2026-08-25

## Frozen product boundary

```text
PRODUCT_RC_SOURCE_SHA = 41a2f1ef6e27d0583fe23c8e9376c8d4d2014822
CURRENT_RC_REQUIRED_MODEL_COMMITS = 0
CURRENT_RC_PRODUCT_CHANGES_LOST = NO
CURRENT_RC_UNEXPECTED_CHANGES_ADDED = NO
```

The `dev` branch advances beyond the frozen product SHA only through docs-only release
closeout commits. The product RC source remains permanently anchored by the annotated
tag `xiaoxue-internal-rc-20260825`.

## Model registry disposition

All 16 previously unknown commits were reviewed. The canonical eight-commit model
registry lineage is `POST_RC_BACKLOG`; the eight parallel RC6 adaptations are
`SUPERSEDED`. No model-registry commit is required by the frozen RC. Exact per-commit
fields and decisions are recorded in `MODEL_REGISTRY_FINAL_REVIEW_2026-08-25.tsv`.

## History preservation

Historical commit tips are preserved by annotated tags:

- `archive-model-registry-recovery-20260825`
- `archive-model-e2e-fixes-20260825`
- `archive-phase4-recovery-20260825`
- `archive-rc6-install-fix-20260825`
- `archive-rc6-model-base-20260825`
- `archive-rc6-registry-recovery-20260825`
- `archive-rc6-release-base-20260825`
- `archive-xiaoxue-mvp-20260825`
- `archive-migration-hardening-dirty-20260825`

The migration-hardening dirty state is also recoverable from tagged stash commit
`026ffbe0af53649a339dacb65707c2d72146c9ef`.

## Evidence archive

```text
path = E:\software programming\opencode-worktree-evidence-archive\20260825
manifest = evidence-manifest.tsv
manifest_rows_verified = 193
manifest_sha256 = 79ED43F4150A28D8CBEC84E2190A22963D726E6B6FAF4F2D12A2585EE30CDE4B
tracked_patches_reverse_apply_verified = 8/8
untracked_files_copied_and_source-hash-verified = 167
excluded_build_cache_files = 34
```

The archive excludes `node_modules`, build, dist, cache, Python bytecode, and staging
outputs. It retains binary tracked patches, status/diff inventories, formal documents,
evidence, scripts, reports, JSON results, and all non-build untracked files selected by
the preservation rules.

## Consolidation result

```text
registered_worktrees_before = 25
registered_worktrees_target = 1
local_branches_before = 27
local_branches_target = 1
remote_branches_deleted = 0
```

Four non-Git directories remain manual deletion candidates and were not deleted. Their
file counts and decisions are recorded in `MANUAL_DIRECTORY_DRAIN_AUDIT_2026-08-25.tsv`.
