import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { ResourceIntegrityCore } from "./resource-integrity-core"
import type { Manifest } from "./resource-integrity-core"

// The committed resources/integrity.json must match the live filesystem
// under .opencode/skills and packages/desktop/resources/obsidian-plugin.
// Drift happens when skills are added/removed/renamed without re-running
// `bun packages/desktop/scripts/generate-resource-integrity.ts` (which is
// also hooked to prebuild/predev, but is skipped when only committing
// skill text edits outside the desktop build).
//
// The test reads the committed manifest and re-runs the same verify() the
// packaged app uses at startup; if the manifest is out of sync, verify()
// throws and the test fails with the same error string the runtime would
// surface. The error message directs the operator to the regenerate command.
//
// Generator-side file exclusion (see generate-resource-integrity.ts):
// the generator skips a small set of platform-noise files (`.DS_Store`,
// `Thumbs.db`, `desktop.ini`) that are also matched by `.gitignore`. The
// production verify() in resource-integrity-core.ts does not, because in
// a packaged install such files never reach the runtime tree (they are
// gitignored and never bundled). On a macOS dev checkout they can leak
// into the working tree, so the guard walks with the same ignore set as
// the generator to keep the invariant comparable to what the generator
// actually emits.
const IGNORED_NAMES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"])

// ImportMeta.dir is a Bun extension; fall back to a manual resolution
// when running outside Bun (the script is always invoked via `bun ...`).
const FILE_DIR = (() => {
  if (typeof (import.meta as unknown as { dir?: string }).dir === "string") {
    return (import.meta as unknown as { dir: string }).dir
  }
  return new URL(".", import.meta.url).pathname
})()
// src/main/x.test.ts → up two levels to reach packages/desktop
const PKG_DIR = path.resolve(FILE_DIR, "..", "..")
const REPO_ROOT = path.resolve(PKG_DIR, "..", "..")
const SKILLS_DIR = path.join(REPO_ROOT, ".opencode", "skills")
const OBSIDIAN_DIR = path.join(PKG_DIR, "resources", "obsidian-plugin")
const MANIFEST_PATH = path.join(PKG_DIR, "resources", "integrity.json")

function loadManifest(): Manifest {
  const raw = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as unknown
  if (!ResourceIntegrityCore.isManifest(raw)) {
    throw new Error(`manifest at ${MANIFEST_PATH} is not a valid ResourceIntegrityCore.Manifest`)
  }
  return raw
}

// Mirror generate-resource-integrity.ts walk semantics so the guard test
// compares against the same set of files the generator emits. Paths are
// always relative to the original `root` (the first `directory` passed
// in), so they line up with the slice produced by `expectedEntries`
// (which removes the `prefix/` from the manifest path).
function walkTracked(root: string, directory: string, manifest: Manifest, out: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (IGNORED_NAMES.has(entry.name)) continue
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      walkTracked(root, full, manifest, out)
    } else if (entry.isFile()) {
      out.push(path.relative(root, full).replaceAll("\\", "/"))
    }
  }
  return out
}

function expectedEntries(prefix: string, manifest: Manifest): string[] {
  return manifest.files
    .filter((file) => file.path.startsWith(`${prefix}/`))
    .map((file) => file.path.slice(prefix.length + 1))
    .sort()
}

function describeMissing(prefix: string, missing: string[], extra: string[]): string {
  const lines: string[] = [`${prefix} drift:`]
  for (const m of missing.slice(0, 5)) lines.push(`  missing from manifest: ${m}`)
  if (missing.length > 5) lines.push(`  ... (${missing.length - 5} more missing)`)
  for (const e of extra.slice(0, 5)) lines.push(`  extra in manifest (no longer on disk): ${e}`)
  if (extra.length > 5) lines.push(`  ... (${extra.length - 5} more extra)`)
  return lines.join("\n")
}

describe("bundled resource integrity sync", () => {
  test("committed manifest matches current .opencode/skills and obsidian-plugin trees", () => {
    const manifest = loadManifest()
    const errors: string[] = []
    for (const [prefix, directory] of [
      ["skills", SKILLS_DIR],
      ["obsidian-plugin", OBSIDIAN_DIR],
    ] as const) {
      try {
        ResourceIntegrityCore.verify(prefix, directory, manifest)
      } catch (error) {
        const actual = walkTracked(directory, directory, manifest).sort()
        const expected = expectedEntries(prefix, manifest)
        const missing = actual.filter((p) => !expected.includes(p))
        const extra = expected.filter((p) => !actual.includes(p))
        errors.push(
          `${describeMissing(prefix, missing, extra)}\n  underlying error: ${(error as Error).message}`,
        )
      }
    }
    expect(
      errors,
      "re-run `bun packages/desktop/scripts/generate-resource-integrity.ts` to refresh the manifest",
    ).toEqual([])
  })
})