# Document and evidence architecture

## Pipeline

The normalized pipeline is:

`source registration -> safety/type validation -> immutable hashing -> format parser -> DocumentContext -> DocumentPart -> evidence extraction -> EvidenceRef validation -> task/review consumers`

Parsing and evidence extraction are separate stages. A parser describes what is present; a reviewer or rule decides what it means.

## Format contracts

### DOCX

- Parse paragraphs, heading levels, tables, rows, and cells in document order.
- Preserve paragraph and table-cell boundaries; do not flatten the entire document into one evidence string.
- Use paragraph or table/row/cell locators, with an optional run range for exact quotes.
- Retain the existing legacy DOC behavior through its adapter, but new structural guarantees apply to DOCX first.

### XLS and XLSX

- Parse workbook, sheet order/name, used ranges, individual cells, formulas, displayed values, merged ranges, and recognized tables.
- A value used as evidence points to a sheet plus A1 cell/range. Row numbers or free-form descriptions alone are insufficient.
- Preserve raw value, displayed value, formula, and inferred data type as separate properties.
- Do not calculate or overwrite workbook formulas unless an explicitly approved calculation engine is present.

### PPTX

- Parse slides in presentation order, shapes in stable package order, text boxes, shape text, and tables/cells.
- Evidence points to slide plus shape, optionally table/row/cell.
- Images may be represented as non-text parts with metadata, but image OCR is out of Batch 1.
- Speaker notes are reserved by the schema but not required for Batch 1 acceptance.

### PDF

- Batch 1 parses PDFs with a usable native text layer into pages and ordered text blocks, retaining optional bounding boxes.
- It must distinguish text PDF, image-only/OCR-required, encrypted, corrupt, and unsupported inputs.
- Image-only PDF OCR is explicitly deferred and must return `OCR_REQUIRED`, not an empty successful parse.

### TXT, Markdown, and CSV

- TXT parts use line or text-block locators with encoding recorded in context metadata.
- Markdown preserves line ranges and block kind/path while remaining compatible with the text pipeline.
- CSV adds row/column addressing while retaining the line range needed for source inspection.

## Parser boundary

Each parser receives a validated, trusted source handle and emits a versioned context plus parts. It must not write review issues or resolved well fields. Parser output has bounded metadata and no embedded document binaries or unbounded data URLs.

Partial output is allowed only when the result explicitly carries a typed partial status and parser diagnostics. A corrupt or encrypted file cannot be reported as a complete parse.

## Evidence creation

An evidence producer selects an existing part, records the exact locator and source/part hashes, and stores a bounded quote. Derived evidence additionally identifies its contributing evidence references. Cross-document conclusions link every contributing source.

Before persistence, evidence validation proves:

1. the context exists and has the expected source hash;
2. the part belongs to the context;
3. the locator exactly matches the part locator;
4. the part hash matches;
5. the quote is either an exact bounded excerpt or explicitly marked normalized/derived.

If any check fails, the reference is rejected for a new write. An existing reference encountered after source change becomes `STALE`.

## Cache policy

Document extraction caches are derived data, addressed by file hash plus parser/version, and reported by Storage Health. Cache eviction may be designed later; Batch 1 cannot delete it. Task ownership and evidence records must remain valid even if derived cache material is absent.

## Security and privacy

- Accept only trusted native selections or validated uploads and re-check file type, extension, MIME, size, and hash at the parsing boundary.
- Do not copy raw local paths into model prompts, public APIs, default logs, or telemetry.
- Do not execute macros, embedded objects, workbook links, scripts, or external relationships.
- Apply decompression, XML entity, worksheet dimension, slide/shape, page, and extracted-text limits.
- Redact secrets from parser diagnostics and provider-visible content according to the existing permission model.

## Batch 1 evidence

For each supported format, retain a fixture, parser-version output summary, part/locator snapshot, hash-validation result, and regression-test log. AC03-AC06 are the format acceptance cases.
