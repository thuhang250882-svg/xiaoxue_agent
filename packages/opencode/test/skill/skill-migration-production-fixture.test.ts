/**
 * Phase 4.1A — Production-equivalent Skill asset snapshot fixture test.
 *
 * Validates that the Phase 4.0 migration framework operates correctly against
 * a production-equivalent skill universe (41 skills pinned to
 * `rc6-business-skills@747dd6877e`), not just the 2-target or 29-skill
 * worktree-local states.
 *
 * ## Test plan
 *
 * 1. Materialize the 41-skill fixture.
 * 2. Confirm `runtime_directory_skill_count == 41`, both Batch1 targets
 *    (`effect`, `minimax-pdf`) are present pre-migration.
 * 3. Run `runPending` against the fixture.
 * 4. Confirm ONLY the targets whose `targetSkill` is in the fixture were
 *    removed; everything else is preserved byte-for-byte.
 * 5. Confirm removed_names ⊆ [effect, minimax-pdf] (no third skill can
 *    disappear — the migration framework must not touch any other skill).
 *
 * ## Worktree-aware behavior
 *
 * - In the **main worktree** (`migration-hardening`): registry has only
 *   `rm-giiisp-paper-search-apis-2026-08-23` (giiisp target is NOT in
 *   the fixture by design). Result: pre == post == 41.
 * - In the **Batch1 worktree** (`archive-batch1`): registry has giiisp +
 *   Batch1 entries. Result: pre == 41, post == 39 (effect + minimax-pdf
 *   removed).
 */

import { describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { ENTRIES } from "../../src/skill/migration/registry"
import { runPending } from "../../src/skill/migration/engine"
import {
  PRODUCTION_BRANCH,
  PRODUCTION_PINNED_COMMIT,
  loadProductionSkillNames,
  materializeProductionFixture,
  worktreeRoot,
} from "./fixtures/production-skill-fixture"

const ROOT = worktreeRoot()

async function makeTmpDir(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), "skill-prod-fixture-"))
}

async function listSkillDirs(configDir: string): Promise<string[]> {
  const skillsDir = path.join(configDir, ".opencode", "skills")
  const entries = await fs.readdir(skillsDir).catch(() => [] as string[])
  return entries.filter((e) => !e.startsWith(".")).sort()
}

describe("Phase 4.1A P4 — production-equivalent Skill fixture", () => {
  test("fixture metadata: pinned commit, branch, and shape are correct", async () => {
    expect(PRODUCTION_PINNED_COMMIT).toBe("747dd6877ea36d1627e601e7c507f6278ba77b20")
    expect(PRODUCTION_BRANCH).toBe("rc6-business-skills")

    const names = await loadProductionSkillNames()
    // 42 .opencode/skills dirs in rc6 minus 1 (giiisp already migrated in 4.0)
    expect(names.length).toBe(41)
    // Both Batch1 targets must be in the production baseline
    expect(names).toContain("effect")
    expect(names).toContain("minimax-pdf")
    // giiisp must NOT be in the production baseline (already migrated)
    expect(names).not.toContain("giiisp-paper-search-apis")
  })

  test("materialize: 41 skills produced, both Batch1 targets present, no duplicates", async () => {
    const configDir = await makeTmpDir()
    try {
      const materialized = await materializeProductionFixture(configDir, ROOT)

      expect(materialized.length).toBe(41)
      expect(new Set(materialized).size).toBe(41) // no duplicates

      // Both targets present
      expect(materialized).toContain("effect")
      expect(materialized).toContain("minimax-pdf")

      // Each materialization wrote a non-empty SKILL.md
      for (const name of materialized) {
        const skillPath = path.join(configDir, ".opencode", "skills", name, "SKILL.md")
        const stat = await fs.stat(skillPath)
        expect(stat.size).toBeGreaterThan(0)
      }

      // Disk listing matches the materialized list
      const onDisk = await listSkillDirs(configDir)
      expect(onDisk).toEqual([...materialized].sort())
    } finally {
      await fs.rm(configDir, { recursive: true, force: true })
    }
  })

  test("isolation: migration against 41-skill fixture removes ONLY registry targets present in fixture, never a third skill", async () => {
    const configDir = await makeTmpDir()
    try {
      await materializeProductionFixture(configDir, ROOT)
      const pre = await listSkillDirs(configDir)
      expect(pre.length).toBe(41)

      // Determine which registry targets are actually present in the fixture
      const presentTargetSkills = ENTRIES
        .map((e) => e.targetSkill)
        .filter((name) => pre.includes(name))
      const absentTargetSkills = ENTRIES
        .map((e) => e.targetSkill)
        .filter((name) => !pre.includes(name))

      // Run migration
      const results = runPending([configDir])

      // A present target is removed only when its bytes match a registered
      // fingerprint. Historical variants that are not registered must remain.
      for (const target of presentTargetSkills) {
        const entry = ENTRIES.find((e) => e.targetSkill === target)!
        const r = results.find((x) => x.migrationId === entry.migrationId)!
        if (r.directoryClassification === "EXACT_KNOWN_LEGACY_ASSET") {
          expect(r.status).toBe("completed")
          continue
        }
        expect(["skipped_modified", "skipped_unknown"]).toContain(r.status)
      }

      // Each absent-target migration must complete as ABSENT (no-op)
      for (const target of absentTargetSkills) {
        const entry = ENTRIES.find((e) => e.targetSkill === target)!
        const r = results.find((x) => x.migrationId === entry.migrationId)!
        expect(r.status).toBe("completed")
        expect(r.directoryClassification).toBe("ABSENT")
      }

      const expectedRemoved = results
        .filter((r) => r.status === "completed" && r.directoryClassification === "EXACT_KNOWN_LEGACY_ASSET")
        .map((r) => ENTRIES.find((entry) => entry.migrationId === r.migrationId)!.targetSkill)
        .filter((name) => pre.includes(name))
        .sort()

      // Post-migration disk count
      const post = await listSkillDirs(configDir)
      expect(post.length).toBe(41 - expectedRemoved.length)

      // removed_names (relative to fixture) MUST equal presentTargetSkills only
      const removed = pre.filter((n) => !post.includes(n)).sort()
      expect(removed).toEqual(expectedRemoved)

      // added_names MUST be empty (migration never adds skills)
      const added = post.filter((n) => !pre.includes(n))
      expect(added).toEqual([])

      // All preserved skills must still have a non-empty SKILL.md
      for (const name of post) {
        const skillPath = path.join(configDir, ".opencode", "skills", name, "SKILL.md")
        const stat = await fs.stat(skillPath)
        expect(stat.size).toBeGreaterThan(0)
      }
    } finally {
      await fs.rm(configDir, { recursive: true, force: true })
    }
  })

  test(
    "isolation: every preserved skill's SKILL.md is byte-identical to the pinned commit",
    async () => {
      const configDir = await makeTmpDir()
      try {
        await materializeProductionFixture(configDir, ROOT)
        const pre = await listSkillDirs(configDir)

        const results = runPending([configDir])

        const post = await listSkillDirs(configDir)
        const removedCount = results.filter(
          (r) =>
            r.status === "completed" &&
            r.directoryClassification === "EXACT_KNOWN_LEGACY_ASSET" &&
            pre.includes(ENTRIES.find((entry) => entry.migrationId === r.migrationId)!.targetSkill),
        ).length
        expect(post.length).toBe(pre.length - removedCount)

        // For every preserved skill, SHA-256 of the SKILL.md on disk must match
        // the SHA-256 of `git show <pinned commit>:.opencode/skills/<name>/SKILL.md`.
        // (The P2 verifier proves the same thing for the migrated targets;
        // here we prove it for the 39 preserved skills.)
        const { execFileSync } = await import("node:child_process")
        const { createHash } = await import("node:crypto")

        for (const name of post) {
          const onDisk = await fs.readFile(
            path.join(configDir, ".opencode", "skills", name, "SKILL.md"),
          )
          const onDiskSha = createHash("sha256").update(onDisk).digest("hex")

          const pinnedBytes = execFileSync(
            "git",
            [
              "-c",
              "core.quotepath=off",
              "show",
              `${PRODUCTION_PINNED_COMMIT}:.opencode/skills/${name}/SKILL.md`,
            ],
            { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] },
          )
          const pinnedSha = createHash("sha256").update(pinnedBytes).digest("hex")

          expect(onDiskSha).toBe(pinnedSha)
        }
      } finally {
        await fs.rm(configDir, { recursive: true, force: true })
      }
    },
    30000,
  )
})
