# Phase 4.1A P5 — Runtime set reconciliation
**Date:** 2026-08-24
**Pinned commit:** `747dd6877ea36d1627e601e7c507f6278ba77b20`
**Pinned branch:** `rc6-business-skills`

## Universe definitions

| Set | Classification | Count | Source |
|---|---| | --- |
| `NORMAL_PRE` | AUTHORITATIVE_PRODUCTION_EQUIVALENT_FIXTURE | 41 | Phase 4.1A P4 fixture |
| `NORMAL_POST` | AUTHORITATIVE_PRODUCTION_EQUIVALENT_FIXTURE | 39 | Phase 4.1A P4 fixture |
| `REHEARSAL_PRE` | NON_AUTHORITATIVE_PARTIAL_WORKTREE_REHEARSAL | 29 | Batch1 worktree local evidence (now NON_AUTHORITATIVE) |
| `REHEARSAL_POST` | NON_AUTHORITATIVE_PARTIAL_WORKTREE_REHEARSAL | 27 | Batch1 worktree local evidence (now NON_AUTHORITATIVE) |

## Reconciliation: NORMAL_PRE vs REHEARSAL_PRE

- NORMAL_PRE has 41 skills
- REHEARSAL_PRE has 29 skills
- intersection: 29 skills (all REHEARSAL_PRE skills are in NORMAL_PRE)
- NORMAL_PRE only (12): skills present in production fixture but absent from Batch1 worktree local

  - `cognitive-profile`
  - `experiment-design`
  - `knowledge-distill`
  - `manim-agent`
  - `mcp-criticagent`
  - `mud-logging-review`
  - `papercheck`
  - `practical-course-producer`
  - `research-baseline-builder`
  - `sci-employee-deep-research`
  - `skill-criticagent`
  - `tender-bid-generation`

- REHEARSAL_PRE only (0): skills that the Batch1 worktree had locally but production fixture does not — should be empty


## Reconciliation: NORMAL_POST vs REHEARSAL_POST

- NORMAL_POST has 39 skills
- REHEARSAL_POST has 27 skills
- intersection: 27 skills
- NORMAL_POST only (12): skills preserved by the production-equivalent migration

  - `cognitive-profile`
  - `experiment-design`
  - `knowledge-distill`
  - `manim-agent`
  - `mcp-criticagent`
  - `mud-logging-review`
  - `papercheck`
  - `practical-course-producer`
  - `research-baseline-builder`
  - `sci-employee-deep-research`
  - `skill-criticagent`
  - `tender-bid-generation`

- REHEARSAL_POST only (0): should be empty (Batch1 worktree was a strict subset of production)


## Migration deltas (within each universe)

- NORMAL_PRE → NORMAL_POST: removed = ['effect', 'minimax-pdf']
- REHEARSAL_PRE → REHEARSAL_POST: removed = ['effect', 'minimax-pdf']

## Conclusion

- Both universes removed exactly `{effect, minimax-pdf}` — no third skill was removed in either case.
- REHEARSAL was a strict subset of NORMAL (every REHEARSAL skill is in NORMAL).
- The 12 skills present in NORMAL_PRE but absent from REHEARSAL_PRE are skills that the Batch1 worktree never had on disk.
- **NORMAL is authoritative. REHEARSAL is kept for traceability only.**
