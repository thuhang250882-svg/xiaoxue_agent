/**
 * Phase 4.1A — Production-equivalent Skill asset snapshot fixture.
 *
 * Builds a tmp configDir whose `.opencode/skills/` contains SKILL.md for every
 * Skill discoverable in rc6-business-skills@747dd6877e (Phase 4.1A pinned source),
 * excluding `giiisp-paper-search-apis` which was already migrated in Phase 4.0.
 *
 * Replaces the 29-skill worktree-local snapshot used in the original Batch1
 * evidence (now classified as `NON_AUTHORITATIVE_PARTIAL_WORKTREE_REHEARSAL`).
 *
 * ## Why 41 skills (not 79 or 86)?
 *
 * - 42 is the canonical count of `.opencode/skills/` directories in
 *   `rc6-business-skills@747dd6877e` (Phase 4.1A pinned source).
 * - `giiisp-paper-search-apis` was already migrated in Phase 4.0; it is NOT
 *   part of the pre-Batch1 baseline runtime set, so it is excluded.
 * - 41 = 42 - 1.
 * - The 79- and 86-counts from earlier snapshots included skills from URL pulls,
 *   `~/.claude/`, `~/.agents/` which are out of scope for `SkillMigration`
 *   (it only operates on `.opencode/skills/`).
 *
 * ## Use
 *
 * ```ts
 * import { materializeProductionFixture, loadProductionSkillNames } from "./fixtures/production-skill-fixture"
 *
 * const configDir = await makeTmpDir()
 * const materialized = await materializeProductionFixture(configDir, worktreeRoot)
 * // materialized.length === 41
 * ```
 */

import { execFileSync, execSync } from "node:child_process"
import * as fsSync from "node:fs"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { ENTRIES } from "../../../src/skill/migration/registry"
import type { MigrationEntry } from "../../../src/skill/migration/types"

/** Phase 4.1A pinned historical source. */
export const PRODUCTION_PINNED_COMMIT = "747dd6877ea36d1627e601e7c507f6278ba77b20"

/** Branch alias for the pinned commit. */
export const PRODUCTION_BRANCH = "rc6-business-skills"

/** Path to the JSON fixture (sibling of this module). */
const FIXTURE_PATH = path.join(__dirname, "production-skill-names.json")

/** giiisp was already migrated in Phase 4.0 — not part of pre-Batch1 baseline. */
const PRE_MIGRATED_EXCLUSIONS = ["giiisp-paper-search-apis"]

/**
 * Load the production skill name list from the JSON fixture.
 * Returns 41 skill names (all rc6 .opencode/skills/* minus giiisp).
 */
export async function loadProductionSkillNames(): Promise<string[]> {
  const text = await fs.readFile(FIXTURE_PATH, "utf-8")
  const parsed = JSON.parse(text) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error(`Phase 4.1A production fixture must be a JSON array, got ${typeof parsed}`)
  }
  return parsed.filter((s): s is string => typeof s === "string" && s.length > 0)
}

/**
 * Resolve the absolute path of the git worktree the test runner is executing from.
 * `bun test` runs with cwd = `packages/opencode`, which is inside a worktree.
 */
export function worktreeRoot(): string {
  return execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim()
}

/**
 * Validate a skill name from the JSON fixture. Skill names from the pinned
 * rc6-business-skills branch are well-known and trusted, but we still reject
 * anything that could escape the git ref parsing.
 */
function assertSafeSkillName(skillName: string): void {
  if (skillName.length === 0) throw new Error("Empty skill name")
  if (skillName.includes(":")) throw new Error(`Invalid skill name: contains ':' (${skillName})`)
  if (skillName.includes("\n") || skillName.includes("\r")) {
    throw new Error("Invalid skill name: contains newline")
  }
  if (skillName.startsWith("/") || skillName.endsWith("/")) {
    throw new Error("Invalid skill name: leading/trailing slash")
  }
  if (skillName.includes("..")) throw new Error(`Invalid skill name: contains '..' (${skillName})`)
}

/**
 * Validate a relative file path from the registry's `expectedFingerprint`.
 * The fingerprint is committed alongside the migration code, but we still
 * validate to prevent a poisoned registry from escaping the git ref.
 */
function assertSafeRelPath(relPath: string): void {
  if (relPath.length === 0) throw new Error("Empty relative path")
  if (relPath.includes(":")) throw new Error(`Invalid relative path: contains ':' (${relPath})`)
  if (relPath.includes("\n") || relPath.includes("\r")) {
    throw new Error("Invalid relative path: contains newline")
  }
  if (relPath.startsWith("/") || relPath.endsWith("/")) {
    throw new Error("Invalid relative path: leading/trailing slash")
  }
  if (relPath.includes("..")) {
    throw new Error(`Invalid relative path: contains '..' (${relPath})`)
  }
}

/**
 * Materialize a single skill's `SKILL.md` from the pinned commit into the
 * target configDir under `.opencode/skills/<name>/SKILL.md`.
 *
 * For migration targets, also materializes every file in `expectedFingerprint`
 * (e.g. `scripts/*.py`, `design/*.md`) so the on-disk fingerprint matches the
 * registry's expected manifest byte-for-byte and classification resolves to
 * `EXACT_KNOWN_LEGACY_ASSET`.
 */
export function materializeSkill(
  configDir: string,
  skillName: string,
  root: string,
  entry?: MigrationEntry,
): void {
  assertSafeSkillName(skillName)
  const skillDir = path.join(configDir, ".opencode", "skills", skillName)
  fsSync.mkdirSync(skillDir, { recursive: true })

  // Files to materialize. Start with SKILL.md, add everything from the
  // registry's expectedFingerprint if the skill is a migration target.
  const files = new Set<string>(["SKILL.md"])
  if (entry && entry.targetSkill === skillName) {
    for (const relPath of Object.keys(entry.expectedFingerprint)) {
      files.add(relPath)
    }
  }

  for (const relPath of files) {
    assertSafeRelPath(relPath)
    const gitPath = `.opencode/skills/${skillName}/${relPath}`
    // Use execFileSync with argv array — no shell, so the skillName and
    // relPath are treated as literal arguments and never re-parsed.
    const bytes = execFileSync(
      "git",
      ["-c", "core.quotepath=off", "show", `${PRODUCTION_PINNED_COMMIT}:${gitPath}`],
      { cwd: root, stdio: ["ignore", "pipe", "ignore"] },
    )
    const filePath = path.join(skillDir, relPath)
    fsSync.mkdirSync(path.dirname(filePath), { recursive: true })
    fsSync.writeFileSync(filePath, bytes)
  }
}

/**
 * Materialize the full production-equivalent Skill universe into the
 * target configDir. Returns the list of materialized skill names (always 41).
 *
 * Options:
 * - `exclude`: additional skill names to skip (defaults to PRE_MIGRATED_EXCLUSIONS).
 *
 * ## Side effects
 *
 * Writes `.opencode/skills/<name>/SKILL.md` for every name in the fixture.
 * For migration targets (`registry.ENTRIES[*].targetSkill`), also writes every
 * file in the registry's `expectedFingerprint` so the on-disk fingerprint
 * resolves to `EXACT_KNOWN_LEGACY_ASSET` and migration can proceed.
 */
export async function materializeProductionFixture(
  configDir: string,
  root: string = worktreeRoot(),
  options?: { exclude?: string[] },
): Promise<string[]> {
  const names = await loadProductionSkillNames()
  const exclude = new Set([...PRE_MIGRATED_EXCLUSIONS, ...(options?.exclude ?? [])])
  // Index entries by targetSkill so we can resolve `entry` cheaply
  const entryBySkill = new Map<string, MigrationEntry>()
  for (const entry of ENTRIES) entryBySkill.set(entry.targetSkill, entry)

  const materialized: string[] = []
  for (const name of names) {
    if (exclude.has(name)) continue
    const entry = entryBySkill.get(name)
    materializeSkill(configDir, name, root, entry)
    materialized.push(name)
  }
  return materialized
}
