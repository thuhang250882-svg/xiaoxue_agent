# Chat long-run harness

## Goal

The harness provides repeatable evidence for long sessions, restart recovery, persistence growth, and UI responsiveness. It is a test facility, not a benchmark claim about every machine or provider.

## Scenarios

| Scenario | Required workload |
| --- | --- |
| A | 100 short text turns |
| B | 500 short/medium text turns |
| C | 1,000 mixed-length text turns |
| D | Long messages, code blocks, streamed output, and large bounded tool results |
| E | Mixed DOCX/XLSX/PPTX/text-PDF attachments and follow-up questions |
| F | Chat -> skill invocation -> document review -> export -> continued chat |
| G | Controlled process termination and restart at admission, streaming, tool, and idle boundaries |

Provider-independent runs use a deterministic local stream fixture that exercises the real admission, persistence, projection, and rendering paths. A separate optional provider run records external variability and cannot replace the deterministic gate.

## Metrics

Capture per checkpoint:

- renderer and main-process working set, private bytes, and heap where available;
- SQLite database, WAL, state, draft, attachment, log, and cache sizes;
- time to open the session, first visible token, turn completion, scroll/render checkpoint, and restart recovery;
- message, part, durable input, context-epoch, tool, attachment, and error counts;
- crash, renderer-unresponsive, database-busy, corruption, lost-input, duplicate-input, and recovery results.

Measurements identify machine, OS, build/commit, scenario seed, fixture versions, and harness version. Raw samples and a summarized machine-readable report are retained as evidence.

## Checkpoints and assertions

- Record a baseline before the session and checkpoints at 100, 500, and 1,000 turns where applicable.
- Assert admitted prompt IDs remain unique, exact retry is idempotent, projected order is stable, and restart does not lose already admitted input.
- Verify messages and attachments reopen after restart and that pending/steered/queued delivery follows the V2 contract.
- Bound tool-result and attachment fixtures so the harness tests supported behavior rather than uncontrolled disk exhaustion.
- Report growth curves and deltas; do not hide end-state growth behind averages.

## AC02 pass criteria

AC02 passes only when the deterministic 1,000-turn run completes with no crash, corruption, lost or duplicated admitted input, or unrecoverable session; the final session reopens; and measured storage/state growth stays within reviewed thresholds established from the B1B baseline. The implementation plan must propose numeric thresholds from measured baseline data before the gate is enforced. This design does not invent unmeasured limits.

## Failure artifacts

On failure, retain the seed, last successful checkpoint, sanitized logs, database diagnostic summary, process metrics, scenario trace, and recovery result. User message/document content is not included unless it is a synthetic fixture.
