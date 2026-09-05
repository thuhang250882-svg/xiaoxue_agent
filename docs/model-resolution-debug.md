# Model Resolution Debug Evidence

## Scope and safety boundary

- Branch: `integration-upstream-20260829`
- Investigation baseline: `89538a976ec73520195a8c9af10a4aae67f6e788`
- Verified implementation commit: `f741083a4a299558e02a6cb8bc4b95bb3e697bd8`
- GUI profile: `packages/desktop/.tmp-gui-sidecar-closure-20260829/profile`
- Failed GUI session: `ses_fb24e4bcfffeIlSdpQuPoIazX1`
- The investigation did not modify `dev`, protected tags, the Model Registry architecture, or the completed Node sidecar closure.
- No API key, token, password, authorization header, or secret value is recorded in this document.

## Failed-request evidence

The same GUI geology-review session was reproduced twice, first with `anthropic/claude-sonnet-4-6` and then with `anthropic/claude-sonnet-5`.

| # | Requested evidence | Observed value |
|---:|---|---|
| 1 | `input.model` | Present on both submissions. First: `anthropic/claude-sonnet-4-6`; second: `anthropic/claude-sonnet-5`. |
| 2 | Current agent name | `xiaoxue` at the parent prompt. The workflow later delegated to `report`. |
| 3 | `agent.modelKey` | `undefined` for the `report` agent. |
| 4 | `agent.model` | `undefined` for the `report` agent. |
| 5 | `SessionTable.model` | After the second submission: `anthropic/claude-sonnet-5`. The previous user message retained `anthropic/claude-sonnet-4-6`. |
| 6 | `currentModel()` result | The explicit `input.model` won on each submission; the first request resolved to `claude-sonnet-4-6`, the second to `claude-sonnet-5`. |
| 7 | `cfg.model` | `undefined` in the failed isolated profile. |
| 8 | `ModelRegistry.resolve(modelKey)` | Not applicable: the `report` agent had no `modelKey`, and the isolated profile had no registry binding for this request. |
| 9 | `ModelRegistry.findByModel(providerID, modelID)` | Not applicable for the same reason; the request was resolved through the Provider catalog. |
| 10 | Provider exists | Yes. `Provider.list()` contained `anthropic`. |
| 11 | Runtime model exists | Yes. `Provider.list()["anthropic"].models` contained both submitted model IDs. |
| 12 | `model.api.id` | Equal to the submitted catalog ID: `claude-sonnet-4-6` or `claude-sonnet-5`. |
| 13 | `model.api.npm` | `@ai-sdk/anthropic`. |
| 14 | `model.api.url` / base URL | Before the fix: empty string because the catalog entry did not provide an API URL. After the fix: `https://api.anthropic.com/v1`, supplied from the Anthropic protocol's canonical default. |
| 15 | Auth | Present through the environment credential source. Only the source/type was inspected; no secret was captured. |
| 16 | Enterprise Policy | The provider and both model IDs were allowed. The later language-construction network policy rejected the empty endpoint represented as `<default>`. |
| 17 | Failure stage | `Provider.getModel()` succeeded. The failure occurred in `Provider.getLanguage()` while constructing the Anthropic language model because its endpoint metadata was empty. The wrapper surfaced this as `ProviderModelNotFoundError`, which made the log message misleading. |

Relevant sidecar log evidence is in `packages/desktop/.tmp-gui-sidecar-closure-20260829/profile/data/opencode/log/opencode.log`: the first request appears around lines 189-197 and the second around lines 202-205. Both show successful provider/model selection followed by failure during language construction.

## Root cause

Both `claude-sonnet-4-6` and `claude-sonnet-5` failed for the same reason: the models.dev-derived Anthropic metadata identified the correct SDK package but supplied an empty API URL. The enterprise network guard cannot authorize an unspecified endpoint, so `getLanguage()` failed before any Anthropic request was sent.

This was not a catalog-ID mismatch and was not fixed by mapping either model ID to a hard-coded replacement. The SDK accepts both IDs. The fix fills only the missing Anthropic endpoint with `AnthropicMessages.DEFAULT_BASE_URL`; catalog-provided or user-configured URLs continue to take precedence.

## Prompt precedence evidence

The GUI submissions prove the effective precedence is:

`input.model` > `agent.model` > `currentModel(session)`

The model selector showed each Anthropic choice and `PromptInput.model` carried exactly the corresponding provider and model ID. Therefore the original failure was not a UI-to-session omission and was not hidden by adding a default model to the `report` agent.

## Stale-model closure

- Configured defaults are now validated against the active Provider database before use. A missing configured model returns `MODEL_DEFAULT_UNRESOLVED` and asks the user to reselect; there is no silent paid-model fallback.
- Session and historical current-model candidates are validated before a new user message is persisted. A missing model returns `MODEL_SESSION_UNRESOLVED`.
- A newly selected valid model rebinds only the current session state and new message. Historical messages preserve their original provider/model metadata.
- The model picker now fail-closes explicit, agent, and configured model selections that cannot be resolved by the same runtime Provider instance, and submission displays the precise stale-model message.

## Evidence boundary

The model-resolution P1 is closed by source tests and a real-provider GUI response. The later DOCX and knowledge GUI flows did not complete because the private business tools were not invoked through the delegated agent path. Those are separate integration blockers and are reported in `docs/model-resolution-closure.md`.
