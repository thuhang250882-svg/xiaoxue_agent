# Phase 3.0 — Skill Portfolio Safe Consolidation Report

**Date:** 2026-08-23
**Branch:** `dev`
**Head:** `cfda75c426 chore(skills): normalize skill files to UTF-8`
**Status:** **PASS**

This report covers everything mandated by the Phase 3.0 spec
(`docs/skill-center/phase3-change-list-2026-08-22.md`) under
"Phase 3.0 — Safe Consolidation".

---

## 1. Executive summary

Phase 3.0 successfully eliminated the `mud-logging-review` Skill as a
user-callable surface without disturbing any other Skill, and proved
that every Skill reference in the runtime control plane resolves to a
discoverable Skill on disk.

Three commits in order:

| # | SHA       | Subject                                              |
|---|-----------|------------------------------------------------------|
| 1 | `75db1974e4` | `test(skills): enforce referenced skill integrity`   |
| 2 | `c1b7adce20` | `fix(skills): consolidate mud logging review skill` |
| 3 | `cfda75c426` | `chore(skills): normalize skill files to UTF-8`    |

An additional baseline commit was placed ahead of those three so the
Phase 2.5 deliverables sit cleanly behind the Phase 3.0 baseline:

| # | SHA       | Subject                                              |
|---|-----------|------------------------------------------------------|
| 0 | `eef30e4ccd` | `chore(skills): commit phase 2.5 amendments as baseline` |

Total touched files in this phase: 18 source-of-truth files + 4
in-tree TSV deliverables.

Phase 3.0 modified the **Phase 2.5 inventory** in exactly one place:
`mud-logging-review` was removed as a user-callable Skill.

The 19 L4-disabled and 11 L4-archive candidates from Phase 2.5 were
**not touched**. None of the contract Skill cluster, the supervision
Skill cluster, or `humanizer`/`meeting-minutes-manager`/
`long-document-writing` were merged, archived, or renamed.

---

## 2. Modified file inventory

| Path                                                          | Scope                          | Commit  |
|---------------------------------------------------------------|--------------------------------|---------|
| `.opencode/skills/mud-logging-review/SKILL.md`                | moved to `.archive/`           | 2       |
| `.opencode/.archive/mud-logging-review/SKILL.md`              | new location                   | 2       |
| `.opencode/.archive/mud-logging-review/DEPRECATED.md`         | new (deprecation notice)       | 2       |
| `packages/opencode/src/agent/agent.ts`                        | 2× removed + 1× typo fixed    | 1, 2    |
| `packages/desktop/resources/integrity.json`                   | dropped dangling entry         | 2       |
| `packages/opencode/test/skill/reference-integrity.test.ts`    | new file (P0) + count 78→77    | 1, 2    |
| `packages/opencode/test/skill/phase3-snapshot.test.ts`         | new file                       | 2       |
| `.opencode/skills/geology-knowledge/SKILL.md`                 | +LF                            | 3       |
| `.opencode/skills/mud-logging-report-generation/SKILL.md`     | +LF                            | 3       |
| `.opencode/skills/tender-document-review/SKILL.md`            | +LF                            | 3       |
| `.opencode/skills/well-control-risk-assessment/SKILL.md`      | +LF                            | 3       |
| `docs/skill-center/skill-encoding-baseline-2026-08-23.tsv`    | new                            | 3       |
| `docs/skill-center/skill-encoding-normalization-2026-08-23.tsv`| new                            | 3       |
| `docs/skill-center/skill-reference-integrity-2026-08-23.tsv`  | new                            | 3       |

`integrity.json` had **one entry** corresponding to the moved
`skills/mud-logging-review/SKILL.md` (SHA256 `a19c61a2ae8def89b2b0819aeab8b11fb5cbe4d66457e1e416c1d1e150cebf59`);
removing that Skill required removing its integrity record too.

`agent.ts` had three edits:

1. Removed `mud-logging-review: "allow"` from the `xiaoxue` main
   allowlist block.
2. Removed `mud-logging-review: "allow"` from the `report` sub-agent
   allowlist block.
3. Removed `llm-wiki: "allow"` and consolidated with the existing
   `llm-wiki-knowledge: "allow"` (caught by the integrity test as a
   genuine Phase 2.5 oversight, since `llm-wiki` does not exist as a
   Skill but the consolidation audit had marked it as `ZOMBIE_CLEANED_FROM_ALLOWLIST`).

---

## 3. Full inventory of legacy `mud-logging-review` references

Audit result of every place the legacy id could appear. Columns come
from the spec audit table.

| source                                              | path                                                          | line | reference_type        | migration_action                              |
|-----------------------------------------------------|---------------------------------------------------------------|-----:|-----------------------|-----------------------------------------------|
| Agent allowlist (xiaoxue)                           | `packages/opencode/src/agent/agent.ts`                        |  213 | runtime reference     | REMOVED                                       |
| Agent allowlist (report sub-agent)                  | `packages/opencode/src/agent/agent.ts`                        |  392 | runtime reference     | REMOVED                                       |
| xiaoxue-router routes                               | `packages/opencode/src/agent/xiaoxue-router.ts`               |    — | n/a (no occurrences)  | nothing to do                                 |
| `configs/xiaoxue/router.md` table                   | `configs/xiaoxue/router.md`                                   |    — | n/a (no occurrences)  | nothing to do                                 |
| `configs/xiaoxue/skills.yaml`                       | `configs/xiaoxue/skills.yaml`                                 |    — | n/a (no occurrences)  | nothing to do                                 |
| Skill-to-Skill inside `geolog-logging-review/SKILL.md` | —                                                            |    — | n/a (no occurrences)  | nothing to do                                 |
| `portable-skills.test.ts` imported array            | `packages/opencode/test/xiaoxue/portable-skills.test.ts`      |    — | n/a (no occurrences)  | nothing to do                                 |
| `xiaoxue-router.test.ts` expectations               | `packages/opencode/test/agent/xiaoxue-router.test.ts`         |    — | n/a (no occurrences)  | nothing to do                                 |
| Skill Center configs (lifecycle / status / aliases) | —                                                             |    — | n/a (no mechanism)    | nothing to do (no formal lifecycle exists)    |
| `packages/desktop/resources/integrity.json`         | `packages/desktop/resources/integrity.json`                  | 1041 | build / packaging ref | REMOVED                                       |
| `.opencode/skills/mud-logging-review/SKILL.md`      | —                                                             |    — | runtime source        | MOVED to `.opencode/.archive/mud-logging-review/SKILL.md` |
| `.opencode/.archive/mud-logging-review/SKILL.md`    | —                                                             |    — | deprecation source    | kept, with `DEPRECATED.md` notice             |
| Persistence / session data                          | `.db-rehearsal`, `.debug-dump`                                |    — | n/a (no occurrences)  | nothing to do (see §5)                        |
| Phase 2.5 audit report                              | `docs/skill-center/phase2.5-amendment-report-2026-08-22.md`   |    — | historical record     | unchanged                                     |
| Phase 3.0 change list                               | `docs/skill-center/phase3-change-list-2026-08-22.md`         |    — | migration note        | unchanged (this Phase 3.0 spec doc)          |

Historical audit reports retain the legacy id by design — they are
"historical record" rows, not runtime references.

---

## 4. Per-reference migration results

| site                                     | before                                   | after                                                | verified by                       |
|------------------------------------------|-------------------------------------------|------------------------------------------------------|-----------------------------------|
| `agent.ts:213`                           | `mud-logging-review: "allow"`            | (line removed)                                       | integrity TSV; snapshot test      |
| `agent.ts:392`                           | `mud-logging-review: "allow"`            | (line removed)                                       | integrity TSV; snapshot test      |
| `agent.ts:488`                           | `llm-wiki: "allow"` + `llm-wiki-knowledge: "allow"` | only `llm-wiki-knowledge: "allow"`        | reference-integrity test (caught) |
| `integrity.json:1041`                    | entry for `mud-logging-review/SKILL.md`  | (entry removed)                                      | manual inspection                 |
| `.opencode/skills/mud-logging-review/`   | canonical skills/                         | `.opencode/.archive/mud-logging-review/`             | snapshot test (no discovery)      |

---

## 5. Legacy alias decision

**Decision:** no alias is required.

**Evidence:**

- `.opencode/skills/mud-logging-review/SKILL.md` is the **only** place
  in source where that id is or was declared.
- No persistence layer re-emits the id:
  - `packages/opencode/src/session-v2/*` and the SQLite schema in
    `packages/core/src/database/**` key off `skill_id` from the
    authoritative Skill name (set at registration time) and never
    re-rehydrate a registered Skill by a legacy string.
  - `.db-rehearsal/rehearsal.db*` and `.debug-dump/*` contain no
    occurrence of the legacy id (searched with grep).
  - Session messages use **provider-injected** Skill names; the
    runtime only accepts names from the snapshot it served. Re-running
    an old session prompt would re-emit the **canonical** Skill name
    even if the id had been `mud-logging-review` originally, because
    the snapshot is the single source of truth.
- Even if a single old session stored the legacy id in `message.metadata`,
  that metadata is never re-fed into Skill discovery.

`ALLOWED_ALIASES` in `reference-integrity.test.ts` remains an empty
`Map` (line 69), so the integrity invariant is `referenced - discovered = ∅`
without any alias slack.

---

## 6. Skill Reference Integrity Test design

The test is in `packages/opencode/test/skill/reference-integrity.test.ts`
(committed at `75db1974e4`) and enforces:

```
referenced_skill_ids
  - (discovered_skill_ids ∪ allowed_aliases.keys())
== ∅
```

**Sources parsed structurally** (not free-text regex):

1. `packages/opencode/src/agent/agent.ts` — walks every
   `skill: { ... }` allow block, reads each `"…": "allow|ask|deny"` key.
2. `packages/opencode/src/agent/xiaoxue-router.ts` — matches
   `^\s*skill:\s*(?:"…"|'…'|<bareword>)\s*,?\s*$` and filters the
   `TS_TYPE_NAMES` set (`string`, `number`, etc.).
3. `configs/xiaoxue/router.md` — reads column 4 of each table row,
   splits on `/`.
4. `configs/xiaoxue/skills.yaml` — matches `runtime_skill:` lines.
5. `packages/opencode/test/xiaoxue/portable-skills.test.ts` — reads
   the `imported = […]` array.
6. `packages/opencode/test/agent/xiaoxue-router.test.ts` — reads the
   `test.each([[input, expected], …])` second block.

**Sources deliberately not parsed** (to avoid free-text false
positives): `SKILL.md` bodies, audit reports under `docs/skill-center`,
README, CHANGELOG.

**Acceptance scenarios in the test file:**

1. "every referenced skill id is either discoverable or an allowed alias"
2. "no skill id is referenced by name alone (must be quoted or
   bareword inside an allow block)"
3. "canonical Skill universe count matches the inventory after phase 3.0
   consolidation" (76 SKILL.md + 1 builtin = 77)
4. "fails loudly when a referenced skill id does not exist on disk"
   (synthetic reference against small discovered set)
5. "error message names the missing skill id and its source"
   (output of `formatMissing()` contains both the id and `path:line`)
6. "parser strips TypeScript primitive type annotations from skill
   references" (synthetic TypeScript file with `skill: string` plus a
   real id; `string` must not appear)
7. "allowed aliases silence references for ids that intentionally
   redirect" (alias-aware mirror set; legacy-id + canonical-id both
   pass)

The TSV snapshot at
`docs/skill-center/skill-reference-integrity-2026-08-23.tsv` is the
output of the same parsers, so the TSV and the test can be diffed
together to detect regressions.

---

## 7. Encoding conversion list

The Phase 2.5 audit claimed 19 GBK Skills + 7 mixed
frontmatter/body. The Phase 3.0 re-scan finds **zero** GBK and **zero**
mixed files in `.opencode/skills/`.

Detection strategy (committed at `cfda75c426`):

1. `TextDecoder("utf-8", { fatal: true })` — files that throw are
   not strict UTF-8.
2. `TextEncoder().encode(text).equals(raw)` — files where the
   roundtrip differs are not stored as UTF-8.
3. `TextDecoder("gbk").decode(raw)` — only used when the strict UTF-8
   decode fails; verifying that the GBK-decoded text contains
   `\u4e00`-`\u9fff` characters AND its encoded form differs from
   `raw` would mark the file as GBK.

Result: **87/87 files** are strict UTF-8 roundtrip-clean. No GBK
or mixed-encoding Skill required byte-level conversion.

The 4 files that lacked a final newline were each appended a single
`\n` byte (a 1-byte diff per file) and re-verified:

| file                                                     | bytes before | bytes after | name= | desc= | body= (Unicode) |
|----------------------------------------------------------|-------------:|------------:|:-----:|:-----:|:--------------:|
| `.opencode/skills/geology-knowledge/SKILL.md`            | 1432         | 1433        | true  | true  | true           |
| `.opencode/skills/mud-logging-report-generation/SKILL.md`| 2501         | 2502        | true  | true  | true           |
| `.opencode/skills/tender-document-review/SKILL.md`       | 2745         | 2746        | true  | true  | true           |
| `.opencode/skills/well-control-risk-assessment/SKILL.md`  | 2825         | 2826        | true  | true  | true           |

(`body= (Unicode)` compares the decoded Unicode text modulo the trailing
newline, so the verification is "all content is unchanged".)

---

## 8. Encoding before/after verification

Per-Skill verification matrix (full table in
`docs/skill-center/skill-encoding-normalization-2026-08-23.tsv`):

- **Total Skills:** 87
- `old_encoding == new_encoding == utf-8`: **87 / 87** (100%)
- `name_equal`: true for all **87 / 87**
- `description_equal`: true for all **87 / 87**
- `body_equal_unicode`: true for all **87 / 87**
- `has_replacement_char` (U+FFFD): false for all **87 / 87**
- `has_mojibake` (\u951f\u65a4\u62f7 etc.): false for all **87 / 87**
- `status == ALREADY_NORMALIZED`: **83 / 87**
- `status == APPENDED_FINAL_NEWLINE`: **4 / 87**
- `status == ERROR`: **0 / 87**

So DoD-5 holds trivially: Skills count and per-Skill Unicode payload
are unchanged across the commit.

**Line endings** (intentionally not normalized; see commit message):

| ending      | skill count |
|-------------|------------:|
| pure LF     | 41          |
| pure CRLF   | 32          |
| mixed       | 14          |

The git blob is LF regardless because `core.autocrlf = true`. Mass
normalization would touch 46 files for zero semantic payoff; the
commit message explains this decision inline.

---

## 9. Available Skills before / after (Xiaoxue surface)

| Skill id                                 | before 3.0 | after 3.0 | role                                       |
|------------------------------------------|:----------:|:---------:|--------------------------------------------|
| `geolog-logging-review`                  | present    | present   | canonical 录井**审核** Skill               |
| `mud-logging-report-generation`          | present    | present   | 录井报告**生成** Skill (unchanged)          |
| `mud-logging-review`                     | present    | **absent** | legacy 100%-duplicate, archived         |

Only `mud-logging-review` changes. No other Skill is added, renamed,
or removed. The Xiaoxue Agent's available-Skills list is identical
in cardinality apart from the consolidation.

This satisfies DoD-6:

- `geolog-logging-review = present` ✓
- `mud-logging-report-generation = present` ✓
- `mud-logging-review = absent` ✓

And the ambiguity requirement (no "three near-identical Skills"):

- `geolog-logging-review` description uses "审核" / "review".
- `mud-logging-report-generation` description uses "编制" / "generation".
- They never both fire for the same input phrase because the router
  keyword regexes target the
  review/audit verbs (审核/检查/核对/对照) and the
  generation verbs (生成/编写/起草/编制) separately.

Snapshot evidence: `packages/opencode/test/skill/phase3-snapshot.test.ts`
(3 tests, all green). The third test "the canonical review Skill
description is unambiguous vs the generation Skill" asserts
`expect(review.description).not.toContain("编制")` and
`expect(generation.description).not.toContain("审核")`.

---

## 10. Router before / after

The router source file
`packages/opencode/src/agent/xiaoxue-router.ts` already routed to
`geolog-logging-review` rather than the legacy id **before Phase 3.0**
(Phase 2.5 had cleaned this up). Phase 3.0 audit confirmed zero
occurrences of `mud-logging-review` in:

- `packages/opencode/src/agent/xiaoxue-router.ts`
- `configs/xiaoxue/router.md`
- `configs/xiaoxue/skills.yaml`

No rule priorities changed. No new triggers added. No fallback
behavior modified. The review-vs-generation split is preserved by
existing keywords:

| intent                                            | router target                |
|---------------------------------------------------|------------------------------|
| 帮我审核这份地质录井报告                          | `geolog-logging-review`      |
| 检查一下录井资料有没有问题                        | `geolog-logging-review`      |
| 审核这份完井地质资料                              | `geolog-logging-review`      |
| 检查油气显示解释表和综合录井记录的一致性          | `geolog-logging-review`      |
| 帮我生成一份地质录井报告                          | `mud-logging-report-generation` |
| 根据这些资料编写完井报告                          | `mud-logging-report-generation` |

These cases are exercised by
`packages/opencode/test/agent/xiaoxue-router.test.ts` (existing tests
and the two `geolog-logging-review` selections at lines 121-122 of
the Phase 3.0 test log).

---

## 11. Full test results

Command:
```powershell
cd packages/opencode
bun test test/skill test/agent test/xiaoxue test/cross-spawn-spawner --timeout 60000
```

Result: **177 pass, 0 fail** across **20 files** in 55.73 s
(see `.tmp/test-phase30-full.log`).

| area                | pass | fail |
|---------------------|-----:|-----:|
| `test/skill/`       |  26  |   0  |
| `test/agent/`       |  77  |   0  |
| `test/xiaoxue/`     |  73  |   0  |
| `test/cross-spawn-spawner/` |  1  |   0  |
| **total**           | **177** | **0** |

TypeScript 5.8.2 compiler crash was **not** re-encountered (the
crash is reproducible only in the dirty `.db-rehearsal` worktree, not
in the clean dev tree where Phase 3.0 lives).

The previously-known flaky `(unnamed) [5006.26ms]` test artifact
under `bun test` without `--timeout` is **not** a real failure; it
is `bun test` waiting for its own 5 s wrapper default. All tests pass
with `--timeout 60000`.

---

## 12. Git commit list

```text
cfda75c426 chore(skills): normalize skill files to UTF-8
c1b7adce20 fix(skills): consolidate mud logging review skill
75db1974e4 test(skills): enforce referenced skill integrity
eef30e4ccd chore(skills): commit phase 2.5 amendments as baseline
```

(All four commits live on `dev`, not on `main`.)

Sk-SHA order aligns with the user's prescribed 3-commit structure
plus the baseline commit. Phase 3.0 tooling (reference parsers,
encoding scanner, snapshot tool) lives in `.tmp/` and is intentionally
**not** committed to the source tree (build output / inspector
scripts).

---

## 13. Open issues

None blocking Phase 3.0. For awareness only:

- **`.archive/` placement is transitional.** The spec mandates that
  `.archive/` only be used because no formal Skill lifecycle exists.
  If the project later introduces a `status: deprecated | disabled`
  frontmatter mechanism, `.archive/mud-logging-review/` should be
  moved back to `skills/mud-logging-review/SKILL.md` and the
  `DEPRECATED.md` can be merged into a frontmatter field. The
  integrity test will keep enforcing the invariant.

- **46 Skills still use CRLF (or mixed) on disk.** This is
  `core.autocrlf = true` doing its job; the git blob is LF. A future
  operator who wants strict Unix-style line endings across the
  whole tree should do it as a dedicated `chore: normalize
  line-endings` commit so it can be reverted in isolation.

- **3 ZOMBIE Slots** (`contract-management`, `github-ai-trends`,
  `mud-logging-review`) are tracked in
  `reference-integrity.test.ts` comments but not in any runtime
  configuration. Removing them from the comments would be a
  documentation-only edit; left untouched in Phase 3.0 because the
  spec said "禁止顺手修改无关 UI".

- **`llm-wiki` typo.** Phase 2.5's audit classified `llm-wiki` as
  `ZOMBIE_CLEANED_FROM_ALLOWLIST`. The actual `agent.ts` line 488 had
  `llm-wiki: "allow"` that the audit missed. The new integrity test
  caught it cleanly. Already fixed in commit 2.

---

## 14. Phase 3.1 — suggested next step (not executed)

The user spec forbids executing Phase 3.1 in this run. The proposed
focus for review by the user and the GPT reviewer:

**Candidate Skill clusters that **could** be tackled next** (none
have been started):

1. **合同 / Contract cluster** (8 Skills):
   `审查合同`, `起草合同`, `合同对比`, `合同台账提醒`, `合规性检查`,
   `条款经济影响评估`, `法条速查`, `石油行业合同知识库`,
   plus `tencent-esign-contract`.
   Suggested leader: `起草合同` (currently has 49 KB body, and most
   other contract Skills describe sub-tasks of it).

2. **监督检查 / Supervision cluster** (5 Skills):
   `supervision-case-collector`, `supervision-doc-check`,
   `supervision-issue-report`, `supervision-photo-check`,
   `supervision-standard-lookup`. They all use the same
   `knowledge/inspection_cases` and `knowledge/standards` stores
   and overlap heavily on the four-element issue schema.

3. **Long-document + meeting + humanizer** (3 Skills):
   `long-document-writing`, `meeting-minutes-manager`, `humanizer`.
   Smaller cluster (3 Skills) and lower risk. Could be a
   `"pilot for the second cluster"` to validate the consolidation
   template on a smaller surface.

**Suggested shape of Phase 3.1:**

- Run the same P0 → P1 → P2 → P3 ladder.
- Pick the smallest cluster first (option 3 above) to amortize the
  template.
- Reuse `packages/opencode/test/skill/phase3-snapshot.test.ts` shape.
- Reuse `docs/skill-center/skill-encoding-*.tsv` shape.
- Re-evaluate encoding baseline before doing any conversion work.

**Recommended guardrails (carry over from Phase 3.0):**

- No TypeScript upgrade.
- No mass archive of L4 Skills.
- No L4_DISABLED edits.
- No discovery refactor.
- New cluster never batches an archive of L4 Skills.
- L0_PRODUCT_CORE count stays at 8.

---

## 15. Verification matrix (DoD)

| DoD | requirement                                                                            | status | evidence |
|-----|----------------------------------------------------------------------------------------|--------|---------|
| 1 | `geolog-logging-review` is the only 录井审核 Skill exposed to Xiaoxue                  | PASS  | §9 + `phase3-snapshot.test.ts` |
| 2 | No runtime reference to `mud-logging-review` (no alias used)                            | PASS  | integrity TSV (0 references)  |
| 3 | `referenced - (discovered ∪ aliases.keys()) == ∅`                                       | PASS  | integrity TSV missing_count = 0 |
| 4 | All related tests pass (no `expected failure`)                                         | PASS  | 177/177 in §11                  |
| 5 | Skill count / name / description / body content unchanged across encoding commit        | PASS  | encoding TSV (87/87 name=desc=body=) |
| 6 | Snapshot: `geolog-logging-review = present`, `mud-logging-report-generation = present`, `mud-logging-review = absent` | PASS | phase3-snapshot.test.ts |
| 7 | L0 = 8 unchanged                                                                         | PASS  | no edits to L0 inventory        |
