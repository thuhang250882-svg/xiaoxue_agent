# Phase 3.0A — TypeScript Crash A/B Experiment Conclusion

**Date:** 2026-08-23
**Branch:** `dev`
**Experiment runner:** [`p30a-tsc-ab.ps1`](../../evidence/phase3.0a-tsc-ab/p30a-tsc-ab.ps1)
**Purpose:** determine whether the recurring `tsc 5.8.2` crash is caused by
the `.db-rehearsal` working-tree artifact (git-ignored, untracked), or by a
TypeScript compiler bug unrelated to repo state.

This document is the **standalone experiment record**. The final
accounting (counting model, integrity matrix, verdict) lives in
[`phase3.0a-closeout-reconciliation-2026-08-23.md`](./phase3.0a-closeout-reconciliation-2026-08-23.md) §2.

---

## 1. Background

Phase 2.5 amendment report (§5.3) recorded the tsc crash as a clean-tree
reproducible compiler bug. Phase 3.0 §11 then re-asserted the same crash
as a `.db-rehearsal` "dirty worktree" symptom. These two statements cannot
both be true. Phase 3.0A re-ran the minimum reproducible experiment to
refute one of them.

The single discriminating axis:

| axis | Case B | Case A/C |
|---|---|---|
| `.db-rehearsal/` directory | **present** | **renamed away** to `.db-rehearsal.P30A-TMP` |

Everything else (worktree HEAD, package.json, `node_modules`, the rest
of the repo) is byte-identical between cases. The rename is reversible
and the experiment ends by moving the directory back.

---

## 2. Environment

```text
TypeScript : 5.8.2 (workspace catalog dependency)
Bun        : 1.3.14
Node       : v24.15.0
tsconfig   : packages/opencode/tsconfig.json
command    : bunx --bun tsc --noEmit -p tsconfig.json  (exact historical crash command)
cwd        : packages/opencode
```

> Note: `bun run typecheck` already invokes **tsgo 7.0.0-dev**
> (`@typescript/native-preview`), not tsc 5.8.2. The sanctioned
> typecheck path is unaffected by this bug. The crash is reproducible
> only via the raw `tsc` command.

---

## 3. Results

| Case | `.db-rehearsal` | exit | elapsed | log lines | result |
|---|---|---:|---:|---:|---|
| **B** | present | `1` | 39930 ms | 35 | crash at `_tsc.js:16876` |
| **A** | absent  | `1` | 38634 ms | 35 | **identical** crash at `_tsc.js:16876` |
| Control (Node) | present | `1` | n/a | n/a | **identical** crash, Bun runtime is not a factor |
| Sanctioned (`bun typecheck` = tsgo) | present or absent | `0` | <1 s | 0 | passes both |

Both A and B reproduce the same stack trace, the same line, the same
`TypeError: undefined is not an object (evaluating 'node.kind')`. Bun vs
bare Node reproduces the same crash — Bun is not a factor. tsgo bypasses
it entirely.

---

## 4. Crash site analysis

```
TypeError: undefined is not an object (evaluating 'node.kind')
      at getModifierFlagsWorker                       (_tsc.js:16876:7)
      at getSelectedSyntacticModifierFlags            (_tsc.js:16873:10)
      at hasSyntacticModifier                         (_tsc.js:16843:12)
      at getIsDeclarationVisible                      (_tsc.js:50182:17)
      at every                                        (_tsc.js:83:12)
      at hasVisibleDeclarations                       (_tsc.js:50161:10)
      at isEntityNameVisible                          (_tsc.js:50251:12)
      at <anonymous>                                  (_tsc.js:51420:153)
      at every                                        (_tsc.js:83:12)
      at indexInfoToObjectComputedNamesOrSignatureDeclaration (_tsc.js:51418:57)
```

`_tsc.js:16876` (`getModifierFlagsWorker`) reads `node.kind` directly
without a null guard. The `node` argument flows in from
`getIsDeclarationVisible` (`_tsc.js:50182`), which is calling
`hasSyntacticModifier(variableStatement, 32 /* Export */)`. The
`variableStatement` was obtained by walking
`declaration.parent.parent.parent` (`_tsc.js:50181`), and one of those
hops is `undefined`. The checker reaches that code path while resolving
binding-element visibility inside
`indexInfoToObjectComputedNamesOrSignatureDeclaration`.

This is a **checker-state bug** in the TypeScript 5.8.2 JS bundle, not
an AST-shape problem caused by any single source file: every Case-A/B
run loads the same source set with no compile error, then crashes
during semantic analysis.

---

## 5. `.db-rehearsal` is not in the file set

`tsc --noEmit -p tsconfig.json --listFilesOnly` enumerates **4369**
files. **0** of them match `.db-rehearsal/` (or `.tmp/`). The package
tsconfig has no `include`/`exclude`, so its scope is confined to
`packages/opencode/**` plus resolved imports. `.db-rehearsal/` sits at
the repo root and is structurally unreachable from that scope.

The "Phase 3.0 §11 dirty-worktree" hypothesis is therefore refuted.

---

## 6. Conclusion

> The crash is a **deterministic TypeScript 5.8.2 compiler bug**
> (checker crash in `getModifierFlagsWorker` via declaration
> visibility). Reproducible with **and without** `.db-rehearsal`, on
> Bun **and** Node. `.db-rehearsal/` is not in the tsconfig file set
> and is **not the cause**.

This supersedes the Phase 3.0 §11 sentence; Phase 2.5 §5.3 stands.

---

## 7. Fix recommendation (no upgrade executed in Phase 3.0A)

1. Keep `bun run typecheck` (tsgo 7.0.0-dev) as the canonical
   typecheck — it already passes (`exit 0`). It has been the canonical
   path since upstream commit `62e5f4b154` ("try tsgo", 2025-10-14).
2. Do **not** invoke raw `bunx --bun tsc` in CI/docs. Treat
   `tsc 5.8.2` output as unsupported for this workspace.
3. When a TypeScript bump is scheduled (separate decision window),
   move the catalog `typescript` to ≥ 5.9.x. The crash site is a
   known-class checker regression; newer tsgo builds do not hit it.
4. No source code change is required for RC6: the sanctioned typecheck
   path is green.

---

## 8. Reproduction (one command)

```powershell
cd packages/opencode
bunx --bun tsc --noEmit -p tsconfig.json
# → crash at _tsc.js:16876, TypeError: undefined is not an object (evaluating 'node.kind')

cd packages/opencode
bun typecheck
# → exit 0 (tsgo 7.0.0-dev passes)
```

---

## 9. Evidence

| file | purpose |
|---|---|
| [`p30a-tsc-ab.ps1`](../../evidence/phase3.0a-tsc-ab/p30a-tsc-ab.ps1) | A/B experiment runner (Case B with `.db-rehearsal`, Case A/C without) |
| [`p30a-tsc-B.txt`](../../evidence/phase3.0a-tsc-ab/p30a-tsc-B.txt) | Case B stderr/stdout (with `.db-rehearsal`) |
| [`p30a-tsc-A.txt`](../../evidence/phase3.0a-tsc-ab/p30a-tsc-A.txt) | Case A stderr/stdout (without `.db-rehearsal`) |
| [`p30a-tsc-ab-summary.txt`](../../evidence/phase3.0a-tsc-ab/p30a-tsc-ab-summary.txt) | runner summary (timing, exit codes, head/tail snippets) |
| [`p30a-node-tsc.txt`](../../evidence/phase3.0a-tsc-ab/p30a-node-tsc.txt) | Node-runtime control (Bun is not a factor) |

---

## 10. Related documents

- [`phase3.0a-closeout-reconciliation-2026-08-23.md`](./phase3.0a-closeout-reconciliation-2026-08-23.md) §2 — final reconciled conclusion and acceptance gates
- [`phase3.0-safe-consolidation-report-2026-08-23.md`](./phase3.0-safe-consolidation-report-2026-08-23.md) §11 — original "dirty worktree" wording (now marked superseded)
- [`phase2.5-amendment-report-2026-08-22.md`](./phase2.5-amendment-report-2026-08-22.md) §5.3 — Phase 2.5 compiler-bug conclusion (this experiment confirms it)