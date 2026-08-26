# Well-context architecture

## Purpose

`WellContext` creates one attributed view of well identity and operating facts from multiple documents without collapsing conflicting evidence. It is a domain aggregate over evidence, not a replacement for source documents.

## Flow

1. Extract candidate field observations from parsed parts.
2. Normalize value and unit without changing the raw observation.
3. Attach an `EvidenceRef`, source identity, confidence, and extraction method.
4. Group observations by canonical field key.
5. Classify each field as consistent, conflicting, missing, unknown, or resolved.
6. Resolve only through an explicit rule or human decision, recording reason and actor.

## Canonical fields

The initial registry may include well name, well ID, block, basin, coordinates, elevation, drilling depth, measured depth, vertical depth, formation, interval, report date, operation, and sample identity. The registry owns aliases, data type, canonical unit, comparison tolerance, and whether the field is identity-critical.

The registry is versioned. Adding aliases or unit conversions cannot rewrite historical attributed values; it may produce a new resolution result.

## Conflict semantics

- `CONSISTENT`: two or more comparable values agree within the field tolerance, or one authoritative observation exists without contradiction.
- `CONFLICT`: comparable observations disagree, units cannot be safely converted, or identity-critical sources name different wells.
- `RESOLVED`: a decision selected or derived a value while preserving the conflict and every observation.
- `UNKNOWN`: the source states that the value is unknown or cannot be interpreted.
- `MISSING`: no qualifying observation exists.

Absence is not evidence of an empty value. Low confidence is not automatically a conflict. A source-priority rule may recommend a resolution but cannot discard lower-priority evidence.

## Units and normalization

Raw text, parsed numeric value, original unit, normalized value, canonical unit, and conversion rule/version are stored separately. Undefined units stay unresolved and visibly require confirmation. Locale-specific dates and decimal separators are normalized only when the source form is retained.

## Resolution

Resolution records field, candidate evidence IDs, selected or derived value, reason, method (`HUMAN`, `RULE`, `AUTHORITATIVE_SOURCE`), actor, registry/rule version, and time. Re-resolution appends a new event and supersedes the earlier result; it does not mutate it.

## Consumer contract

Review and generation consumers receive the resolved value only with its status and provenance. Identity-critical conflicts block any claim that the bundle represents one well unless a user or approved rule resolves them. Unknown and missing fields remain distinct in prompts, exports, and reports.

## Acceptance

AC07 supplies three geology documents with at least one agreeing field, one conflicting field, one undefined-unit value, and one missing field. The result must retain all sources and evidence, mark the correct statuses, and prove that resolution does not delete the competing observations.
