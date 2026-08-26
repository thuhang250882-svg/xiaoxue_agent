# Review, fix, and recheck lifecycle

## State model

The required lineage is:

`TaskRun -> ReviewRun -> ReviewIssue -> FixDecision -> Revision -> Recheck`

Task execution and review execution are different records. A review can fail without changing the business task result, and a task can have multiple reviews with different rulesets.

## Review creation

A completed review records the exact input document contexts, well-context version, ruleset/version, reviewer/model identity, and ordered issues. Every substantive issue has at least one valid evidence reference or is explicitly marked `need_human_confirm` with an unresolved legacy/source reason.

Stable issue fingerprints use rule ID plus normalized target and evidence identity. They support comparisons but are not globally unique issue IDs.

## Decision contract

Every user or system response to an issue appends a `FixDecision`:

- `ACCEPT_FIX`: authorize the proposed revision.
- `REJECT_FIX`: decline the proposal and retain the issue history.
- `MANUAL_FIX`: user will or did supply a distinct revision.
- `IGNORE`: acknowledge but intentionally take no corrective action.

The actor and reason are mandatory for reject, manual, and ignore. A later decision supersedes rather than overwrites an earlier one.

## Revision contract

A revision is the auditable difference between a before artifact/value and an after artifact/value. It records hashes, target locator, source, actor, rationale, related decision, and evidence. For file-producing changes, the revision identifies both artifact versions; it never overwrites the only retained copy without a recoverable version.

An accepted fix with no successfully persisted revision remains `DECIDED`, not `FIXED`.

## Recheck contract

Recheck uses an explicit revision set and a recorded ruleset/version. Results are:

- `PASSED`: the original issue no longer reproduces.
- `STILL_FAILED`: the original issue remains.
- `NEW_ISSUE`: the revision caused or exposed a distinct issue; create and link a new issue.
- `NOT_APPLICABLE`: the issue can no longer be evaluated, with reason.

Recheck evidence must point to the revised document context or explain why no resolvable source exists. A recheck never changes the evidence retained by the original review.

## Status derivation

- Open issue plus decision -> `DECIDED`, `REJECTED`, or `IGNORED` according to decision.
- Accepted/manual decision plus persisted revision -> `FIXED`.
- Completed recheck -> `RECHECKED`; the recheck result remains a separate field.
- Status is derived from append-only lifecycle records and cannot be changed by editing a summary JSON blob.

## Concurrency and idempotency

Decision and revision commands carry a client request ID. Exact retries return the existing event; conflicting reuse fails. A revision checks the expected before hash. If the target has changed, the command fails with a conflict and requires fresh review.

## Acceptance

AC08 covers two issues: one accepted and revised to `PASSED`, and one manually revised to `STILL_FAILED` followed by a superseding revision. The evidence must reconstruct the entire order, actors, before/after hashes, decisions, and rechecks.
