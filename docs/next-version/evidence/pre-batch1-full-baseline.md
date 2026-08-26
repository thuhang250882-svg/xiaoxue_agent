# Pre-Batch 1 full baseline

## Frozen identity

| Item | Value |
| --- | --- |
| Branch | `dev` |
| Design gate commit | `ed162e029fc58e5d66c7df9421eb9ae01829bb2b` |
| Design gate parent | `143f31e0d7d9426753eb61711365fe02d491f9d9` |
| Tracked changes before tests | 0 |
| Existing untracked files | 16; all matched the frozen SHA-256 inventory after tests |
| Baseline disposition | `IMPLEMENTATION_READY = YES_WITH_BASELINE_EXCEPTIONS` |

## Environment

| Item | Value |
| --- | --- |
| OS | Microsoft Windows NT 10.0.26200.0, x64 |
| PowerShell | 7.6.4 |
| Bun | 1.3.14 |
| Node | 24.15.0 |
| Git | 2.55.0.windows.2 |
| Logical processors | 32 |

## Official verification discovery

The repository root intentionally rejects `bun test`. `.github/workflows/test.yml` defines the package-orchestrated unit command `GITHUB_ACTIONS=false bun turbo test`, the Windows/Linux Playwright command `bun --cwd packages/app test:e2e:local`, and Linux-only generated-client and HttpApi gates. `.github/workflows/typecheck.yml` defines `bun typecheck`, which delegates to Turbo package typechecks.

This Windows baseline therefore ran the official cross-platform unit orchestration, official Turbo typecheck, and official Windows Playwright E2E. Linux-only generated-client and HttpApi gates were not represented as Windows passes.

## Results

### Full package unit/browser orchestration

Command: `GITHUB_ACTIONS=false bun turbo test`

First run:

- Result: failed after 3 minutes 46 seconds.
- Core: 1,125 passed, 7 skipped, 1 failed across 1,133 tests.
- Failure: `Snapshot > isolates snapshot indexes by canonical Git worktree` exceeded its 5,000 ms test timeout.
- Turbo summary: 7 successful tasks out of 9 reached tasks; the failing Core task prevented a full-chain pass.
- The failing snapshot file was then run twice in isolation from `packages/core`; both runs passed all 4 tests, with the affected test taking about 4.08 and 4.10 seconds.

Second run:

- Core completed with 1,126 passed, 7 skipped, 0 failed across 1,133 tests in 205.10 seconds.
- The Opencode test task continued at high CPU without a completion summary beyond the workflow's 20-minute unit-job limit.
- Result: terminated at the official timeout boundary and classified as a baseline timeout, not a pass.

The orchestration also confirmed App unit 716/716, App browser 30/30, UI 9/9, and Session UI 79/79 on the frozen tree.

### Full Turbo typecheck

Command: `bun typecheck`

- Result: pass.
- Turbo summary: 30 successful package tasks, 0 failed.
- Duration: 39.55 seconds.

### Playwright E2E

Preparation from CI: `bunx playwright install chromium` from `packages/app`.

Command: `CI=true bun --cwd packages/app test:e2e:local`

- The first attempt was stopped after the environment reported that Chromium headless shell v1217 was absent; this was an environment prerequisite, not a product assertion.
- After installing the exact Playwright Chromium dependency, the complete retry ran 92 tests.
- Result: 91 passed, 1 failed in 2 minutes 1 second.
- Stable failure across the initial attempt and two retries: `session-timeline-history-root.spec.ts`, scenario `keeps visible timeline content visible through interruption`.
- Assertion: expected the tracked item to be visible (`hidden = false`) but received `hidden = true` at line 213.

## Known baseline exceptions

| ID | Classification | Evidence | Action in Phase 0 |
| --- | --- | --- | --- |
| BASE-UNIT-001 | Pre-existing concurrency/timing flake | Snapshot worktree-isolation test timed out once in the full run, then passed twice alone and passed in the second full Core run | Recorded; not modified |
| BASE-UNIT-002 | Pre-existing full-suite timeout | Opencode package test did not complete within the CI unit job's 20-minute limit on the second orchestration | Recorded; not relaxed or modified |
| BASE-E2E-001 | Pre-existing reproducible E2E failure | Playwright 91/92; interruption history-root visibility assertion failed across three attempts | Recorded; not modified |
| BASE-ENV-001 | Resolved local prerequisite | Playwright Chromium v1217 was initially missing, then installed with the same command used by CI | Resolved without repository code changes |

## Side-effect audit

The unit run created `.opencode/.migration-state.json` in the repository. It was a new test-generated artifact timestamped during the run, was not part of the frozen 16-file inventory, and was removed after recording. No existing untracked file was deleted, moved, staged, or modified.

After the checks:

- tracked product-code changes: 0;
- original untracked fingerprint matches: 16/16;
- full suite: `FAIL_WITH_BASELINE_EXCEPTIONS`;
- implementation readiness: `YES_WITH_BASELINE_EXCEPTIONS` under the approved rule permitting documented pre-existing failures.
