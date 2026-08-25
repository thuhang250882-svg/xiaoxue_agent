# Mainline RC integration status — 2026-08-25

## Scope

This mainline is release-only. Skill governance is frozen. The integration starts from
`7501b99b15220c9c5e180802338864411e0d2a88` and closes only installer, exact RC resource,
clean-install/core-smoke, lifecycle, and artifact trust gates.

## Branch and worktree decision

- Full local worktree, local branch, and `origin/*` inventory is recorded in
  `BRANCH_WORKTREE_AUDIT_2026-08-25.tsv`.
- The protected dirty `migration-hardening` worktree was not changed.
- Model branches and Phase 4.x Skill-governance branches are `POST_RC_BACKLOG`.
- Historical RC6 evidence branches are archive-only.
- `rc6-install-fix` was not merged. Only selected installer/lifecycle fixes were applied.

## Selected release changes

- `207d69352ec3c73249e1bfaa612aedbce213046c`: remove the unnecessary native
  `tree-sitter-powershell` trusted postinstall.
- `09e54fc912ec0e5bb0f98fc99d4c40e986178111`: declare root `yaml` and `zod` domain
  dependencies.
- `24dcfecb959d7b03f12753c25719d1f1f79f5608` and
  `a82284f47739180c93e78ed9c03668c237646c3a`: pin and normalize the bundled Python
  runtime.
- `ed4f167453df915e0905e3f2aabb7a0ea0d21308`: synchronize generated-manifest and
  packaged-verifier exclusions.
- The latest RC6 release-prep and lifecycle scripts were selected without importing
  superseded RC6 product, Skill, or historical evidence changes.

## Self-contained frozen platform baseline

The 7501 Git snapshot tracked only the changed subset of the frozen catalog; the remaining
catalog files existed only as ignored files in the clean consolidation worktree. The exact
frozen catalog was materialized into this mainline without a new governance decision:

- effective Skills: 69
- physical Skill directories: 72
- profile missing: 0
- profile unexpected: 0
- protected platform-only Skills retained: `autoresearch`, `image-well`,
  `nano-banana-pro`

Text resources covered by integrity manifests are fixed to LF through `.gitattributes`, so
their committed hashes are stable across Windows and non-Windows clean checkouts.

## RC release contract

- profile: `configs/xiaoxue/rc-release-profile.json`
- expected RC Skills: 11
- materializer: `packages/desktop/scripts/materialize-xiaoxue-rc-skills.ts`
- build selector: `XIAOXUE_RELEASE_PROFILE=rc`
- staging manifest includes RC Skills, Obsidian resources, and the prepared Python runtime
- strict prep verifies the exact 11-Skill set and the frozen source SHA

`FINAL_RC_SOURCE_SHA` is the commit containing this status and the selected release changes.
Installer and lifecycle evidence must refer to that exact commit.
