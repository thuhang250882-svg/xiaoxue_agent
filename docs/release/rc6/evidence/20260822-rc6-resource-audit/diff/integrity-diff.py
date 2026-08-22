#!/usr/bin/env python3
"""Semantic diff between committed and generated integrity.json.

Categorize differences:
  added     : in generated but not committed
  removed   : in committed but not generated
  changed   : in both but SHA-256 differs
  metadata  : only JSON formatting / ordering / newline differences
"""
import hashlib
import json
import sys
from pathlib import Path


def load(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        raw = f.read()
    return {
        "raw": raw,
        "sha256": hashlib.sha256(raw.encode("utf-8")).hexdigest(),
        "data": json.loads(raw),
    }


def index(data: dict) -> dict:
    return {entry["path"]: entry["sha256"] for entry in data["files"]}


def main(committed: str, generated: str) -> int:
    c = load(committed)
    g = load(generated)

    print(f"committed: SHA256={c['sha256']} entries={len(c['data']['files'])}")
    print(f"generated: SHA256={g['sha256']} entries={len(g['data']['files'])}")

    ci = index(c["data"])
    gi = index(g["data"])

    cpaths = set(ci.keys())
    gpaths = set(gi.keys())

    added = sorted(gpaths - cpaths)
    removed = sorted(cpaths - gpaths)
    common = cpaths & gpaths
    changed = sorted(p for p in common if ci[p] != gi[p])
    same = sorted(p for p in common if ci[p] == gi[p])

    print(f"\n=== Semantic diff ===")
    print(f"  added paths   : {len(added)}")
    print(f"  removed paths : {len(removed)}")
    print(f"  changed hashes: {len(changed)}")
    print(f"  unchanged     : {len(same)}")

    if added:
        print(f"\n  --- ADDED (in generated, not in committed) ---")
        for p in added[:50]:
            print(f"    + {p}  sha256={gi[p][:16]}...")
        if len(added) > 50:
            print(f"    ... and {len(added) - 50} more")

    if removed:
        print(f"\n  --- REMOVED (in committed, not in generated) ---")
        for p in removed[:50]:
            print(f"    - {p}  sha256={ci[p][:16]}...")
        if len(removed) > 50:
            print(f"    ... and {len(removed) - 50} more")

    if changed:
        print(f"\n  --- CHANGED (sha256 differs) ---")
        for p in changed[:50]:
            print(f"    ~ {p}")
            print(f"        committed={ci[p][:32]}...")
            print(f"        generated={gi[p][:32]}...")
        if len(changed) > 50:
            print(f"    ... and {len(changed) - 50} more")

    # Metadata-only difference: same entries, same hashes, different JSON serialization
    if not added and not removed and not changed:
        print(f"\n  No semantic diff — only metadata (formatting / ordering / newline) differs")
        print(f"    committed size = {len(c['raw'])} bytes")
        print(f"    generated size = {len(g['raw'])} bytes")
        # Detect newline
        if c["raw"].endswith("\n") and not g["raw"].endswith("\n"):
            print(f"    committed ends with newline; generated does not")
        elif g["raw"].endswith("\n") and not c["raw"].endswith("\n"):
            print(f"    generated ends with newline; committed does not")
        # JSON sort order check
        c_files_order = [e["path"] for e in c["data"]["files"]]
        g_files_order = [e["path"] for e in g["data"]["files"]]
        if c_files_order != g_files_order:
            print(f"    file entry order differs")
        else:
            print(f"    file entry order identical")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: integrity-diff.py <committed.json> <generated.json>")
        sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2]))