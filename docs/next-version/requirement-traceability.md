# Requirement traceability

## P0/P1/P2 implementation traceability

| Requirement | Priority | Architecture | Code target | Batch | Acceptance | Automated test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Long-session and restart stability | P0-1 | `08-chat-longrun-harness.md`; durable V2 admission contract | `packages/core/src/session/**`, `packages/opencode/src/session/**`, app/desktop session paths | B1B | AC02 | Deterministic 100/500/1,000-turn, restart, ordering, recovery, and growth harness | PLANNED |
| Unified document pipeline | P0-2 | `DocumentContext` and `DocumentPart`; `04-document-evidence-architecture.md` | `packages/schema`, `packages/core`, `document_engine`; adapters for current callers | B1C | AC03-AC06 | Format fixtures, deterministic round-trip, safety limits, compatibility regression | PLANNED |
| Attributed multi-source well context | P0-3 | `WellContext -> WellField -> AttributedValue[]`; `05-well-context-architecture.md` | Schema/Core well-context services and geology-domain consumer adapter | B1E | AC07 | Unit/alias/conflict/resolution/persistence tests using three-source bundle | PLANNED |
| Traceable evidence model | P0-4 | `EvidenceRef` and typed locators; `04-document-evidence-architecture.md` | Schema/Core evidence tables, validator, and review/domain adapters | B1D | AC03-AC07 | Locator variants, repeated text, wrong hash/context, stale and legacy cases | PLANNED |
| Review, fix, revision, and recheck lifecycle | P0-5 | `06-review-fix-recheck.md` | Future Schema/Core lifecycle records plus review tool/UI adapters | Later batch | AC08 | State/lineage, exact retry, conflict, before/after, and recheck tests | PLANNED |
| Storage health and abnormal growth | P0-6 | `StorageHealth`; `07-storage-health.md` | Core read-only scanners and diagnostic surface | B1A | AC10 | Root boundary, threshold, partial scan, cancellation, and zero-mutation tests | PLANNED |
| Professional rules 2.0 | P1-1 | Versioned ruleset consuming WellContext and EvidenceRef | Future geology rules catalog and review integration | Deferred | Future rules acceptance | Gold-set precision/recall, unit/boundary, version replay | DEFERRED |
| Provider automatic resilience | P1-2 | `ProviderHealth` contract; safe provider-turn boundary | Future provider health/attempt/policy services | Deferred | AC09 covers classification only | Failure-classification now; future safe-boundary fallback integration | MODEL_ONLY |
| Model Registry productization | P1-3 | Stable model identity, config/storage/HTTP prerequisites | Future Schema/Core/Protocol/Server/client/settings implementation | Deferred | Future registry acceptance | CRUD/restart/reference/corruption/redaction/real-loopback/GUI tests | DO_NOT_IMPLEMENT |
| Skill Center productization | P1-4 | Existing Skill runtime plus future source/conflict/health model | Future public HttpApi, generated client, diagnostics, and UI | Deferred | Future Skill Center acceptance | Same-name multi-source, permission, route, packaging, and GUI tests | DO_NOT_IMPLEMENT |
| Advanced layout OCR | P2-1 | OCR is downstream of immutable document parts/evidence | Future isolated OCR runtime and parser adapter | Deferred | Future OCR gold set | Handwriting/rotation/cross-page table accuracy and performance | DEFERRED |
| In-place Office format rewriting | P2-2 | Revision/artifact version contract | Future controlled DOCX/XLSX/PPTX writers | Deferred | Future round-trip acceptance | Formula/style/header/footer/macro preservation gold set | DEFERRED |
| Multi-well/block batch analysis | P2-3 | Aggregation above stable single-well contexts | Future domain batch service | Deferred | Future multi-well acceptance | Isolation, aggregation, trend, and scale tests | DEFERRED |
| Cross-device sync and collaborative review | P2-4 | Durable event/version/conflict and audit model | Future sync/security/collaboration services | Deferred | Future collaboration acceptance | Conflict, authorization, offline replay, and audit tests | DEFERRED |
| Clustered session execution and crash replay | P2-5 | Durable execution identity, idempotent tools, clustered ownership | Future Session execution/placement layer | Deferred | Future cluster acceptance | Ownership, failover, duplicate-side-effect, and partition tests | DEFERRED |

Counts: P0 = 6, P1 = 4, P2 = 5. No implementation target above is authorized by this design gate; `PLANNED` means traceable, not implemented.

## Design-gate traceability

| Requirement | Contract | Acceptance | Planned batch |
| --- | --- | --- | --- |
| Confirm branch/HEAD/worktree/tests | `00-overview.md` | Baseline evidence | Gate only |
| Reuse current migrations and preserve old data | `02-migration-contract.md` | AC01 | Foundation for B1C-B1E |
| Read old, write new | `03-compatibility-contract.md` | AC01 | Foundation |
| Exact AC01-AC10 definitions | `09-acceptance-cases.md` | AC01-AC10 | Cross-batch |
| Exact B1A-B1E implementation spec | `10-batch1-implementation-plan.md` | Batch completion gate | Batch 1 |
| No product implementation during design gate | `00-overview.md`, `10-batch1-implementation-plan.md` | Git diff/status audit | Gate only |

## Entity coverage

| Entity | Definition | Persistence/migration | Compatibility |
| --- | --- | --- | --- |
| `DocumentContext` | `01-schema-contract.md` | `02-migration-contract.md` | Parser adapter in `03-compatibility-contract.md` |
| `DocumentPart` | `01-schema-contract.md` | `02-migration-contract.md` | Existing `ParsedDocument` adapter |
| `EvidenceRef` | `01-schema-contract.md` | Legacy mapping in `02-migration-contract.md` | Unresolved legacy evidence retained |
| `WellContext` | `01-schema-contract.md` | Additive normalized tables | No inferred legacy values |
| `TaskRun` | `01-schema-contract.md` | Business-task mapping | Normalized-first view |
| `ReviewRun` | `01-schema-contract.md` | Review-result mapping | Legacy ruleset marker |
| `ReviewIssue` | `01-schema-contract.md` | Issue/evidence mapping | Unknown values retained raw |
| `FixDecision` | `01-schema-contract.md` | Additive append-only table | No legacy equivalent required |
| `Revision` | `01-schema-contract.md` | Additive append-only table | No legacy equivalent required |
| `Recheck` | `01-schema-contract.md` | Additive append-only table | No legacy equivalent required |
| `StorageHealth` | `01-schema-contract.md` | Compact diagnostic summaries | Missing data means unknown/partial |
| `ProviderHealth` | `01-schema-contract.md` | Expiring observations | Missing data means `UNKNOWN` |

## Risk register

### P0

| Risk | Prevention | Proof |
| --- | --- | --- |
| Old data loss or unreadable rollback | Additive tables, untouched legacy metadata, transactional migration, backup/preflight, legacy fallback | AC01 inventories and rollback/open test |
| Evidence points to the wrong repeated text | Typed structural locator plus context/source/part hashes; no fuzzy rebinding | AC03-AC06 negative and repeated-text cases |
| Long-session corruption or lost durable input | Deterministic 1,000-turn and restart trace validation | AC02 |
| Diagnostic cleanup mutates user data | No cleanup API in Batch 1, approved roots, pre/post mutation proof | AC10 |

### P1

| Risk | Prevention | Proof |
| --- | --- | --- |
| Dual sources of truth diverge | Normalized-only writes; legacy is fallback; derived projection is replaceable | AC01 mixed-lineage conflict case |
| Conflicting well values are silently collapsed | Immutable attributed observations and append-only resolution | AC07 |
| Parser resource exhaustion or unsafe external content | Format limits, no macro/external execution, typed failures | B1C safety tests |
| Long-run thresholds are arbitrary | Measure B1B baseline before reviewer-approved numeric thresholds | B1B evidence package |
| Provider diagnostics leak credentials or trigger surprise failover | Redacted details and informational-only health | AC09 |

### P2

| Risk | Prevention | Proof |
| --- | --- | --- |
| Parser-version drift invalidates historical citations | Immutable contexts and explicit stale status | B1D version-change test |
| Full-history backfill blocks startup | Lazy adapter plus resumable `data_migration` backfill | AC01 resume/idempotency test |
| Missing source artifacts are presented as available | Separate metadata from availability verification | AC01 exported-artifact case |
| Scope expands into OCR, cleanup, failover, Registry, or Skill Center | Explicit Batch 1 exclusions and diff review | Batch completion review |

## Approval checklist

- [x] Required design documents are present.
- [x] Requested entities have explicit contracts.
- [x] Migration, rollback, and old-data behavior are explicit.
- [x] AC01-AC10 have executable inputs and pass conditions.
- [x] B1A-B1E define scope, tests, evidence, and commit boundaries.
- [x] P0/P1/P2 risks have prevention and proof.
- [x] This gate contains documentation only.
- [ ] Reviewer approves implementation entry.
