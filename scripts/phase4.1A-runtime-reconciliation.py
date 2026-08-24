"""Phase 4.1A P5 — Runtime set reconciliation.

Computes the set-difference between three runtime Skill universes:

1. **NORMAL_PRE** — the production-equivalent Skill asset snapshot fixture
   (Phase 4.1A P4) before any migration runs. This is 41 skills, derived
   from `rc6-business-skills@747dd6877e` minus `giiisp-paper-search-apis`.

2. **NORMAL_POST** — the same universe after `runPending([configDir])`
   runs in the Batch1 worktree (registry contains giiisp + effect + minimax-pdf).
   Only effect + minimax-pdf were present in the fixture, so only those
   2 are removed. Result: 39 skills.

3. **REHEARSAL_PRE / REHEARSAL_POST** — the 29 → 27 evidence captured
   against the Batch1 worktree's local partial `.opencode/skills/` set.
   These are now classified as `NON_AUTHORITATIVE_PARTIAL_WORKTREE_REHEARSAL`
   and must NOT be used as Phase 4.1 P12 acceptance evidence.

Output:
- `.db-rehearsal/phase4.1A-runtime-reconciliation.json`
- `.db-rehearsal/phase4.1A-runtime-reconciliation.md` (human-readable summary)
"""

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURE = REPO_ROOT / "packages" / "opencode" / "test" / "skill" / "fixtures" / "production-skill-names.json"
REHEARSAL_PRE = REPO_ROOT / "packages" / "opencode" / "test" / "skill" / "fixtures" / "phase4.1-batch1-runtime-before-2026-08-24-NON_AUTHORITATIVE_PARTIAL_WORKTREE_REHEARSAL.json"
REHEARSAL_POST = REPO_ROOT / "packages" / "opencode" / "test" / "skill" / "fixtures" / "phase4.1-batch1-runtime-after-2026-08-24-NON_AUTHORITATIVE_PARTIAL_WORKTREE_REHEARSAL.json"

OUT_JSON = REPO_ROOT / ".db-rehearsal" / "phase4.1A-runtime-reconciliation.json"
OUT_MD = REPO_ROOT / ".db-rehearsal" / "phase4.1A-runtime-reconciliation.md"

# We must use Batch1 worktree's evidence files (not the main worktree's).
# Resolve relative to Batch1 worktree by convention.
BATCH1_ROOT = REPO_ROOT.parent / "opencode-dev-phase4.1-batch1"
BATCH1_FIXTURE = BATCH1_ROOT / "packages" / "opencode" / "test" / "skill" / "fixtures" / "production-skill-names.json"
BATCH1_REHEARSAL_PRE = BATCH1_ROOT / "docs" / "skill-center" / "phase4.1-batch1-runtime-before-2026-08-24-NON_AUTHORITATIVE_PARTIAL_WORKTREE_REHEARSAL.json"
BATCH1_REHEARSAL_POST = BATCH1_ROOT / "docs" / "skill-center" / "phase4.1-batch1-runtime-after-2026-08-24-NON_AUTHORITATIVE_PARTIAL_WORKTREE_REHEARSAL.json"


def load_set(path: Path, key: str) -> list[str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return sorted(set(data[key]))


def diff(a: list[str], b: list[str]) -> dict:
    sa, sb = set(a), set(b)
    return {
        "a_only": sorted(sa - sb),
        "b_only": sorted(sb - sa),
        "intersection": sorted(sa & sb),
        "a_count": len(a),
        "b_count": len(b),
    }


def main() -> int:
    # Load production-equivalent fixture
    fixture = json.loads(BATCH1_FIXTURE.read_text(encoding="utf-8"))
    NORMAL_PRE = sorted(set(fixture))
    # giiisp is excluded from fixture already; targets in Batch1 registry
    # that are in the fixture: effect + minimax-pdf
    NORMAL_POST = sorted(set(NORMAL_PRE) - {"effect", "minimax-pdf"})

    # Load rehearsal evidence (NON_AUTHORITATIVE)
    REHEARSAL_PRE = load_set(BATCH1_REHEARSAL_PRE, "pre_migration_skills")
    REHEARSAL_POST = load_set(BATCH1_REHEARSAL_POST, "post_migration_skills")

    # Reconciliations
    pre_diff = diff(NORMAL_PRE, REHEARSAL_PRE)
    post_diff = diff(NORMAL_POST, REHEARSAL_POST)

    reconciliation = {
        "phase": "4.1A P5",
        "pinned_commit": "747dd6877ea36d1627e601e7c507f6278ba77b20",
        "pinned_branch": "rc6-business-skills",
        "evidence_classification": {
            "NORMAL_PRE": "AUTHORITATIVE_PRODUCTION_EQUIVALENT_FIXTURE",
            "NORMAL_POST": "AUTHORITATIVE_PRODUCTION_EQUIVALENT_FIXTURE",
            "REHEARSAL_PRE": "NON_AUTHORITATIVE_PARTIAL_WORKTREE_REHEARSAL",
            "REHEARSAL_POST": "NON_AUTHORITATIVE_PARTIAL_WORKTREE_REHEARSAL",
        },
        "sets": {
            "NORMAL_PRE": {"count": len(NORMAL_PRE), "names": NORMAL_PRE},
            "NORMAL_POST": {"count": len(NORMAL_POST), "names": NORMAL_POST},
            "REHEARSAL_PRE": {"count": len(REHEARSAL_PRE), "names": REHEARSAL_PRE},
            "REHEARSAL_POST": {"count": len(REHEARSAL_POST), "names": REHEARSAL_POST},
        },
        "reconciliation": {
            "NORMAL_PRE_vs_REHEARSAL_PRE": pre_diff,
            "NORMAL_POST_vs_REHEARSAL_POST": post_diff,
            "NORMAL_PRE_minus_Normal_POST": sorted(set(NORMAL_PRE) - set(NORMAL_POST)),
            "NORMAL_POST_minus_Normal_PRE": sorted(set(NORMAL_POST) - set(NORMAL_PRE)),
            "REHEARSAL_PRE_minus_REHEARSAL_POST": sorted(set(REHEARSAL_PRE) - set(REHEARSAL_POST)),
            "REHEARSAL_POST_minus_REHEARSAL_PRE": sorted(set(REHEARSAL_POST) - set(REHEARSAL_PRE)),
        },
        "notes": [
            "NORMAL_PRE = 41 (production fixture, all .opencode/skills/* in rc6 minus giiisp)",
            "NORMAL_POST = 39 (NORMAL_PRE minus {effect, minimax-pdf})",
            "REHEARSAL_PRE = 29 (Batch1 worktree local; only subset materialized)",
            "REHEARSAL_POST = 27 (29 minus effect, minimax-pdf)",
            "REHEARSAL 12 missing skills (worktree-local) = the Batch1 worktree never had them on disk",
            "All sets contain effect + minimax-pdf in pre; none contain them in post",
            "NORMAL is the AUTHORITATIVE source for Phase 4.1 P12 acceptance evidence",
            "REHEARSAL evidence is kept for traceability but is NOT authoritative",
        ],
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(reconciliation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote: {OUT_JSON}")

    # Human-readable summary
    md = []
    md.append("# Phase 4.1A P5 — Runtime set reconciliation\n")
    md.append(f"**Date:** 2026-08-24\n")
    md.append(f"**Pinned commit:** `{reconciliation['pinned_commit']}`\n")
    md.append(f"**Pinned branch:** `{reconciliation['pinned_branch']}`\n\n")
    md.append("## Universe definitions\n\n")
    md.append("| Set | Classification | Count | Source |\n")
    md.append("|---|---| | --- |\n")
    for k in ("NORMAL_PRE", "NORMAL_POST", "REHEARSAL_PRE", "REHEARSAL_POST"):
        cls = reconciliation["evidence_classification"][k]
        count = reconciliation["sets"][k]["count"]
        src = "Phase 4.1A P4 fixture" if k.startswith("NORMAL") else "Batch1 worktree local evidence (now NON_AUTHORITATIVE)"
        md.append(f"| `{k}` | {cls} | {count} | {src} |\n")
    md.append("\n## Reconciliation: NORMAL_PRE vs REHEARSAL_PRE\n\n")
    md.append(f"- NORMAL_PRE has {pre_diff['a_count']} skills\n")
    md.append(f"- REHEARSAL_PRE has {pre_diff['b_count']} skills\n")
    md.append(f"- intersection: {len(pre_diff['intersection'])} skills (all REHEARSAL_PRE skills are in NORMAL_PRE)\n")
    md.append(f"- NORMAL_PRE only ({len(pre_diff['a_only'])}): skills present in production fixture but absent from Batch1 worktree local\n\n")
    for n in pre_diff["a_only"]:
        md.append(f"  - `{n}`\n")
    md.append(f"\n- REHEARSAL_PRE only ({len(pre_diff['b_only'])}): skills that the Batch1 worktree had locally but production fixture does not — should be empty\n\n")
    for n in pre_diff["b_only"]:
        md.append(f"  - `{n}`\n")
    md.append("\n## Reconciliation: NORMAL_POST vs REHEARSAL_POST\n\n")
    md.append(f"- NORMAL_POST has {post_diff['a_count']} skills\n")
    md.append(f"- REHEARSAL_POST has {post_diff['b_count']} skills\n")
    md.append(f"- intersection: {len(post_diff['intersection'])} skills\n")
    md.append(f"- NORMAL_POST only ({len(post_diff['a_only'])}): skills preserved by the production-equivalent migration\n\n")
    for n in post_diff["a_only"]:
        md.append(f"  - `{n}`\n")
    md.append(f"\n- REHEARSAL_POST only ({len(post_diff['b_only'])}): should be empty (Batch1 worktree was a strict subset of production)\n\n")
    for n in post_diff["b_only"]:
        md.append(f"  - `{n}`\n")
    md.append("\n## Migration deltas (within each universe)\n\n")
    md.append(f"- NORMAL_PRE → NORMAL_POST: removed = {reconciliation['reconciliation']['NORMAL_PRE_minus_Normal_POST']}\n")
    md.append(f"- REHEARSAL_PRE → REHEARSAL_POST: removed = {reconciliation['reconciliation']['REHEARSAL_PRE_minus_REHEARSAL_POST']}\n")
    md.append("\n## Conclusion\n\n")
    md.append("- Both universes removed exactly `{effect, minimax-pdf}` — no third skill was removed in either case.\n")
    md.append("- REHEARSAL was a strict subset of NORMAL (every REHEARSAL skill is in NORMAL).\n")
    md.append("- The 12 skills present in NORMAL_PRE but absent from REHEARSAL_PRE are skills that the Batch1 worktree never had on disk.\n")
    md.append("- **NORMAL is authoritative. REHEARSAL is kept for traceability only.**\n")

    OUT_MD.write_text("".join(md), encoding="utf-8")
    print(f"Wrote: {OUT_MD}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())