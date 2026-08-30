# Model Resolution Closure

## Decision

The model-resolution defect itself is closed. The final integration is **not ready to merge into `dev`** because the required real GUI business gates exposed two remaining P1 blockers: the delegated geology workflow did not receive/use the trusted attachment and `geology_report_review`, and the knowledge workflow did not invoke `knowledge_manage` after explicit import confirmation.

No changes were made to `dev`, protected tags, the Model Registry architecture, or the completed Node sidecar closure.

## Required answers

| # | Question | Evidence-backed answer |
|---:|---|---|
| 1 | Why did `claude-sonnet-4-6` report Model not found? | Provider catalog lookup succeeded, but its models.dev-derived Anthropic metadata had `api.url=""`. The enterprise network guard rejected the unspecified endpoint during SDK language construction, and the wrapper surfaced the failure as Model not found. |
| 2 | Why did `claude-sonnet-5` report Model not found? | The identical metadata gap and `getLanguage()` path affected this second catalog model; it was not an independent stale-ID problem. |
| 3 | `getModel` or `getLanguage`? | `Provider.getModel()` succeeded for both. `Provider.getLanguage()` failed while constructing the Anthropic SDK model. |
| 4 | Actual `cfg.model` | `undefined` in the failed isolated profile. The later GUI acceptance profile default was `opencode/mimo-v2.5-free`. |
| 5 | Actual `Session.model` | The failed session ended on `anthropic/claude-sonnet-5`; its earlier user message retained `anthropic/claude-sonnet-4-6`. |
| 6 | Actual `report` Agent model/modelKey | Both were `undefined`; it did not override the submitted model. |
| 7 | Actual GUI `PromptInput.model` | Present. First `anthropic/claude-sonnet-4-6`, then `anthropic/claude-sonnet-5`. |
| 8 | Actual Provider runtime list | Runtime contained provider `anthropic` and both relevant model IDs. `getModel()` resolved each. The acceptance profile also exposed connected OpenCode-hosted models including MiMo and Nemotron; MiMo produced a real reply, while Nemotron reached its upstream API and received an external 502 overload response. |
| 9 | Final fix files | `packages/opencode/src/provider/provider.ts`; `packages/opencode/src/session/prompt.ts`; `packages/app/src/context/local.tsx`; `packages/app/src/pages/session/composer/prompt-model-selection.ts`; `packages/app/src/components/prompt-input/submit.ts`; plus focused provider, session, and picker tests. |
| 10 | Model Registry architecture changed? | No. Stable keys, registry bindings, tombstones, history metadata, and the Registry-to-Provider direction are unchanged. No Anthropic model ID was hard-coded and no silent fallback was introduced. |
| 11 | Real-model geology review result | **FAIL.** MiMo returned a real provider response and the parent read the extracted DOCX content, proving model resolution worked. The flow then delegated to `report`/`document` without propagating the trusted attachment capability, attempted denied external-path/shell access, never invoked `geology_report_review`, produced no `ReviewResult`, and exported nothing. Parent session: `ses_fafe35c5affe5bKsgK59YSACpV`; report child: `ses_fafe2c887ffeOTMgg4xODQc2KT`. |
| 12 | Knowledge import result | **FAIL.** The real TXT was selected and read, but the agent generated only a preview and never invoked `knowledge_manage import`, even after explicit confirmation. No real `sourceId`, version, active state, index entry, or storage path was produced. Session: `ses_fafd88558ffeUNT5W9GTISjjS9`. |
| 13 | Knowledge query result | **NOT_RUN / BLOCKED_BY_IMPORT_FAIL.** The required source was not imported, so a query could not prove retrieval of the requested material. |
| 14 | Restart query result | **NOT_RUN / BLOCKED_BY_IMPORT_FAIL.** The stop-on-failure rule prevented treating restart retrieval as meaningful evidence. |
| 15 | Canonical Office/geology suite size | `CANONICAL_OFFICE_GEOLOGY_SUITE = 27`. The current suite is 27, not 24; the additional three are `historical_result_survives_missing_file.test.ts`. Commit `0d43677f9f118aea9855dcc60215ea60e27d97e6` introduced that three-test file alongside the untrusted-file tests. Commit `6e45ba57c25d90c66ff4ea19d245526dbce5eb2d` recorded the original 27/27 evidence. No product logic or artificial tests were added to reach the number. |
| 16 | Five-package typecheck | **PASS:** `packages/core`, `packages/session-ui`, `packages/app`, `packages/desktop`, and `packages/opencode`, each run with `bun typecheck` from its package directory. |
| 17 | Current integration HEAD | Tested source commit: `f741083a4a299558e02a6cb8bc4b95bb3e697bd8`. The documentation commit that contains this report is the final branch HEAD and is recorded by Git/PR after push. |
| 18 | Current P0/P1/P2 | P0 = 0. P1 = 2: (1) delegated DOCX/trusted-attachment/geology tool chain; (2) knowledge business-tool exposure/routing. P2 = 0. The observed Nemotron 502 is an external provider overload observation, not counted as a product P2. |
| 19 | Final conclusion | `CHANGES_REQUIRED` |

## Implementation closure

- `Provider.defaultModel()` now verifies a configured model against the active Provider database and emits `MODEL_DEFAULT_UNRESOLVED` when stale.
- New prompt submissions validate explicit, agent, session, historical, and default models before persistence/execution.
- Stale sessions require a valid user reselection; successful rebinding updates new work without rewriting historical message metadata.
- The GUI model picker and sidecar Provider now share a fail-closed resolvability invariant.
- Missing Anthropic catalog endpoints use the protocol-defined canonical base URL. Catalog/user overrides still win.

Implementation commit:

`f741083a4a299558e02a6cb8bc4b95bb3e697bd8 fix(xiaoxue): close model resolution runtime gaps`

## Automated regression

| Gate | Result |
|---|---:|
| Model Registry | 52/52 PASS |
| Trusted Attachment | 41/41 PASS |
| Knowledge manage/search专项 | 9/9 PASS; retrieval top1 = 0.8, top3 = 1, top5 = 1 |
| Canonical Office/geology | 27/27 PASS |
| Combined opencode regression | 88 PASS, 0 FAIL |
| Prompt/model session suite | 50 PASS, 14 SKIP, 0 FAIL |
| App model picker invariant | 2/2 PASS |
| Node sidecar Gate | PASS on Node v24.15.0 with `typeof Bun === "undefined"`; trusted DOCX plus knowledge import/update/list/remove/search/index/fallback recursion all PASS |
| Five-package typecheck | 5/5 PASS |
| Desktop sidecar smoke | PASS: `Electron sidecar runtime smoke test passed` |

## Canonical Office/geology provenance

The 27-test gate consists of:

- Office DOCX exporter: 2
- Geology DOCX parser/exporter: 4
- Geology PDF parser: 5
- Legacy Office parser: 3
- Office document tool: 5
- Historical result survives missing file: 3
- Reject untrusted file URL: 5

Total: 27. The previous 24 count omitted the three historical-result tests from its command/statistical scope; those tests were neither deleted nor replaced.

## Real GUI gate evidence

The GUI run used the actual integration Desktop and isolated profile, selected a real DOCX and a real TXT through Windows file dialogs, and used configured providers rather than a mocked model. The model picker also rejected a stale unavailable selection (`opencode/kimi-k2.5-free`), while MiMo completed a real provider turn.

The model layer therefore passed its intended gate. The business workflows did not: delegation lost the trusted attachment/tool path for DOCX review, and knowledge import was routed through generic Skill/document behavior instead of the private `knowledge_manage` tool. These failures cannot be reclassified as success based on extracted text, a preview, source tests, or a server-ready state.

## Merge decision

Do not merge `integration-upstream-20260829` into `dev` until both remaining P1 GUI business flows pass end to end, including a real `ReviewResult`/export and a real knowledge import followed by query, full restart, and repeat query.

CHANGES_REQUIRED
