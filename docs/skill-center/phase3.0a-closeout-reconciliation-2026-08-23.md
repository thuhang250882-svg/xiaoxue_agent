# Phase 3.0A — Closeout Reconciliation Report

**Date:** 2026-08-23
**Branch:** `dev`
**Scope:** ledger / statistics / baseline reconciliation only.
No Skill merges, no archives, no discovery refactors, no TypeScript
upgrade. Behavior of Phase 3.0 is unchanged (see §7).

---

## 1. Phase 3.0 commit accounting — corrected

The Phase 3.0 report originally said "three commits" / "four
commits" in different places while five commits actually landed.
Corrected accounting:

| # | SHA          | Subject                                                    | Category             |
|---|--------------|------------------------------------------------------------|----------------------|
| 0 | `eef30e4ccd` | `chore(skills): commit phase 2.5 amendments as baseline`   | Phase 2.5 baseline   |
| 1 | `75db1974e4` | `test(skills): enforce referenced skill integrity`         | Phase 3.0 functional |
| 2 | `c1b7adce20` | `fix(skills): consolidate mud logging review skill`        | Phase 3.0 functional |
| 3 | `cfda75c426` | `chore(skills): normalize skill files to UTF-8`            | Phase 3.0 functional |
| 4 | `fde0743887` | `docs(skills): add phase 3.0 safe consolidation report`    | Phase 3.0 docs       |

**Total: 5 commits = 1 baseline + 3 functional + 1 docs.**

Phase 3.0A itself adds exactly one more docs commit (this report +
the doc annotations); it adds no functional commits.

---

## 2. TypeScript crash — final root cause (single conclusion)

### 2.1 Conflicting claims being reconciled

- Phase 2.5 report (§5.3): crash reproduces in a clean worktree;
  it is a TypeScript 5.8.2 compiler bug, unrelated to repo edits.
- Phase 3.0 report (§11): crash reproduces "only in the dirty
  `.db-rehearsal` worktree".

These cannot both be true. Phase 3.0A re-ran the minimal A/B.

### 2.2 Experiment record

Environment:

```text
TypeScript : 5.8.2 (bunx --bun tsc, workspace catalog dependency)
Bun        : 1.3.14
Node       : v24.15.0
tsconfig   : packages/opencode/tsconfig.json
command    : bunx --bun tsc --noEmit -p tsconfig.json  (exact historical crash command)
cwd        : packages/opencode
```

Note: `bun run typecheck` executes **tsgo 7.0.0-dev**
(`@typescript/native-preview`), not tsc 5.8.2. The historical crash
always came from the raw `tsc` command.

| Case | Worktree state | exit code | result |
|------|----------------|----------:|--------|
| B    | current tree, `.db-rehearsal` present        | 1 | crash at `_tsc.js:16876` (`undefined is not an object (evaluating 'node.kind')`), chain `getIsDeclarationVisible → indexInfoToObjectComputedNamesOrSignatureDeclaration` |
| A/C  | identical tree, `.db-rehearsal` renamed away | 1 | **identical crash**, same stack |
| Node control | same command under bare `node` (no Bun) | 1 | identical crash — Bun runtime is not a factor |
| tsgo | `bun typecheck` with and without `.db-rehearsal` | 0 | passes both |

(`.db-rehearsal` is git-ignored and untracked; renaming it away does
not change any tracked file, so Case A/C differ from Case B only by
that directory. Logs: `.tmp/p30a-tsc-B.log`, `.tmp/p30a-tsc-A.log`,
`.tmp/p30a-node-tsc.log`, `.tmp/p30a-tsc-ab-summary.log`.)

### 2.3 Is `.db-rehearsal` in the tsconfig file set?

No. `tsc --noEmit -p tsconfig.json --listFilesOnly` lists 4369
files; **0** of them match `.db-rehearsal` (or `.tmp`). The package
tsconfig has no `include`/`exclude`, so its file set is confined to
`packages/opencode/**` plus resolved imports. `.db-rehearsal` sits
at the repo root and is structurally unreachable from that scope.

### 2.4 Final conclusion (only one is kept)

> The crash is a **deterministic TypeScript 5.8.2 compiler bug**
> (checker crash in `getModifierFlagsWorker` via declaration
> visibility), reproducible on Bun and Node, with or without
> `.db-rehearsal`. `.db-rehearsal` is not part of the file set and
> is not the cause.

This is therefore **not** recorded as "typecheck scope pollution /
temporary-directory issue" — the pollution hypothesis is refuted.
The Phase 2.5 conclusion (compiler bug, clean-tree reproducible) is
the one retained; the Phase 3.0 §11 sentence is corrected in place
and marked superseded.

### 2.5 Fix recommendation (no upgrade executed this phase)

1. Keep `bun run typecheck` (tsgo 7.0.0-dev) as the canonical
   typecheck — it already passes (exit 0). Done since upstream
   commit `62e5f4b154` ("try tsgo", 2025-10-14).
2. Do not invoke raw `bunx --bun tsc` in CI/docs; treat tsc 5.8.2
   output as unsupported for this workspace.
3. When a TypeScript bump is scheduled (separate decision window),
   move the catalog `typescript` to ≥ 5.9.x (checker fixes) — the
   crash site is a known-class checker regression, and newer tsgo
   builds do not hit it.
4. No code change is required in RC6 scope: the sanctioned
   typecheck path is green.

---

## 3. Unified Skill Counting Model

All numbers below are recomputed by `.tmp/p30a-counting-model.ts`
(no hand-filled values; rerun any time to reproduce).

| metric                        | count | definition                                                                                     |
|-------------------------------|------:|------------------------------------------------------------------------------------------------|
| `repository_skill_md`         |    87 | every `SKILL.md` under `.opencode/skills/**` (recursive)                                        |
| `repository_skill_md_top_level` |  76 | top-level skill dirs with a direct `SKILL.md`                                                   |
| `nested_skill_md`             |    11 | recursive minus top-level (deep-research sub-skills ×10, `yourself-skill/selves/example_me`)   |
| `discovery_visible_skill_md` (runtime glob matches) | 87 | runtime pattern `{skill,skills}/**/SKILL.md` from `.opencode` (recursive, dot=false) |
| `discovery_visible_names` (runtime registry) | 77 | distinct frontmatter `name:` in the runtime set; 10 nested files have **no `name:` field** and are silently skipped by `add()`, `example_me` is the only nested survivor |
| `integrity_test_discovery`    |    76 | top-level-only discovery model used by `reference-integrity.test.ts`                            |
| `builtin_skills`              |     1 | `customize-opencode`, registered with `location: "<built-in>"`, no SKILL.md                    |
| `archived_skill_md`           |     1 | `.opencode/.archive/mud-logging-review/SKILL.md` — never discovered (glob cannot reach `.archive`) |
| `configured_only_nodes`       |     0 | referenced ids that resolve to nothing on disk (integrity `missing` count, recomputed)          |
| `portfolio_nodes`             |    80 | rows in `skill-dependency-matrix-2026-08-22.tsv` (77 physical rows + 3 zombie rows)             |

### 3.1 Set reconciliation (why 80 / 87 / 77 / 76 all coexist)

```text
portfolio ledger (80)
├── physical_SKILL_md rows ........ 77   (matrix node_source column)
│   ├── still discoverable ........ 76   = integrity-test discovery
│   │                                 (mud-logging-review row is the 77th:
│   │                                  its SKILL.md now lives in .archive)
│   └── zombie rows ...............  3   contract-management / github-ai-trends / llm-wiki
│                                       (configured_only_skill_id_no_SKILL_md;
│                                        residual dirs exist but hold NO SKILL.md)
└── builtin (not a ledger row) .... 1   customize-opencode

repository SKILL.md files (87)
├── top-level ..................... 76   == integrity-test discovery set
└── nested ........................ 11   matched by the runtime glob, but 10 of
                                         them have no frontmatter name and are
                                         dropped at registration; 1 (example_me)
                                         registers under its parent pack's umbrella
runtime registry names (77) = 76 top-level names + example_me
integrity invariant (77)    = 76 top-level names + 1 builtin
```

The two 77s are **different sets that happen to have the same size**:
the runtime registry contains `example_me` and lacks the builtin;
the integrity universe contains the builtin and lacks `example_me`.
Both arithmetic identities hold:

- `87 = 76 + 11` (physical files)
- `80 = 77 physical rows + 3 zombie rows` (ledger)
- `77 = 76 + 1` (integrity discovery + builtin)

### 3.2 Reproducibility

```powershell
bun .tmp/integrity-snapshot.ts    # rewrites skill-reference-integrity TSV + footer
bun .tmp/p30a-counting-model.ts   # prints every number in §3
```

---

## 4. Zombie / deprecated final states

Code evidence (re-verified this phase):

| id                   | SKILL.md on disk | residual files | runtime reference | final state          |
|----------------------|------------------|----------------|-------------------|----------------------|
| `contract-management`| none             | `references/` (3 md) | none in the 6 scanned sources; only stale `integrity.json` manifest entries | `ZOMBIE_CLEANED` |
| `github-ai-trends`   | none             | `_skillhub_meta.json`, `scripts/fetch_trends.py` | none; only stale `integrity.json` entries | `ZOMBIE_CLEANED` |
| `llm-wiki`           | none             | `_skillhub_meta.json` | none (the `agent.ts:488` typo was fixed in Phase 3.0 commit 2); only stale `integrity.json` entries | `ZOMBIE_CLEANED` |
| `mud-logging-review` | in `.opencode/.archive/` only | full SKILL.md + `DEPRECATED.md` | none (proven by `phase3-snapshot.test.ts`) | `DEPRECATED_MIGRATED` |

`mud-logging-review` is **not** a zombie and is no longer classified
as one anywhere. It had a live SKILL.md until Phase 3.0 migrated it.
The Phase 2.5 zombie list (3 items) was already correct and is
confirmed by evidence — the only reclassification is pulling
`mud-logging-review` out of zombie wording that crept into the
Phase 3.0 report and one test comment.

Documents synchronized (history preserved, annotated
`superseded by Phase 3.0A` where wording changed):

1. `skill-dependency-matrix-2026-08-22.tsv` — `mud-logging-review`
   row recommendation now carries the DEPRECATED_MIGRATED marker.
2. `skill-dependency-graph-2026-08-22.md` — header note + Mermaid
   node label updated; ZOMBIE subgraph already listed exactly the 3
   real zombies (unchanged).
3. `phase2.5-amendment-report-2026-08-22.md` — header annotation
   confirming its zombie list and tsc conclusion survive re-check.
4. `phase3-change-list-2026-08-22.md` — header annotation.
5. `phase3.0-safe-consolidation-report-2026-08-23.md` — §1/§11/§12/§13
   corrected in place.
6. `reference-integrity.test.ts` — comment-only correction of the
   zombie wording (no behavior change; 177/177 still pass).

---

## 5. Integrity Test Coverage declaration

Per-source reference counts are recomputed from
`skill-reference-integrity-2026-08-23.tsv` (regenerated this phase;
252 references, 0 missing).

| # | source category                    | status        | structured refs | notes |
|---|------------------------------------|---------------|----------------:|-------|
| 1 | Agent allowlist (`agent.ts`)       | SCANNED       | 101 | dedicated brace-block parser |
| 2 | xiaoxue-router (`xiaoxue-router.ts`) | SCANNED     |  49 | `skill:` field parser with TS-type-name filter |
| 3 | `configs/xiaoxue/router.md`        | SCANNED       |  28 | table-row parser |
| 4 | `configs/xiaoxue/skills.yaml`      | SCANNED       |   6 | yaml key parser |
| 5 | Skill Center (lifecycle/alias mechanism) | NOT_APPLICABLE | scanned, 0 structured Skill references | no formal Skill Center lifecycle config exists in this repo; `skills.yaml` (row 4) is its only physical config and is scanned |
| 6 | workflow configs (`configs/*.yaml`, `configs/xiaoxue.yaml`) | SCANNED | scanned, 0 structured Skill references | `xiaoxue.yaml` has a `skills:` list of *domain workflow names* (`geology_report_review`, …) matching `configs/xiaoxue/*.md` domain files — no Skill ID, no code consumer found in `packages/` |
| 7 | structured prompt Skill refs (`configs/xiaoxue/*.md` prompts) | SCANNED | 1 | single free-text mention `office-assistant` in `office.md`; resolvable; prose, not a runtime structural reference |
| 8 | SKILL.md-to-SKILL.md refs          | SCANNED (structural fields only) | scanned, 0 structured Skill references | 87 frontmatter blocks scanned for dependency-style fields; the only hit (`pptx-generator` `dependencies: pip install python-pptx`) is a pip command, not a Skill id. Free-text body mentions are intentionally NOT treated as runtime references |
| 9 | registry/config (`packages/desktop/resources/integrity.json`) | SCANNED | 3 stale zombie entries | packaging manifest only — not consulted by Skill discovery; see open issue O-1 |
| 10 | tests (`portable-skills.test.ts`, `xiaoxue-router.test.ts`) | SCANNED | 31 + 37 | imported-array parser + expectation parser |

Invariant result: `referenced (252) − discovered (77) ∪ aliases (0) = 0 missing`.

The integrity test deliberately does **not** treat documentation
prose, audit reports, README/CHANGELOG, or SKILL.md body text as
runtime references.

---

## 6. Behavior invariant (Phase 3.0 unchanged)

`git diff` of this phase (before its own commit):

```text
docs/skill-center/*.md|tsv          5 files, annotations only
packages/opencode/test/skill/reference-integrity.test.ts   comment-only (+5/−3 lines)
```

No changes to: L0 set (still 8), router rules, allowlists,
`skills.yaml`, discovery code, Skill lifecycle, TypeScript version.
No second Skill merged, no batch archive, no L3/L4 processing.
No P0 runtime bug attributable to Phase 3.0 was found (see O-1 for
a pre-existing packaging-manifest drift that predates Phase 3.0).

---

## 7. Final acceptance results

Command:

```powershell
cd packages/opencode
bun test test/skill test/agent test/xiaoxue test/cross-spawn-spawner --timeout 60000
```

| suite                         | pass | fail |
|-------------------------------|-----:|-----:|
| Skill Reference Integrity     |  ✓   |  0   |
| Available Skills Snapshot     |  ✓   |  0   |
| Skill discovery / agent perm  |  ✓   |  0   |
| Xiaoxue router                |  ✓   |  0   |
| portable skill                |  ✓   |  0   |
| **opencode totals**           | **177** | **0** |

Desktop Skill Center / integrity tests (exist and were run):

```powershell
cd packages/desktop
bun test src/main/skills.test.ts src/main/skills-config.test.ts src/main/resource-integrity.test.ts src/main/xiaoxue-localization.test.ts --timeout 60000
```

| suite             | pass | fail |
|-------------------|-----:|-----:|
| desktop skill/integrity/localization | **9** | **0** |

Acceptance invariants:

- 0 missing references ✔
- `geolog-logging-review` present ✔
- `mud-logging-report-generation` present ✔
- `mud-logging-review` absent from every user-callable surface ✔
- `bun typecheck` (tsgo) exit 0 ✔

**Final test totals: 177 + 9 = 186 pass, 0 fail**
(521 + 22 = 543 expect() calls).

---

## 8. Open issues (awareness only, none introduced by Phase 3.0)

- **O-1 Desktop packaging manifest drift (pre-existing).**
  `packages/desktop/resources/integrity.json` was last regenerated
  2026-08-04 (`1a5373c579`). Reproducing `resource-integrity-core.ts
  verify()` against today's `.opencode/skills` yields: 429 manifest
  entries vs 681 files on disk; 3 ghost entries for zombie Skills
  (contract-management / github-ai-trends / llm-wiki); 8 hash
  mismatches from Phase 2.x/3.0 content edits. Startup verification
  would throw. This drift predates Phase 3.0 (the Phase 3.0 commit
  actually removed one would-be ghost entry). **Recommended fix:**
  run `bun packages/desktop/scripts/generate-resource-integrity.ts`
  immediately before the next packaging run (Gate A already mandates
  manifest freshness). Not executed here: out of Phase 3.0A scope.

- **O-2 `configured_only_nodes` vs residual zombie directories.**
  The 3 zombie dirs still hold residual non-SKILL.md files. They are
  inert for discovery, but they keep `integrity.json` regeneration
  (O-1) from being a pure no-op. Candidate for a future cleanup
  phase together with L4 archives.

---

## 9. Final verdict

```text
Phase 3.0A: PASS

Canonical counts
  portfolio_nodes            = 80  (77 physical rows + 3 zombie rows)
  repository_skill_md        = 87  (76 top-level + 11 nested)
  discovered skills          = 77  (76 top-level names + 1 builtin)
  runtime registry names     = 77  (76 top-level + example_me; 10 nameless nested files dropped)
  archived_skill_md          = 1   (.opencode/.archive/mud-logging-review)
  configured_only_nodes      = 0   (0 missing references)

TypeScript crash final root-cause status
  Deterministic TypeScript 5.8.2 compiler bug
  (getModifierFlagsWorker / declaration-visibility chain).
  Reproducible with AND without .db-rehearsal, on Bun AND Node;
  .db-rehearsal is not in the tsconfig file set.
  NOT scope pollution. Sanctioned typecheck (tsgo) is green.
  Fix recommendation given; no upgrade executed this phase.

Zombie/deprecated final states
  contract-management = ZOMBIE_CLEANED
  github-ai-trends    = ZOMBIE_CLEANED
  llm-wiki            = ZOMBIE_CLEANED
  mud-logging-review  = DEPRECATED_MIGRATED

Integrity coverage
  10/10 source categories declared (6 SCANNED with refs,
  3 SCANNED with 0 structured refs, 1 NOT_APPLICABLE);
  252 references, 0 missing.

Test result
  177 pass / 0 fail (packages/opencode) + 9 pass / 0 fail
  (packages/desktop skill/integrity suites) = 186 pass / 0 fail.

Whether Phase 3.1 is safe to start
  YES from a consistency standpoint: ledgers, counts, root cause and
  classifications are now single-sourced and script-reproducible.
  Two pre-existing items to carry into Phase 3.1 planning: O-1
  (regenerate integrity.json before next packaging) and O-2 (zombie
  residual files). Per the user's instruction, Phase 3.1 is NOT
  started by this run.
```

**停止。等待用户和 GPT 审核之后再决定是否进入 Phase 3.1。**
