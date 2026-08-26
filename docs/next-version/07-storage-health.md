# Storage Health

## Batch 1 boundary

Storage Health is a read-only diagnostic subsystem in Batch 1. It may enumerate approved application roots, measure size/count/growth, identify probable orphans, and recommend actions. It may not delete, truncate, vacuum, compact, move, rewrite, or quarantine files.

## Scan categories

The scanner reports at least:

- SQLite databases and their WAL/SHM files;
- global application state;
- workspace/session state;
- drafts;
- attachment registry data and application-owned attachment copies;
- logs;
- general cache;
- document extraction cache;
- OCR cache;
- vector indexes;
- temporary application-owned files.

Original user documents outside application-owned roots are not scan targets. Paths are canonicalized and validated against the approved roots before traversal.

## Measurements

Each finding provides category, display-safe path, byte size, object count, recent growth estimate when history exists, largest bounded item list, probable orphan count, last-cleanup observation, health status, and recommended action. The report also records inaccessible paths and whether totals are partial.

Probable orphan rules must be category-specific and explain their evidence. Merely being old or large is not sufficient proof that an object is safe to delete.

## Thresholds

Thresholds are versioned configuration with safe defaults, not hard-coded business claims. A status can depend on absolute size, growth, count, fragmentation indicators, or failed integrity checks. The report exposes which threshold produced the classification.

SQLite diagnostics may read file sizes, page/freelist counts, journal mode, integrity-check result under a bounded policy, and pending-compaction markers. Batch 1 does not run `VACUUM` or change pragmas.

## Safety and performance

- Scans are cancellable and bounded by root, depth, object count, and elapsed time.
- Symlinks/reparse points are not followed outside approved roots.
- Permission failures yield partial findings and do not abort unrelated roots.
- Reports redact sensitive path segments by default and never read document content merely to calculate storage size.
- Repeated scans persist compact summaries, not unbounded per-file history.

## Evidence and acceptance

B1A produces a deterministic fixture tree plus an isolated SQLite fixture. AC10 must detect an oversized database/WAL, large state record, stale draft candidate, and large extraction cache; it must report `mutation_count = 0` and prove hashes and mtimes of fixtures are unchanged.
