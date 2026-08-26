# Acceptance cases

## Common evidence contract

Every case records commit, package/build identity, fixture hashes, exact command, exit code, test report, relevant machine-readable artifact, and verification boundary. A case cannot pass from screenshots alone. Unsupported GUI, packaged, installer, or real-provider claims remain unconfirmed until their dedicated gate is run.

## AC01 - Old database compatibility

Given a versioned pre-upgrade database containing sessions, messages, parts, attachments, durable V2 inputs, context epochs, and legacy business-task/review metadata, apply the new migrations and open it through the compatibility service.

Pass when all old records remain readable in order; attachment metadata and availability status are preserved; the legacy task/review view is semantically equivalent; migration is idempotent; and no legacy source row or metadata key is deleted. Evidence includes pre/post inventories, foreign-key/integrity results, adapter snapshots, and an exact-retry run.

## AC02 - One-thousand-turn chat

Run scenario C from the long-run harness with a fixed seed, including checkpoint reopen and controlled restart.

Pass when all 1,000 turns complete with no crash, corruption, lost/duplicate admitted input, or unrecoverable session; final history order matches the trace; and storage, memory, render, open, and recovery metrics are captured and satisfy the numeric thresholds approved from B1B baseline measurements.

## AC03 - DOCX structure

Parse a fixture containing headings, paragraphs, repeated text, and a multi-row/multi-cell table.

Pass when `DocumentContext` identity/hash/version are correct; all required paragraphs and table cells exist in order; repeated text resolves to different structural locators; quotes validate against part hashes; and a parser retry is deterministic.

## AC04 - XLS/XLSX structure

Parse fixtures with multiple sheets, formulas, displayed values, merged ranges, dates, and a table.

Pass when evidence resolves by sheet plus A1 cell/range; raw/display/formula values stay distinguishable; sheet names and cell order are preserved; and an exact evidence hash check passes. Legacy XLS and modern XLSX are both exercised.

## AC05 - PPTX structure

Parse a fixture with multiple slides, repeated text boxes, shapes, and a table.

Pass when slide/shape ordering is stable, text and table cells are addressable, repeated strings have distinct slide/shape locators, and unsupported image-only content is represented honestly without an OCR claim.

## AC06 - Text PDF structure

Parse a native-text PDF containing multiple pages and repeated text blocks, then test image-only, encrypted, and corrupt fixtures.

Pass when native text is addressed by page and block with valid hashes; the image-only fixture returns `OCR_REQUIRED`; encrypted and corrupt fixtures return their typed failures; and none are reported as a complete empty parse.

## AC07 - Conflicting well context

Process three geology documents that contain agreeing, conflicting, undefined-unit, and missing well fields.

Pass when every observation retains source and `EvidenceRef`; statuses are correctly distinguished; units are not guessed; identity-critical conflict is visible; and an explicit resolution appends its decision while leaving all candidates unchanged.

## AC08 - Review/fix/recheck lineage

Create a review with two evidenced issues. Accept and revise the first to pass; manually revise the second, observe `STILL_FAILED`, then supersede it with another revision.

Pass when the complete append-only order is reconstructable, exact retry does not duplicate events, stale before hashes reject a revision, original evidence remains intact, and the two final recheck results are correct.

## AC09 - Provider health classification

Feed deterministic success, authentication failure, rate-limit with retry-after, timeout, network, server, and unavailable-model outcomes through the health classifier.

Pass when status, classification, timestamps, expiration, retry-after, and redacted diagnostics match the contract; absent observations remain `UNKNOWN`; credentials are absent from artifacts; and no provider/model is switched automatically.

## AC10 - Read-only storage health

Scan an isolated fixture with an oversized SQLite/WAL pair, large state entry, stale draft candidate, large extraction cache, a permission-denied root, and an external reparse-point target.

Pass when the correct categories, thresholds, largest items, partial-scan warning, and recommendations are reported; the external target is not traversed; `mutation_count` is zero; and pre/post fixture hashes, sizes, and mtimes prove that nothing was changed.
