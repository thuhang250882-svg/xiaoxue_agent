# DEPRECATED — mud-logging-review

This Skill has been consolidated into `geolog-logging-review` as of
Phase 3.0 (2026-08-23).

- canonical: `geolog-logging-review`
- former id: `mud-logging-review`
- previous location: `.opencode/skills/mud-logging-review/`
- current location: `.opencode/.archive/mud-logging-review/`

## Why archived

The two Skills were 100% content duplicates. Keeping both caused
LLM trigger ambiguity in the report sub-Agent and in the xiaoxue
main entry. Phase 3.0 promotes `geolog-logging-review` to be the
only user-callable Skill for 录井报告审核.

## Status

- Removed from xiaoxue main Agent allowlist (`agent.ts:213`)
- Removed from report sub-Agent allowlist (`agent.ts:392`)
- Removed from `.opencode/skills/` so it is no longer discovered
- The file body is preserved here as a migration reference only

## Recovery

If a legacy session re-executes the `mud-logging-review` Skill ID
through the runtime, it will now fail with a `Skill not found`
error. This is intentional: no persistence layer re-emits this ID
in the current codebase.

If a future operator needs to resurrect this Skill for some reason,
copy the SKILL.md back to `.opencode/skills/mud-logging-review/`,
re-add the two allowlist entries, and ship under a separate
migration record. Do not silently re-enable it.
