import { mkdirSync, readdirSync, rmSync } from "node:fs"
import { join } from "node:path"

/**
 * Synchronise the writable managed skills directory with bundled presets.
 *
 * 1. Remove bundled-skill mirrors that were accidentally copied into the user
 *    directory (legacy duplication).
 * 2. Clean up orphaned SKILL.md files that sit directly inside the managed
 *    root instead of a sub-folder — they are not discoverable by the skill
 *    scanner and cause confusion.
 */
export function syncManagedSkills(bundled: string, directory: string) {
  mkdirSync(directory, { recursive: true })

  // Remove folders whose names match bundled presets to prevent duplicates.
  readdirSync(bundled, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .forEach((entry) => rmSync(join(directory, entry.name), { recursive: true, force: true }))

  // Remove orphaned SKILL.md files sitting directly in the managed root.
  readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toUpperCase() === "SKILL.MD")
    .forEach((entry) => rmSync(join(directory, entry.name), { force: true }))
}

// Keep the old export name as an alias so existing callers don't break.
export const removeBundledSkillDuplicates = syncManagedSkills
