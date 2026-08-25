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
  {
    migrationId: "rm-minimax-pdf-2026-08-24",
    targetSkill: "minimax-pdf",
    targetRelativePath: ".opencode/skills/minimax-pdf",
    introducedIn: "Phase 4.1 Batch 1",
    action: "backup_and_remove",
    backupPolicy: "restore_on_rollback",
    reason:
      "Design-system PDF creation is outside the core product and has no production consumers or router references. " +
      "The retained pdfkit-py and minimax-docx skills cover the required PDF and document paths.",
    historicalSource: "rc6-business-skills@747dd6877e and rc6 source baseline@1ec9ebb3c9",
    expectedFingerprint: {
      "README.md": "ab7f0ee3ec300c87dee6f652b9bf96003ddd552c23a6c210ae1bb22cdd48396d",
      "SKILL.md": "8b0497ddd27da142deb09b570a56f702f95e5f3f1e192cfe1ae24421416a408d",
      "design/design.md": "870932013e86371697d88406273f8796830270a9171ac8065b13078acef6ffe2",
      "scripts/cover.py": "ad6c6b927805c8d189869cd309e260e7a82a75cb809c92d4ca0627de4a724cfa",
      "scripts/fill_inspect.py": "f048e44f5cc094c18790c4e8ff194d3ff6fe4018fa63bed148dd9730fff83467",
      "scripts/fill_write.py": "afece596da883cc3bdfe112b9e46798b313312d93a05037b1bc5c3359502f993",
      "scripts/make.sh": "c4f5c5a88be4b69f186f3712a357631dbf91be7233942e16144a864a914e25fb",
      "scripts/merge.py": "4e194d8fe6a85a6d1981011c6f495be9a2c25c71bac5446c5386f0c3fb3e5660",
      "scripts/palette.py": "520a55d4c3134a074fcfa24f1dab6369f489ca0a24b546f283064c3db17e86c1",
      "scripts/reformat_parse.py": "1b5618ae2a423e9c0abb8eb7e1bf3c41d97ef24353b4a886432052170942f974",
      "scripts/render_body.py": "7cdd0ad4cfd845eefabf641c41265c934639f4a43be2290b25c5e23313667c7e",
      "scripts/render_cover.js": "5511c5b72d1e95e5fd8dc424c360d7ccd16fb70bc15235db327c1317cb875ba7",
    },
    acceptedFingerprints: [
      {
        "README.md": "ede0e350793746ccbf4f8259a53bf0e260dc98206554732020872e527c64bffe",
        "SKILL.md": "eabb206b6304cce87875d4063de19f60af2861bad1d36a58cfa16c5d1e71754b",
        "design/design.md": "991bb333d3c41ab22116b40dada3ba0ece7e9fafd323018b342d6afcf09178c6",
        "scripts/cover.py": "351c7a3a92edc889de3906b56b0d4c931d7413e62620dab56e457cc41b80013b",
        "scripts/fill_inspect.py": "109ccb71c636cc8085cf4cabd4ea185396079711bb8b8668c9e4c4cb8bb6419c",
        "scripts/fill_write.py": "2f23e28283fbdf255491b519bcae4f48ef4717220ec0f1a69536834e8cf5256f",
        "scripts/make.sh": "919638903852cefc6872f40e13bcbf156c59ecbfa9a604211e59836a6155dcf0",
        "scripts/merge.py": "b3d3084c356a9dcb2495d90ae35607614b5c7b28b468928b4a3c2a8e8b332ef0",
        "scripts/palette.py": "031fcec71677e31f941663845055689b1f6809c4ac367448b8757b7ba7fcc1b5",
        "scripts/reformat_parse.py": "b07fcebefe83cfcff4e1d871a5ea94f3cc7f4f8510d8da0da3c5b1ae65efa292",
        "scripts/render_body.py": "2532a4fdd1d85c36236e37ef2b0c86be04d6c3ec959940141ac963c7d4575a13",
        "scripts/render_cover.js": "d4617a4df01ea2d37ce76a94b6c46b32e8d8b2624ebb14bd5c6de88769f9fa85",
      },
    ],
  },
  {
    migrationId: "rm-effect-2026-08-24",
    targetSkill: "effect",
    targetRelativePath: ".opencode/skills/effect",
    introducedIn: "Phase 4.1 Batch 1",
    action: "backup_and_remove",
    backupPolicy: "restore_on_rollback",
    reason:
      "Generic Effect documentation guide with no router or agent reference; project references remain under .opencode/references/effect-smol.",
    historicalSource: "rc6-business-skills@747dd6877e",
    expectedFingerprint: {
      "SKILL.md": "0d27f8d40455cd4d509c0c81f3d2b6edb8319cd8ebd12a2e9f21626fc80495d5",
    },
  },
  {
    migrationId: "rm-sci-employee-deep-research-2026-08-25",
    targetSkill: "sci-employee-deep-research",
    targetRelativePath: ".opencode/skills/sci-employee-deep-research",
    introducedIn: "Phase 4.1 Batch 2",
    action: "backup_and_remove",
    backupPolicy: "restore_on_rollback",
    reason:
      "Single-backend research client superseded by deep-research with no Xiaoxue router, agent, or config dependency.",
    historicalSource: "rc6-business-skills@747dd6877e and rc6 source baseline@1ec9ebb3c9",
    expectedFingerprint: {
      "SKILL.md": "d88c207a18f70fca84f72c96a74720e04edb3745da2bf93277b9307f757e5a92",
      "scripts/parse_deep_research_sse.py": "c14132e09d216a165006f698e28b7e7884dc0389ac66593fdf642ae3922f9e00",
      "scripts/stream_deep_research.py": "23a9d823329f46bb7fea19b34d5b7c818095f2f0b997b8384c3cbe4a15db979d",
      "tests/test_stream_deep_research.py": "f960fc382545b600d6df98b6f439bc5995c4f9b1b0d17b2db4631f08dae1f879",
    },
    acceptedFingerprints: [
      {
        "SKILL.md": "a6473c4d91d492425ff5599c662e4897519692eed54658f95b9bbc5d4bd0693e",
        "scripts/parse_deep_research_sse.py": "abb6bbd2669a9bdabd5d3e108132ae19fd8ec49177b01d9f60ba4d8dd0cc05f9",
        "scripts/stream_deep_research.py": "88ebf9fc8a85dab3e9ea054db45b30c85555a07c120bb482ff5afe8fa4e65148",
        "tests/test_stream_deep_research.py": "88cb0d2f0616bc18cd5aa65dfc00c4fe4069764e84471d120597171c9fad4e89",
      },
    ],
  },
  {
    migrationId: "merge-long-document-writing-2026-08-25",
    targetSkill: "long-document-writing",
    targetRelativePath: ".opencode/skills/long-document-writing",
    introducedIn: "Office consolidation",
    action: "backup_and_remove",
    backupPolicy: "restore_on_rollback",
    reason:
      "Chapter planning, continuation, context retention, and quality gates were copied byte-for-byte into office-assistant references.",
    historicalSource: "migration-hardening@6562153a52 plus authoritative pre-merge worktree snapshot",
    expectedFingerprint: {
      "SKILL.md": "fd2f276769fe1bbb11d0a638eaf670cb0e16f25f5627260a021a7b52ca322e21",
      "references/skill-summary.md": "8546e61eb7363cae2d10ef4a39e50088aaa5d1eefd5607e5c92767994d2ec857",
    },
  },
  {
    migrationId: "merge-meeting-minutes-manager-2026-08-25",
    targetSkill: "meeting-minutes-manager",
    targetRelativePath: ".opencode/skills/meeting-minutes-manager",
    introducedIn: "Office consolidation",
    action: "backup_and_remove",
    backupPolicy: "restore_on_rollback",
    reason:
      "Transcription flow, petroleum meeting templates, decision tracking, and action extraction were copied byte-for-byte into office-assistant references.",
    historicalSource: "authoritative pre-merge worktree snapshot captured 2026-08-25",
    expectedFingerprint: {
      "SKILL.md": "39254407cde770052c4e10825e3597c86ce1e8b0eb8bb697ae6e40ec714c5952",
      "references/minutes-templates.md": "33569a339d3aa7686796e431c997a21a139c73da35cf83660a5ae99ebb6fc49c",
    },
  },
  {
    migrationId: "merge-humanizer-2026-08-25",
    targetSkill: "humanizer",
    targetRelativePath: ".opencode/skills/humanizer",
    introducedIn: "Office consolidation",
    action: "backup_and_remove",
    backupPolicy: "restore_on_rollback",
    reason:
      "The full AI-writing-pattern knowledge base and source README were copied byte-for-byte into office-assistant references.",
    historicalSource: "authoritative pre-merge worktree snapshot captured 2026-08-25",
    expectedFingerprint: {
      "SKILL.md": "5a8db805a8728a4894a8e525fdb43cff8886470e7b498df59967f9af2a9a7aa8",
      "README.md": "4f3f9414dc2b7605dc551a180fe9cd2de140f43373064d07ba87b5eceeba7fb8",
      "_skillhub_meta.json": "08a2650be89b548b4dedc3934501dcc1f96f1f091fd2e93131c7101ff17eb626",
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
