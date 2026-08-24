"""Phase 4.1A P4 — Enumerate production-equivalent Skill set from rc6-business-skills.

Output to .db-rehearsal/phase4.1A-production-skill-names.json as a JSON array of
strings (one per skill dir under .opencode/skills/ on rc6-business-skills@747dd6877e).
"""

import json
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT = REPO_ROOT / ".db-rehearsal" / "phase4.1A-production-skill-names.json"
PINNED_COMMIT = "747dd6877ea36d1627e601e7c507f6278ba77b20"

# Use core.quotepath=off to get raw UTF-8 (git on Windows otherwise emits C-style
# octal escapes for non-ASCII paths).
out = subprocess.run(
    ["git", "-c", "core.quotepath=off", "ls-tree", "-d", "--name-only", "rc6-business-skills", "--", ".opencode/skills/"],
    capture_output=True,
).stdout.decode("utf-8")

# Top-level dirs
all_dirs = sorted({s.strip() for s in out.split("\n") if s.strip()})

# Verify each dir actually has a SKILL.md
verified = []
for d in all_dirs:
    skill_path = f"{d}/SKILL.md"
    show = subprocess.run(
        ["git", "-c", "core.quotepath=off", "cat-file", "-e", f"rc6-business-skills:{skill_path}"],
        capture_output=True,
    )
    if show.returncode == 0:
        # Extract skill name (last path segment)
        name = d.split("/")[-1]
        verified.append(name)

# Drop giiisp — already migrated in Phase 4.0; not part of Batch1 production state
target_set = [s for s in verified if s != "giiisp-paper-search-apis"]

print(f"Pinned commit: {PINNED_COMMIT}")
print(f"Total .opencode/skills dirs in rc6: {len(all_dirs)}")
print(f"Dirs with SKILL.md: {len(verified)}")
print(f"After dropping already-migrated giiisp: {len(target_set)}")
print()

# Write JSON array
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(target_set, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Wrote: {OUTPUT}")

# Show first few names
print()
print("First 10 names:")
for n in target_set[:10]:
    print(f"  {n}")