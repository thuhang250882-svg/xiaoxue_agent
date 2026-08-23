#!/usr/bin/env bun
/**
 * Skill Portfolio Counting Model — version-controlled, recomputable.
 *
 * Phase 3.0A introduced this model and ran it from `.tmp/`. Phase 3.1
 * formalises it as `script/skill-counting-model.ts` so the same numbers
 * are produced by a single, reviewable, runnable source. The output is
 * consumed by the Phase 3.1 report (before/after counting), the audit
 * checks under `docs/skill-center/`, and the integrity test footer.
 *
 * All numbers below are recomputed from primary sources (filesystem +
 * config files). No manual numbers. Definitions:
 *
 *   repository_skill_md           every SKILL.md under .opencode/skills (recursive)
 *   repository_skill_md_top_level top-level skill dirs with a direct SKILL.md
 *   nested_skill_md               recursive minus top-level
 *   runtime_glob_matches          exact runtime discovery glob reproduction
 *                                 (npm glob pattern brace skill comma skills brace
 *                                 recursive-wildcard slash SKILL.md, cwd=.opencode,
 *                                 dot=false, nodir=true), see
 *                                 packages/opencode/src/skill/index.ts
 *   runtime_distinct_names        distinct frontmatter names in the runtime set
 *   integrity_test_discovery      top-level-only discovery used by
 *                                 reference-integrity.test.ts (+ builtin)
 *   builtin_skills                skills registered without a SKILL.md
 *   archived_skill_md             SKILL.md under .opencode/.archive (never discovered)
 *   configured_only_nodes         referenced ids with no physical SKILL.md
 *                                 (= integrity missing count)
 *   portfolio_nodes               rows in skill-dependency-matrix TSV
 */
import * as fs from "fs/promises"
import path from "path"
import { glob } from "glob"

// ImportMeta.dir is a Bun extension; fall back to a manual resolution
// when running outside Bun (the script is always invoked via `bun ...`).
const SCRIPT_DIR = (() => {
  if (typeof (import.meta as unknown as { dir?: string }).dir === "string") {
    return (import.meta as unknown as { dir: string }).dir
  }
  return new URL(".", import.meta.url).pathname
})()
const ROOT = path.resolve(SCRIPT_DIR, "..")
const OPENCODE = path.join(ROOT, ".opencode")
const SKILLS = path.join(OPENCODE, "skills")
const ARCHIVE = path.join(OPENCODE, ".archive")

async function walkSkillMd(dir: string): Promise<string[]> {
  let entries: import("fs").Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: string[] = []
  for (const entry of entries) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walkSkillMd(p)))
    else if (entry.isFile() && entry.name === "SKILL.md") out.push(p)
  }
  return out
}

async function frontmatterName(file: string): Promise<string | undefined> {
  const content = await fs.readFile(file, "utf-8")
  const fm = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!fm) return undefined
  const name = fm[1]?.match(/^name:\s*(.+?)\s*$/m)?.[1]?.trim()
  return name || undefined
}

// 1. physical inventory
const repoAll = await walkSkillMd(SKILLS)
const topLevelDirs = (await fs.readdir(SKILLS, { withFileTypes: true })).filter((e) => e.isDirectory())
const topLevel: string[] = []
for (const d of topLevelDirs) {
  const p = path.join(SKILLS, d.name, "SKILL.md")
  try {
    await fs.access(p)
    topLevel.push(p)
  } catch {
    // not a top-level skill dir (no SKILL.md)
  }
}
const nested = repoAll.filter((f) => !topLevel.includes(f))
const archived = await walkSkillMd(ARCHIVE)

// 2. runtime discovery reproduction (src/skill/index.ts: scan(configDirs, "{skill,skills}/**/SKILL.md"))
const runtimeMatches = await glob("{skill,skills}/**/SKILL.md", {
  cwd: OPENCODE,
  absolute: true,
  dot: false,
  nodir: true,
  follow: false,
})

// 3. distinct names in each set
const nameCounts = new Map<string, number>()
for (const f of runtimeMatches) {
  const name = await frontmatterName(f)
  if (!name) continue
  nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1)
}
const duplicates = [...nameCounts.entries()].filter(([, n]) => n > 1)

// 4. integrity-test discovery model (top-level only)
const topLevelNames = new Set<string>()
for (const f of topLevel) {
  const name = await frontmatterName(f)
  if (name) topLevelNames.add(name)
}

// 5. builtin count from src/skill/index.ts (registrations with location "<built-in>")
const skillIndex = await fs.readFile(path.join(ROOT, "packages/opencode/src/skill/index.ts"), "utf-8")
const builtinCount = (skillIndex.match(/location: "<built-in>"/g) ?? []).length

// 6. portfolio ledger from the dependency matrix TSV
const matrixRaw = await fs.readFile(path.join(ROOT, "docs/skill-center/skill-dependency-matrix-2026-08-22.tsv"), "utf-8")
const matrixRows = matrixRaw.split("\n").filter(Boolean).slice(1)
const byClassification = new Map<string, number>()
const byNodeSource = new Map<string, number>()
for (const row of matrixRows) {
  const cells = row.split("\t")
  const cls = cells[1] ?? "?"
  const src = cells[3] ?? "?"
  byClassification.set(cls, (byClassification.get(cls) ?? 0) + 1)
  byNodeSource.set(src, (byNodeSource.get(src) ?? 0) + 1)
}

// 7. configured_only_nodes from the recomputed integrity snapshot footer
const integrityTsv = await fs
  .readFile(path.join(ROOT, "docs/skill-center/skill-reference-integrity-2026-08-23.tsv"), "utf-8")
  .catch(() => "")
const footer = (key: string) => Number(integrityTsv.match(new RegExp(`# ${key}\\t(\\d+)`))?.[1] ?? NaN)

const report = {
  repository_skill_md: repoAll.length,
  repository_skill_md_top_level: topLevel.length,
  nested_skill_md: nested.length,
  runtime_glob_matches: runtimeMatches.length,
  runtime_distinct_names: nameCounts.size,
  runtime_duplicate_names: duplicates.map(([n, c]) => `${n}x${c}`),
  integrity_test_discovery_disk: topLevelNames.size,
  integrity_test_discovery_with_builtin: topLevelNames.size + builtinCount,
  builtin_skills: builtinCount,
  archived_skill_md: archived.length,
  archived_paths: archived.map((f) => path.relative(ROOT, f).replaceAll("\\", "/")),
  integrity_referenced_count: footer("referenced_count"),
  integrity_missing_count: footer("missing_count"),
  configured_only_nodes: footer("missing_count"),
  integrity_discovered_count: footer("discovered_count"),
  portfolio_nodes: matrixRows.length,
  portfolio_by_classification: Object.fromEntries([...byClassification.entries()].sort()),
  portfolio_by_node_source: Object.fromEntries([...byNodeSource.entries()].sort()),
  nested_examples: nested.slice(0, 20).map((f) => path.relative(SKILLS, f).replaceAll("\\", "/")),
}
console.log(JSON.stringify(report, null, 2))