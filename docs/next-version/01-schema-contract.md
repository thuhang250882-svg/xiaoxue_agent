# Schema contract

## Common rules

- Persist identifiers as opaque strings and timestamps as Unix milliseconds.
- Persist enums as explicit uppercase values. Unknown future values must fail validation at write boundaries and remain recoverable as raw legacy input at read boundaries.
- All externally presented structural indices are 1-based.
- Content hashes use an algorithm-qualified representation, initially `sha256:<lowercase-hex>`.
- User-visible paths are display-safe. A raw local path is optional, local-only, and excluded from default API payloads, logs, and telemetry.
- New parser output is immutable. A parser or parser-version change creates a new `DocumentContext` rather than replacing prior evidence anchors.

## DocumentContext

Represents one parser execution over one immutable source document.

| Field | Contract |
| --- | --- |
| `id` | Stable context ID |
| `task_run_id` | Owning `TaskRun`; nullable only for explicit preflight parsing |
| `source_type` | `UPLOAD`, `LOCAL_FILE`, `GENERATED`, `LEGACY_IMPORT` |
| `source_path` | Optional local-only canonical path; never public by default |
| `display_path` | Optional redacted or user-facing path |
| `original_filename` | Original basename, preserved exactly |
| `mime_type` | Validated MIME type or `application/octet-stream` |
| `file_size` | Non-negative byte count |
| `file_hash` | Algorithm-qualified source hash |
| `parser` | Parser implementation identifier |
| `parser_version` | Immutable parser contract version |
| `created_at` | Creation time |
| `metadata` | Versioned, bounded JSON metadata; never an unbounded binary payload |

Uniqueness is `(file_hash, parser, parser_version, task_run_id)` when `task_run_id` exists. Deduplication may reuse content internally but must preserve per-task ownership.

## DocumentPart

Represents an addressable structural unit inside a `DocumentContext`.

| Field | Contract |
| --- | --- |
| `id` | Stable part ID |
| `document_context_id` | Parent context |
| `parent_part_id` | Optional structural parent |
| `ordinal` | Stable order within the parent |
| `part_type` | Typed structural kind listed below |
| `locator` | Validated discriminated locator |
| `page_number`, `sheet_name`, `slide_number` | Nullable query projections derived from `locator`; never independent location truth |
| `paragraph_index`, `table_index`, `row_index`, `column_index` | Nullable query projections derived from `locator`; validated against it on write |
| `text_content` | Normalized searchable text; nullable for non-text parts |
| `structured_content` | Bounded typed JSON for rows, cells, or layout metadata |
| `content_hash` | Hash of canonical part content and locator |
| `metadata` | Parser-specific, versioned metadata |
| `created_at` | Creation time |

Part types include `WORD_PARAGRAPH`, `WORD_HEADING`, `WORD_TABLE`, `WORD_TABLE_CELL`, `EXCEL_SHEET`, `EXCEL_CELL`, `EXCEL_RANGE`, `EXCEL_TABLE`, `PPTX_SLIDE`, `PPTX_TEXT_BOX`, `PPTX_TABLE`, `PPTX_SHAPE_TEXT`, `PDF_PAGE`, `PDF_TEXT_BLOCK`, `PDF_TABLE`, `TEXT_LINE`, `TEXT_BLOCK`, and `MARKDOWN_BLOCK`. `PPTX_SPEAKER_NOTE` is reserved for a later parser version.

## Structural locator

`locator` is a discriminated union, not a free-form string:

| Format | Required address | Optional refinement |
| --- | --- | --- |
| DOCX | paragraph index, or table/row/cell indices | run range, heading path |
| XLS/XLSX | sheet name plus A1 cell or range | table name, formula flag |
| PPTX | slide index plus shape index | table/row/cell indices |
| PDF | page index plus text-block index | bounding box and character range |
| TXT/Markdown/CSV | line start and line end | character range, Markdown block path, or CSV row/column |

Every locator carries `kind` and `locator_version`. The associated context supplies the source hash and parser version. A locator resolves only within that exact context.

## EvidenceRef

Evidence is a first-class reference to a document part.

| Field | Contract |
| --- | --- |
| `id` | Stable evidence ID |
| `document_context_id` | Exact parsed source |
| `document_part_id` | Exact part when resolved; nullable for preserved legacy evidence |
| `evidence_type` | `DIRECT`, `DERIVED`, `CROSS_DOCUMENT`, `LEGACY_TEXT` |
| `locator` | Snapshot of the validated structural locator |
| `quote` | Bounded source excerpt for human review |
| `normalized_value` | Optional canonical value used by rules |
| `confidence` | Decimal from 0 through 1; nullable when not calculated |
| `source_hash` | Source document hash at creation |
| `part_hash` | Part content hash at creation |
| `resolution_status` | `RESOLVED`, `UNRESOLVED`, `STALE`, `LEGACY_ONLY` |
| `created_at` | Creation time |

Evidence validation must verify context ownership, part ownership, locator equality, and both hashes. A mismatch marks evidence `STALE`; it must not silently rebind to nearby text.

## WellContext and WellField

`WellContext` aggregates attributed observations without losing disagreements.

| WellContext field | Contract |
| --- | --- |
| `id` | Stable ID |
| `task_run_id` | Owning task |
| `well_identity` | Optional resolved well identifier |
| `status` | `CONSISTENT`, `CONFLICT`, `RESOLVED`, `UNKNOWN`, `MISSING` |
| `created_at`, `updated_at` | Lifecycle timestamps |

Each `WellField` has a field key, data type, unit, status, optional resolved value, resolution reason, resolver identity, and resolution timestamp. Each field owns one or more immutable attributed values with raw value, normalized value, unit, source document, `EvidenceRef`, confidence, and observation time. Resolution selects or derives a value while retaining every attributed value.

## TaskRun

Represents durable business-task execution, not review history.

Required fields: `id`, `session_id`, `task_type`, `status`, `requested_by`, `input_contract_version`, `created_at`, `started_at`, `completed_at`, `error_code`, `error_message`, `legacy_source_id`, and bounded `metadata`.

Statuses are `ADMITTED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`. Input and generated-artifact relations are normalized child records; binary payloads are not stored in task JSON.

## ReviewRun and ReviewIssue

`ReviewRun` belongs to a `TaskRun` and records reviewer identity, ruleset/version, status, score, summary, start/completion timestamps, and optional parent review for comparison. Statuses are `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`.

`ReviewIssue` belongs to one review and records type, severity, status, title, finding, recommendation, rule/basis, human-confirmation requirement, stable issue fingerprint, and ordered `EvidenceRef` links. Severities are `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFO`; issue statuses are `OPEN`, `DECIDED`, `FIXED`, `REJECTED`, `IGNORED`, `RECHECKED`.

## FixDecision, Revision, and Recheck

`FixDecision` records exactly one explicit decision event: `ACCEPT_FIX`, `REJECT_FIX`, `MANUAL_FIX`, or `IGNORE`, plus actor, reason, timestamp, and superseded decision when applicable. Decisions are append-only.

`Revision` records target type/ID/locator, before value/hash, after value/hash, revision source (`AI`, `USER`, `RULE`, `IMPORT`), actor, rationale, evidence links, artifact version, and timestamp. It never mutates the evidence that justified the original issue.

`Recheck` records the source review/issue, revision set, checker/ruleset version, result (`PASSED`, `STILL_FAILED`, `NEW_ISSUE`, `NOT_APPLICABLE`), evidence links, details, and timestamp. A new issue is a new `ReviewIssue`, linked to the recheck.

## StorageHealth

One scan contains scan ID, mode (`DIAGNOSE` in Batch 1), start/completion time, overall status, roots examined, errors, and totals. Each finding contains path/display path, category, size, object count, growth estimate, largest items, orphan count, last cleanup time, health status, and recommended action.

Categories include `SQLITE`, `GLOBAL_STATE`, `WORKSPACE_STATE`, `DRAFT`, `ATTACHMENT`, `LOG`, `CACHE`, `DOCUMENT_EXTRACTION_CACHE`, `OCR_CACHE`, `VECTOR_INDEX`, and `TEMP`. Statuses are `HEALTHY`, `NOTICE`, `WARNING`, `CRITICAL`, `UNKNOWN`. Recommendations are descriptive only in Batch 1.

## ProviderHealth

One observation records provider, optional model, status (`UNKNOWN`, `HEALTHY`, `DEGRADED`, `UNAVAILABLE`), failure classification, last success, last failure, rolling failure count/window, latency, observed time, expiration time, retry-after value, and redacted diagnostic details.

Failure classifications include `AUTH_ERROR`, `RATE_LIMITED`, `TIMEOUT`, `NETWORK_ERROR`, `SERVER_ERROR`, `MODEL_UNAVAILABLE`, `INVALID_REQUEST`, and `UNKNOWN_ERROR`. Health is informational in Batch 1; it cannot switch providers or models automatically.
