# Model Resolution and Business Workflow Closure

## Decision

The confirmed source defects are fixed on `integration-upstream-20260829`: model selection now fails closed, the Anthropic endpoint fallback is limited to the native Anthropic provider, delegated subagents receive the latest trusted attachments, and enterprise knowledge actions explicitly require the private knowledge tools. All public internet-provider onboarding entry points and their dialogs were removed; the direct custom OpenAI-compatible form remains so the user can add a model endpoint manually.

The branch is still **not ready to merge into `dev`**. The current isolated GUI profile intentionally has no user-managed model/API configuration, so the required real-model geology and knowledge workflows could not be rerun end to end. Automated gates and native DOCX selection pass, but those are not substitutes for real-provider GUI evidence.

No changes were made to `dev`, protected tags, the Model Registry architecture, historical Session model metadata, or the completed Node sidecar architecture.

## Required answers

| # | Question | Evidence-backed answer |
|---:|---|---|
| 1 | Why did `claude-sonnet-4-6` report Model not found? | `Provider.getModel()` resolved it, but its catalog metadata had no endpoint. The enterprise network guard rejected the unspecified endpoint while `Provider.getLanguage()` constructed the SDK model, and the wrapper surfaced that as Model not found. |
| 2 | Why did `claude-sonnet-5` report Model not found? | The same missing-endpoint and `getLanguage()` path affected it; it was not a separate stale-ID failure. |
| 3 | `getModel` or `getLanguage`? | `getModel()` succeeded; `getLanguage()` failed. |
| 4 | Actual `cfg.model` | `undefined` in the original failed isolated profile. |
| 5 | Actual `Session.model` | The failed Session ended on `anthropic/claude-sonnet-5`; the earlier message retained `anthropic/claude-sonnet-4-6`. |
| 6 | Actual `report` Agent model/modelKey | Both were `undefined`; the Agent did not override the submitted model. |
| 7 | Actual GUI `PromptInput.model` | Present: first `anthropic/claude-sonnet-4-6`, then `anthropic/claude-sonnet-5`. |
| 8 | Actual Provider runtime list | The runtime contained provider `anthropic` and both IDs. The failure occurred after catalog resolution. |
| 9 | Final remediation files | Provider/CLI: `packages/opencode/src/provider/provider.ts`, `packages/opencode/src/cli/cmd/debug/agent.handler.ts`. Model picker: `packages/app/src/pages/session/composer/prompt-model-selection.ts`, `prompt-model-resolution.ts`. Delegation: `packages/opencode/src/tool/task.ts`. Knowledge: `configs/xiaoxue/knowledge_query.md`, `packages/opencode/src/tool/knowledge-manage.ts`, `packages/app/src/pages/knowledge-library.tsx`. Provider onboarding removal: the connect/usage dialogs were deleted and their layout, model-dialog, and Session entry points removed. |
| 10 | Model Registry architecture changed? | No. Stable keys, bindings, tombstones, history metadata, and Registry-to-Provider direction are unchanged. |
| 11 | Real-model geology review result | **NOT_RUN_THIS_REVISION.** Native selection of a real DOCX passed in the current Desktop, and automated geology review/export passes 27/27. The isolated profile had no user-managed model, so no provider turn, `geology_report_review`, `ReviewResult`, or export was claimed. |
| 12 | Knowledge import result | **NOT_RUN_THIS_REVISION.** The Node sidecar gate proves real import/update/list/remove/index operations without Bun. The real-model GUI import must be repeated after the user supplies a model endpoint. |
| 13 | Knowledge query result | **NOT_RUN_THIS_REVISION / BLOCKED_BY_USER_MODEL_CONFIGURATION.** Automated knowledge search passes. |
| 14 | Restart query result | **NOT_RUN_THIS_REVISION / BLOCKED_BY_USER_MODEL_CONFIGURATION.** |
| 15 | Canonical Office/geology suite size | `CANONICAL_OFFICE_GEOLOGY_SUITE = 27` across the seven canonical files listed below. |
| 16 | Five-package typecheck | **PASS:** core, session-ui, app, desktop, and opencode. App/opencode/desktop were rerun after the final edits; core/session-ui were already green and were not touched by the last remediation. |
| 17 | Current integration source commit | `575c04bc1c` (`fix(xiaoxue): close business gates and remove provider onboarding`). The documentation commit containing this report is recorded by Git/PR after push. |
| 18 | Current P0/P1/P2 | Confirmed source defects: P0 = 0, P1 = 0, P2 = 0. Unclosed delivery validation: two P1 GUI workflow gates (geology; knowledge import/query/restart) remain unverified until a user-managed real model is configured. |
| 19 | Final conclusion | `CHANGES_REQUIRED` |

## Remediation summary

- Native Anthropic models may receive the protocol default endpoint only when `providerID === "anthropic"`; an Anthropic-compatible model behind Cloudflare or another gateway is no longer falsely attributed to `api.anthropic.com`.
- Explicit Session, Agent, and configured defaults fail closed when unresolved. A configured default that resolves to runtime `null` cannot silently fall through to a recent model.
- `TaskTool` forwards the latest user FileParts into its child prompt, deduplicates identical URLs, and still routes them through the existing trusted-attachment registry revalidation. SHA-256, realpath, 100 MB, expiry, and controlled single-use retry semantics are unchanged.
- Knowledge-library import/update/list prompts and the knowledge Agent/tool contract require `knowledge_manage`; query requires `knowledge_search`; a preview cannot be presented as a completed import.
- Removed runtime provider-onboarding surfaces: connect-provider dialog/story, command-palette entry, model-dialog add-provider buttons, sidebar getting-started card, and provider-upgrade/usage dialogs. The direct custom-provider form remains the only UI entry for user-managed model configuration.

## Automated regression

| Gate | Result |
|---|---:|
| Model Registry | 52/52 PASS |
| Trusted Attachment | 41/41 PASS |
| Canonical Office/geology | 27/27 PASS |
| Knowledge manage/search专项 | 9/9 PASS; retrieval top1 = 0.8, top3 = 1, top5 = 1 |
| App onboarding/model/knowledge focused tests | 12/12 PASS |
| Provider, Task, Agent, and knowledge focused tests | New and affected assertions PASS; four pre-existing tests exceeded 5 seconds only under parallel package contention and each passed when rerun serially |
| Node sidecar Gate | PASS on Node v24.15.0 with `typeof Bun === "undefined"`; trusted DOCX plus knowledge import/update/list/remove/search/index/fallback recursion all PASS |
| Five-package typecheck | 5/5 PASS |
| Desktop production build and sidecar smoke | PASS; `Electron sidecar runtime smoke test passed` |
| Final diff whitespace check | PASS |

## Bun-only final-source audit

- `packages/opencode/src/xiaoxue/sqlite.bun.ts:3` is `SAFE_BUN_ONLY`: package import conditions select `sqlite.node.ts` in the Electron Node sidecar.
- Bun APIs found under `packages/desktop/src/**/*.test.ts` are `SAFE_BUN_ONLY`: they are Bun test harness files and are not reachable from the packaged sidecar.
- No `Bun.file`, `Bun.write`, `Bun.Glob`, `Bun.CryptoHasher`, `Bun.spawn`, `import.meta.dir`, or `bun:sqlite` occurrence was found in a Node-sidecar production path.
- `BUG_NODE_SIDECAR = 0`.

## Canonical Office/geology provenance

- Office DOCX exporter: 2
- Geology DOCX parser/exporter: 4
- Geology PDF parser: 5
- Legacy Office parser: 3
- Office document tool: 5
- Historical result survives missing file: 3
- Reject untrusted file URL: 5

Total: 27.

## GUI evidence boundary

The current integration Desktop was launched with an isolated profile. The settings page showed only the self-managed custom model entry and no external vendor recommendation list. A real OOXML DOCX was selected through the native Windows file picker and appeared as a DOCX attachment card. The provider-onboarding wizard was absent from the runtime bundle; the production renderer retained only the direct `dialog-custom-provider` chunk.

No API key or endpoint was added because the user explicitly chose to manage model/API configuration personally. Therefore no real provider call or downstream business result is reported as PASS in this revision.

## Merge decision

After the user configures a real callable model, rerun: DOCX geology review through `geology_report_review` to `ReviewResult` and export; knowledge import; immediate query; full application restart; repeat query. Do not merge into `dev` until those results pass.

CHANGES_REQUIRED
