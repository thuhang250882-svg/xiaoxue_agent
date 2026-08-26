# B1B long-run and AC02 evidence

Date: 2026-08-26

## Harness boundary

The harness runs real `SessionV2` admission, SQLite persistence, event projection, session execution, history reload, and deterministic streamed LLM events. It does not call a paid or network provider. A fixed seed controls synthetic prompts, response text, and message IDs.

The 1,000-turn run exits the first Bun worker after turn 500, releases its scoped database/runtime layers, starts a second operating-system process against the same SQLite database, verifies all 1,000 visible messages already committed, and continues to turn 1,000. This is a real process boundary, not an in-process service refresh.

Automated now:

- Scenario A: deterministic text chat at 100, 500, and 1,000 turns.
- Scenario E: process restart, reopen, full-history verification, and continued chat.

Reserved in the report contract, but not started in this batch:

- Scenario B: large messages/code/bounded tool output.
- Scenario C: mixed attachments.
- Scenario D: chat + skill + review + export.

## Environment

| Field | Value |
| --- | --- |
| Baseline commit measured | `52c37aa90a973ea7f2cf8c098d346b60e4a9c23d` |
| Harness version | 1 |
| Seed | 20260826 |
| OS | Windows `10.0.26200`, x64 |
| CPU | AMD Ryzen 9 7945HX with Radeon Graphics, 32 logical CPUs |
| Total memory | 16,294,899,712 bytes |
| Bun | 1.3.14 |

## Commands and integrity results

All commands were run from `packages/core`.

| Command | Result | Inputs | Visible messages | Integrity defects |
| --- | --- | ---: | ---: | ---: |
| `bun test/longrun/run.ts --turns 100 --seed 20260826 --output ../../docs/next-version/evidence/b1b-longrun-100.json` | PASS | 100/100 | 200/200 | 0 |
| `bun test/longrun/run.ts --turns 500 --seed 20260826 --output ../../docs/next-version/evidence/b1b-longrun-500.json` | PASS | 500/500 | 1,000/1,000 | 0 |
| `bun test/longrun/run.ts --turns 1000 --restart-at 500 --seed 20260826 --output ../../docs/next-version/evidence/b1b-longrun-1000.json` | PASS | 1,000/1,000 | 2,000/2,000 | 0 |

Integrity defects include lost input, duplicated input ID, corrupt prompt/response order or content, and incomplete assistant output. Every category was zero in every run.

## AC02 1,000-turn checkpoints

Latency values are cumulative p95 measurements in milliseconds. Database total includes the database, WAL, and SHM files at the checkpoint.

| Turn | Core worker RSS MiB | Heap used MiB | Database bytes | Session open ms | Append p95 | First token p95 | Completion p95 | Visible messages |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 285.20 | 37.31 | 358,256 | 8.028 | 0 | 0 | 0 | 0 |
| 100 | 381.99 | 61.65 | 4,812,568 | 4.393 | 2.401 | 22.674 | 26.535 | 200 |
| 250 | 403.99 | 42.80 | 5,459,736 | 9.083 | 2.357 | 38.796 | 42.243 | 500 |
| 500 | 419.43 | 52.61 | 6,524,792 | 20.470 | 2.162 | 68.294 | 73.941 | 1,000 |
| 750 | 375.70 | 67.15 | 7,524,216 | 28.367 | 2.357 | 103.753 | 109.303 | 1,500 |
| 1,000 | 389.91 | 52.40 | 8,511,352 | 39.036 | 2.383 | 130.008 | 136.243 | 2,000 |

The 1,000-turn first-token maximum was 163.797 ms and completion maximum was 169.510 ms. Append p95 remained 2.383 ms.

## Restart recovery

| Check | Result |
| --- | --- |
| First worker PID | 24492 |
| Second worker PID | 57144 |
| Messages expected before restart | 1,000 |
| Messages found immediately after restart | 1,000 |
| Reopen latency in new process | 23.648 ms |
| RSS before first process exit | 419.43 MiB |
| RSS after second process reopen | 279.57 MiB |
| Final messages after continuation | 2,000 |
| Lost / duplicate / corrupt / incomplete | 0 / 0 / 0 / 0 |

## Growth findings

- Final SQLite family size was 8,511,352 bytes: database 4,288,512, WAL 4,190,072, SHM 32,768.
- Growth from the turn-0 baseline was 8,153,096 bytes, or 8,153 bytes per completed turn including initial WAL allocation. From turn 500 to 1,000 it grew 1,986,560 bytes, or 3,973 bytes per turn, which is consistent with bounded linear persistence rather than accelerating amplification.
- Core worker RSS peaked at 419.43 MiB before restart. The new process reopened at 279.57 MiB and finished at 389.91 MiB; the measured curve does not show process-global memory surviving the restart.
- Session-open and first-token latency grow with projected history. At 1,000 turns they remained 39.036 ms and 130.008 ms p95 respectively. This is a real linear-history cost to monitor, but it did not cause a crash, stall, corruption, or recovery failure in this run.

## Proposed baseline thresholds

These thresholds are derived from this first measured baseline and are **proposed for reviewer approval**, not silently converted into cleanup or product policy:

- exactly 1,000 unique inputs and 2,000 ordered visible messages;
- zero lost, duplicate, corrupt, or incomplete messages;
- successful process-boundary reopen with exactly 1,000 pre-restart messages;
- SQLite-family total no greater than 12 MiB at 1,000 turns and tail growth no greater than 6 KiB per turn from 500 to 1,000;
- core worker RSS peak no greater than 512 MiB on this fixture/machine;
- session reopen no greater than 75 ms, first-token p95 no greater than 200 ms, and completion p95 no greater than 225 ms.

The current run satisfies every proposed threshold. The harness currently enforces exact integrity and restart requirements; numeric performance/storage limits remain report-only until review approves them.

## Unavailable metrics and AC02 boundary

The core harness cannot reliably measure Electron renderer memory, Electron main-process memory, `opencode.global.dat`, workspace state, or draft state because it intentionally does not launch or synthesize the desktop renderer. Every raw report marks these fields `UNAVAILABLE`; they are not reported as zero.

Therefore:

```text
B1B_HARNESS = PASS
AC02_CORE_PERSISTENCE_AND_RECOVERY = PASS
AC02_FULL_PRODUCT = NOT_CONFIRMED
```

Full-product AC02 remains open for a future desktop-enabled harness/review of the proposed numeric thresholds. No SessionV2, renderer, IPC, persistence, or database production implementation was changed to manufacture a pass.

## Raw evidence

- `docs/next-version/evidence/b1b-longrun-100.json` — 100 per-turn raw latency samples and checkpoints.
- `docs/next-version/evidence/b1b-longrun-500.json` — 500 per-turn raw latency samples and checkpoints.
- `docs/next-version/evidence/b1b-longrun-1000.json` — 1,000 per-turn raw latency samples, all required checkpoints, and both sides of the restart boundary.

## Regression verification

| Command | Result |
| --- | --- |
| `packages/core: bun test test/chat-longrun-harness.test.ts` | PASS: 2 tests, 12 assertions; deterministic seed, corrupt-integrity rejection, metric completeness, sanitized report, and two-PID restart |
| `packages/core: bun test --only-failures` | PASS: 1,131 tests, 7 skipped, 0 failed, 3,078 assertions across 158 files |
| repository root: `bun typecheck` | PASS: 30/30 Turbo package tasks |
| `packages/app: bun run test:unit` | PASS: 716 tests, 1,897 assertions |
| `packages/app: bun run test:browser` | PASS: 30 tests, 69 assertions |
