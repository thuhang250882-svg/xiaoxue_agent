# B1B.1 Desktop-enabled AC02 evidence

Date: 2026-08-26

## Gate result

```text
B1B_DESKTOP_GATE = FAIL
CORE_AC02 = PASS
DESKTOP_AC02 = FAIL
FULL_PRODUCT_AC02 = FAIL
B1C_STARTED = NO
B1D_STARTED = NO
B1E_STARTED = NO
```

The real Electron run completed 1,000 deterministic user turns and persisted exactly 1,000 user plus 1,000 completed assistant messages. The backend reopened and continued after a real application restart with new main and renderer PIDs. The product gate nevertheless fails because the current Desktop renderer remains on the legacy session/message path and does not project, reopen, traverse, or draft-manage the SessionV2 conversation.

## Baseline and isolation

| Field | Value |
| --- | --- |
| Approved baseline HEAD | `aa171299a9a3591ef1c691cd48565dc636658677` |
| Production P0 fix | `d5ff65630` (`fix(core): await internal plugin bootstrap`) |
| Desktop harness | `d6f9e0b90` (`test(chat): add desktop-enabled long-run AC02`) |
| Final evidence run commit | `d6f9e0b90e4483694a9c63a0ac890864aa257040` |
| Isolated profile | `C:\Users\Administrator\AppData\Local\Temp\opencode-desktop-ac02-GP11HV` |
| Provider | local deterministic OpenAI-compatible streaming server |
| Electron | 42.3.3 |
| Bun | 1.3.14 |

The retained profile contains synthetic test data only. The harness sets isolated Electron `userData` and `sessionData`, `OPENCODE_DB`, XDG data/config/cache/state roots, and a V2-only provider config. It disables migration from the real profile and suppresses the pet renderer so process accounting has one product renderer. No user profile was read or used for the stress run.

The original 16 untracked files remained out of scope. They were not staged, moved, deleted, or used by the harness.

## Real product path

The harness launches the built Electron main process and attaches to the real renderer through the Chromium debugging protocol. API calls originate inside the renderer with the product initialization credentials and follow:

```text
Electron Renderer
-> product HTTP client boundary
-> SessionV2 HttpApi
-> SessionExecution / SessionRunner
-> deterministic streaming provider
-> SQLite persistence and Session projection
-> renderer HTTP response path
```

It does not replace SessionV2, the runner, persistence, or projection with a test chat implementation.

## Narrow P0 found before the measured run

The first reproducible attempt admitted the prompt but failed the first provider turn with `SessionRunnerModel.ModelUnavailableError: Model unavailable: test/test-model`. Location services forked the internal plugin bootstrap, so SessionRunnerModel could observe an empty Catalog before the outer `State.batch` committed configured providers.

The minimal fix makes Location initialization await the existing internal plugin batch. A regression creates a location-scoped provider config and resolves the selected model immediately. No renderer, session, state, IPC, or projection architecture was refactored.

## Data integrity and restart

| Check | Result |
| --- | --- |
| User turns | 1,000 / 1,000 |
| Expected chat messages | 2,000 |
| Actual chat messages | 2,000 |
| User / assistant | 1,000 / 1,000 |
| Lost / duplicate / corrupt / unfinished | 0 / 0 / 0 / 0 |
| Main PID before / after | 31,204 / 52,904 |
| Renderer PID before / after | 45,736 / 46,548 |
| Backend messages before restart | 1,000 |
| Backend messages after restart | 1,000 |
| Backend continued to 2,000 | PASS |
| Renderer reopened SessionV2 timeline | FAIL |
| Full usable reopen | FAIL, 7,690.327 ms timeout result |

Both Electron PIDs changed. The pre-restart processes exited, the same isolated database reopened, and turns 501-1,000 completed. `restart_recovery` and `continue_after_restart` fail at the full-product boundary because the renderer never exposed the V2 timeline; backend-only recovery is explicitly recorded separately and is not treated as a product pass.

## Memory

Each checkpoint idled for 3 seconds, then took three RSS samples 500 ms apart. Values below are checkpoint medians unless marked peak.

| Checkpoint | Messages | Main MiB | Renderer MiB |
| ---: | ---: | ---: | ---: |
| 0 | 0 | 190.25 | 150.40 |
| 100 | 200 | 135.87 | 152.24 |
| 250 | 500 | 137.78 | 159.59 |
| 500 | 1,000 | 143.89 | 166.95 |
| 500 after restart | 1,000 | 220.41 | 164.02 |
| 750 | 1,500 | 170.54 | 178.34 |
| 1,000 | 2,000 | 174.79 | 187.95 |

- Renderer peak: 187.95 MiB, below the 1,024 MiB warning and 1,536 MiB failure thresholds.
- Main peak: 220.41 MiB, below the 512 MiB warning and 1,024 MiB failure thresholds.
- Post-restart renderer RSS was 164.02 MiB, below the 166.95 MiB pre-restart peak.
- Renderer growth from post-restart 500 to 750 was 14.32 MiB and from 750 to 1,000 was 9.61 MiB. No 750-to-1,000 acceleration was observed.
- No main-process message-count amplification was observed. The high main sample occurred at cold restart and then fell while message count doubled.

## State and StorageHealth

The harness reused the B1A `StorageHealth` Desktop IPC. Every checkpoint retains category findings, discovery status, exact path, size, mtime, object count, largest items, scan counts, and errors.

| Checkpoint | Messages | DB family bytes | Global bytes | Workspace bytes | Draft files / bytes |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 0 | 304,696 | 0 | 0 | 0 / 0 |
| 100 | 200 | 4,824,712 | 922 | 0 | 0 / 0 |
| 250 | 500 | 5,504,816 | 922 | 0 | 0 / 0 |
| 500 | 1,000 | 6,631,312 | 922 | 0 | 0 / 0 |
| 500 after restart | 1,000 | 2,469,992 | 922 | 0 | 0 / 0 |
| 750 | 1,500 | 7,704,392 | 922 | 0 | 0 / 0 |
| 1,000 | 2,000 | 8,798,024 | 922 | 0 | 0 / 0 |

Desktop state delta was 922 bytes global, 0 workspace, 0 draft, and 922 bytes combined. First-half growth was 922 bytes and second-half growth was 0, so the numeric state and acceleration limits pass. No chat prompt markers were found in Desktop `.dat` files and `STATE_AMPLIFICATION_SUSPECTED = NO`.

The zero draft-file observation is not promoted to a draft lifecycle pass. Because the Desktop composer is not SessionV2-backed, `start stream -> draft exists -> finish -> draft removed/finalized -> restart` is `UNAVAILABLE`; orphan-draft semantics for the V2 run are therefore also `UNAVAILABLE` and the hard gate fails.

## Performance

| Metric | Result |
| --- | ---: |
| Full usable reopen at turn 500 | 7,690.327 ms, FAIL |
| Reopen at turn 1,000 | UNAVAILABLE; renderer has no V2 timeline |
| First-token p50 | 143.680 ms |
| First-token p95 | 197.511 ms |
| First-token max | 338.692 ms |
| First-token p95 by 250-turn quarter | 108.458 / 141.523 / 179.755 / 206.022 ms |

First-token p95 is below the 500 ms warning. It increases across the four quarters under deterministic provider conditions, so `LATENCY_SCALING_RISK = YES`; this is diagnostic and no context-architecture change was made.

## Failure report

```text
FAILURE_CATEGORY = DESKTOP_SESSIONV2_RENDERER_INTEGRATION
REPRODUCTION = run packages/desktop `bun run build`, then `bun run desktop-ac02`
FIRST_BAD_CHECKPOINT = 100 (backend 200 messages; renderer V2 message count 0)
STATE_EVIDENCE = global delta 922 B; workspace 0 B; drafts 0 files/0 B; draft lifecycle UNAVAILABLE
MEMORY_EVIDENCE = renderer peak 187.95 MiB; main peak 220.41 MiB; thresholds not exceeded
LIKELY_OWNER = Desktop/App session transport, projection, routing, and draft ownership
ROOT_CAUSE_CANDIDATE = Desktop composer and timeline use the legacy session/message client and do not select or project SessionV2 sessions
MINIMAL_FIX_SCOPE = not local; requires an approved renderer/session integration batch with V2 routing, projection, reopen, traversal, and draft lifecycle
```

The renderer showed zero V2 messages at checkpoints 100, 250, 500, post-restart, 750, and 1,000. Full-history traversal saw zero V2 message IDs and could not reach the start. Lowering gates or treating backend query success as renderer usability would conceal the product gap, so no such change was made.

## Regression verification

| Area | Command | Result |
| --- | --- | --- |
| Desktop AC02 | `packages/desktop: bun run desktop-ac02` | Expected gate FAIL with complete evidence; 2,000/2,000 backend messages |
| B1B Core AC02 | `packages/core: bun test/longrun/run.ts --turns 1000 --restart-at 500 --seed 20260826 --output %TEMP%\\b1b-core-ac02-regression.json` | PASS; 1,000 inputs, 2,000 messages, two PIDs, zero integrity defects |
| B1B harness / AC10 / SessionV2 | targeted nine-file Core run | PASS; 166 tests, 470 assertions |
| Desktop relevant | targeted seven-file Desktop run | PASS; 19 tests, 54 assertions |
| App unit | `packages/app: bun run test:unit` | PASS; 716 tests, 1,897 assertions |
| App browser | `packages/app: bun run test:browser` | PASS; 30 tests, 69 assertions |
| Typecheck | repository root `bun typecheck` | PASS; 30/30 Turbo tasks |

`BASE-UNIT-001`, `BASE-UNIT-002`, and `BASE-E2E-001` remain registered baseline exceptions. They were not relaxed or fixed in B1B.1.

## Raw evidence

- `b1b-desktop-1000.json`: final gate, per-turn latency, exact integrity, restart, renderer projection, and checkpoint message counts.
- `b1b-desktop-state-growth.json`: StorageHealth findings, exact state files, database family, category totals, mtimes, counts, and largest items.
- `b1b-desktop-memory.json`: all three RSS samples, medians, peaks, PIDs, checkpoint message counts, and restart memory.

## Stop decision

```text
IMPLEMENTATION_GATE = FAIL_DESKTOP_SESSIONV2_INTEGRATION_REQUIRED
NEXT_ACTION = wait for explicit approval of a focused Desktop/App SessionV2 integration batch; do not start B1C/B1D/B1E
```
