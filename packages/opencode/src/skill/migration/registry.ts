import type { MigrationEntry } from "./types"

/**
 * Canonical migration registry.
 *
 * Each entry defines a skill that has been approved for removal through the
 * Phase 3.5F/4.0 approval flow. New entries MUST have a corresponding record
 * in `docs/skill-center/phase4.0-removal-registry-*.tsv`.
 *
 * IMPORTANT: The fingerprint must be computed from the historical source branch
 * using `git show <branch>:<path>` + SHA-256. Never guess or approximate.
 */
const MIGRATIONS: readonly MigrationEntry[] = [
  {
    migrationId: "rm-giiisp-paper-search-apis-2026-08-23",
    targetSkill: "giiisp-paper-search-apis",
    targetRelativePath: ".opencode/skills/giiisp-paper-search-apis",
    introducedIn: "Phase 4.0",
    action: "backup_and_remove",
    backupPolicy: "restore_on_rollback",
    reason:
      "Giiisp private API wrapper superseded by deep-research (NEAR_COMPLETE overlap); " +
      "no production consumers; low platform value (LOW); recovery cost MEDIUM. " +
      "Approved in Phase 3.5F REMOVE_WITH_APPROVAL decision.",
    historicalSource: "rc6-business-skills branch",
    expectedFingerprint: {
      "SKILL.md": "75d1cfd834c1631a164d359d7eef5ee0d29322389ffd3ecfa8f05736b6e7b30e",
      "ACCEPTANCE.md": "e4844205bf2f3f607e46ab0fad1ccd31c8fd0ff4624780ed6577138ac6ebf827",
      "agents/openai.yaml": "ba1c53fe9b83278c72fdb0c28fc14f28a6db1ef0de4f233b0dff789853c52c4c",
      "examples/end_to_end_example.json": "da74cd3a60b96c264b82a8a82edc04146f83e62b5e7abc4615818c0f735f5aed",
      "examples/failure_response_examples.json": "05f502e8c255d3af3b35bd2f8b2f958a8e28fc901d73b31b91ee486e0d64dfcb",
      "examples/normalized_result_example.json": "bf44f92031be38d29344343405bf70ec3f5e69a2007d1f52f9655951071a2e00",
      "examples/request_matrix.json": "d0a556fbac50e76acd62a304726f57f9d20927e18003f6de183b2ff4621a3d1a",
      "scripts/dry_run_paper_search.py": "d0fa38a95414f46cc3089cfd4fa3533a976dcccf9e8ccec3544f32f347c63ecd",
      "scripts/progressive_paper_search.py": "c31e8389c9e80414ba493dd5164778c960df18763cb8e8f8851df67524301756",
      "tests/test_dry_run_paper_search.py": "69399f095cbbee6daa67e4a602153149867b45fdd0bb362b5fe1f2fe3d09b7f0",
      "tests/test_progressive_paper_search.py": "22114da82eaf07039d69c10c2e5f252f8a4b74ae4d13353edc58c86046435fbb",
    },
  },
]

/** All registered migrations. */
export const ENTRIES: readonly MigrationEntry[] = MIGRATIONS

/** Look up a migration by ID. Returns undefined if not found. */
export function findById(migrationId: string): MigrationEntry | undefined {
  return MIGRATIONS.find((e) => e.migrationId === migrationId)
}

/** All registered migration IDs. */
export function allIds(): string[] {
  return MIGRATIONS.map((e) => e.migrationId)
}
