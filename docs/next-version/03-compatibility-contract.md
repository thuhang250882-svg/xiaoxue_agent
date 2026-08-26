# Compatibility contract

## Read old, write new

The compatibility policy is `read old, write new`:

- Reads first use valid normalized records and then adapt legacy metadata when no normalized lineage exists.
- New task, review, document, evidence, and well-context writes use normalized tables as the only source of truth.
- Legacy metadata is not deleted, rewritten, or treated as an independently mutable mirror.
- If an unchanged legacy UI still needs its old shape during transition, it receives a derived in-memory projection or explicitly versioned replaceable cache. That projection cannot become the authoritative write path.

## Adapter behavior

The adapter returns a common view with provenance `NORMALIZED`, `LEGACY`, or `MIXED`. It exposes unresolved and malformed fields instead of inventing defaults. It must be deterministic for the same database snapshot.

When both forms exist, a valid normalized lineage wins. A conflict is surfaced as a diagnostic with both source identifiers; timestamp order alone cannot silently choose a winner.

## Existing data guarantees

The upgrade must preserve:

- sessions, messages, parts, todos, shares, and durable V2 inputs/messages/context epochs;
- legacy attachments and trusted-attachment registry behavior;
- business-task history stored in session metadata;
- exported-artifact references, including honest missing-file status;
- legacy DOC/XLS parsing behavior already covered by tests;
- unknown metadata keys belonging to other features.

AC01 is the mandatory compatibility proof: a fixture upgraded from an old database must open its sessions, messages, attachments, and legacy business-task history without semantic loss.

## API and dependency compatibility

Batch 1 should prefer internal services until a public HTTP use case is accepted. Any later public contract is additive and versioned. Protocol/Server `HttpApi` changes require client regeneration from `packages/client`; generated directories remain generated artifacts.

The runtime dependency direction remains Schema to Core/Protocol, then Core/Protocol to Server. Client runtime code may use Schema and Protocol but never Core or Server.

## Parser compatibility

- Existing `ParsedDocument` callers continue to work through an adapter while the normalized pipeline is introduced.
- New parsers emit `DocumentContext` and `DocumentPart`. Existing output may be derived from these parts during transition.
- Parser-version changes produce a new context and leave old evidence intact.
- PPTX support is additive.
- Text PDF support stays distinct from OCR. An image-only PDF produces the explicit `OCR_REQUIRED` outcome until the OCR stage is approved.

## Degradation rules

- Missing source file: retain metadata and evidence, mark source availability missing.
- Changed source hash: do not rebind evidence; mark it stale and require reparse.
- Unsupported/corrupt/encrypted document: return typed failure without a partial success claim.
- Unknown legacy task type or issue severity: retain raw value and expose a compatibility warning.
- Provider-health absence: `UNKNOWN`, never `HEALTHY` by assumption.
- Storage scan permission error: partial report with the unread root identified; never claim a complete scan.

## Removal gate

Legacy reads may be considered for removal only after migration coverage is measured, rollback support has expired by release policy, all supported upgrade fixtures pass, and the owner explicitly approves deletion. This design gate does not authorize that removal.
