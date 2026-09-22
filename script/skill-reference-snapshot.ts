#!/usr/bin/env bun
/**
 * Skill Reference Integrity Inventory Snapshot
 *
 * Formal successor to `.tmp/integrity-snapshot.ts` (Phase 3.0A).
 * Mirrors the exact parsing logic used by
 * `packages/opencode/test/skill/reference-integrity.test.ts` and emits
 * a TSV of:
 *
 *   reference_id | source | line | status
 *
 * status values:
 *   - discovered        : Skill ID is on disk under .opencode/skills/<...>/SKILL.md
 *                         or in the built-in allowlist (customize-opencode)
 *   - builtin-foundation: Built-in Skill intentionally retained as a runtime foundation
 *   - platform-only     : Discoverable Skill intentionally retained for platform development
 *   - alias             : Skill ID is in the ALLOWED_ALIASES table (currently empty)
 *   - MISSING           : Skill ID is referenced but cannot be resolved
 *
 * Run from any working directory; the script pins REPO_ROOT itself.
 *
 * The TSV is committed under docs/skill-center/ and consumed by
 * `script/skill-counting-model.ts` to compute configured_only_nodes
 * without duplicating the integrity-parsing logic.
 */
import * as fs from "fs/promises"
import * as path from "path"

// ImportMeta.dir is a Bun extension; fall back to a manual resolution
// when running outside Bun (the script is always invoked via `bun ...`).
const SCRIPT_DIR = (() => {
  if (typeof (import.meta as unknown as { dir?: string }).dir === "string") {
    return (import.meta as unknown as { dir: string }).dir
  }
  return new URL(".", import.meta.url).pathname
})()
const ROOT = path.resolve(SCRIPT_DIR, "..")

const PATHS = {
  agent: path.join(ROOT, "packages/opencode/src/agent/agent.ts"),
  router: path.join(ROOT, "packages/opencode/src/agent/xiaoxue-router.ts"),
  routerMd: path.join(ROOT, "configs/xiaoxue/router.md"),
  skillsYaml: path.join(ROOT, "configs/xiaoxue/skills.yaml"),
  releaseProfile: path.join(ROOT, "configs/xiaoxue/rc-release-profile.json"),
  portableTest: path.join(ROOT, "packages/opencode/test/xiaoxue/portable-skills.test.ts"),
  routerTest: path.join(ROOT, "packages/opencode/test/agent/xiaoxue-router.test.ts"),
  skillsDir: path.join(ROOT, ".opencode/skills"),
}

const BUILTIN_SKILL_IDS: ReadonlySet<string> = new Set(["customize-opencode"])
const ALLOWED_ALIASES: ReadonlyMap<string, string> = new Map([])

interface Reference {
  id: string
  source: string
  line: number
  governance?: "builtin-foundation" | "platform-only"
}

const TS_TYPE_NAMES: ReadonlySet<string> = new Set([
  "string",
  "number",
  "boolean",
  "bigint",
  "symbol",
  "undefined",
  "null",
  "object",
  "unknown",
  "never",
  "any",
  "void",
])

function parseAgentAllowlist(source: string, file: string): Reference[] {
  const refs: Reference[] = []
  const lines = source.split("\n")
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ""
    if (!/^\s*skill:\s*\{\s*$/.test(line)) {
      i++
      continue
    }
    let depth = 1
    let j = i + 1
    for (; j < lines.length && depth > 0; j++) {
      const block = lines[j] ?? ""
      for (const ch of block) {
        if (ch === "{") depth++
        else if (ch === "}") depth--
        if (depth === 0) break
      }
    }
    for (let k = i + 1; k < j; k++) {
      const trimmed = (lines[k] ?? "").trim()
      if (trimmed === "}" || trimmed.startsWith("}")) continue
      const m = trimmed.match(/^(?:\*|["']?)([^"':\s][^"':]*?)["']?\s*:\s*"(?:allow|ask|deny)"\s*,?\s*$/)
      if (!m) continue
      const id = m[1]
      if (!id || id === "*") continue
      refs.push({ id, source: file, line: k + 1 })
    }
    i = j
  }
  return refs
}

function parseRouterSkill(source: string, file: string): Reference[] {
  const refs: Reference[] = []
  const lines = source.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const m = (lines[i] ?? "").match(
      /^\s*skill:\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_\-\u4e00-\u9fff]+))\s*,?\s*$/,
    )
    if (!m) continue
    const id = m[1] ?? m[2] ?? m[3]
    if (!id) continue
    if (TS_TYPE_NAMES.has(id)) continue
    refs.push({ id, source: file, line: i + 1 })
  }
  return refs
}

function parseRouterMd(source: string, file: string): Reference[] {
  const refs: Reference[] = []
  const lines = source.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""
    if (!line.startsWith("|")) continue
    const cells = line.split("|").slice(1, -1).map((c) => c.trim())
    if (cells.length < 4) continue
    const skillCell = cells[3] ?? ""
    if (skillCell === "首选 Skill" || skillCell.toLowerCase() === "skill") continue
    if (skillCell === "---" || /^-+$/.test(skillCell)) continue
    if (skillCell === "" || skillCell.startsWith("按") || skillCell === "-") continue
    for (const part of skillCell.split("/").map((s) => s.trim()).filter(Boolean)) {
      refs.push({ id: part, source: file, line: i + 1 })
    }
  }
  return refs
}

function parseSkillsYaml(source: string, file: string): Reference[] {
  const refs: Reference[] = []
  const lines = source.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const m = (lines[i] ?? "").match(/^\s*runtime_skill:\s*(.+?)\s*$/)
    if (!m) continue
    const captured = m[1] ?? ""
    let value = captured.trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (value) refs.push({ id: value, source: file, line: i + 1 })
  }
  return refs
}

function parseReleaseProfile(source: string, file: string): Reference[] {
  const refs: Reference[] = []
  const lines = source.split("\n")
  let section: "runtime-foundation" | "platform-only" | undefined
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""
    if (/^\s*"runtimeFoundations"\s*:\s*\[\s*$/.test(line)) {
      section = "runtime-foundation"
      continue
    }
    if (/^\s*"PLATFORM_ONLY"\s*:\s*\[\s*$/.test(line)) {
      section = "platform-only"
      continue
    }
    if (section && /^\s*\]\s*,?\s*$/.test(line)) {
      section = undefined
      continue
    }
    const id = line.match(/^\s*"([^"]+)"\s*,?\s*$/)?.[1]
    if (!id || !section) continue
    if (section === "platform-only") {
      refs.push({ id, source: file, line: i + 1, governance: "platform-only" })
      continue
    }
    if (BUILTIN_SKILL_IDS.has(id)) {
      refs.push({ id, source: file, line: i + 1, governance: "builtin-foundation" })
    }
  }
  return refs
}

function parsePortableImported(source: string, file: string): Reference[] {
  const refs: Reference[] = []
  const lines = source.split("\n")
  let inArray = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""
    if (!inArray) {
      if (/^\s*const\s+imported\s*=\s*\[\s*$/.test(line)) inArray = true
      continue
    }
    if (/^\s*\]\s*(?:as\s+const)?/.test(line)) break
    const m = line.match(/^\s*["']([^"']+)["']\s*,?\s*$/)
    const id = m?.[1]
    if (id) refs.push({ id, source: file, line: i + 1 })
  }
  return refs
}

function parseRouterTestExpectations(source: string, file: string): Reference[] {
  const refs: Reference[] = []
  const lines = source.split("\n")
  // Only the first test.each block is the [input, agent, skill, tool] routing matrix.
  // Later blocks contain non-Skill expectations such as unavailable-capability messages.
  const blockStarts: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*test\.each\(\[\s*$/.test(lines[i] ?? "")) blockStarts.push(i)
  }
  if (blockStarts.length === 0) return refs
  const start = blockStarts[0] ?? 0
  for (let i = start; i < lines.length; i++) {
    if (/^\s*\] as const\)\(/.test(lines[i] ?? "")) break
    const m = (lines[i] ?? "").match(/^\s*\[\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"([^"]+)"/)
    const id = m?.[1]
    if (id) refs.push({ id, source: file, line: i + 1 })
  }
  return refs
}

async function discoverSkillIds(skillsDir: string): Promise<Set<string>> {
  const ids = new Set<string>()
  let entries: import("fs").Dirent[]
  try {
    entries = await fs.readdir(skillsDir, { withFileTypes: true })
  } catch {
    return ids
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillMd = path.join(skillsDir, entry.name, "SKILL.md")
    let content: string
    try {
      content = await fs.readFile(skillMd, "utf-8")
    } catch {
      continue
    }
    const fm = content.match(/^---\s*\n([\s\S]*?)\n---/)
    if (!fm) continue
    const nameMatch = fm[1]?.match(/^name:\s*(.+?)\s*$/m)
    const name = nameMatch?.[1]?.trim()
    if (name) ids.add(name)
  }
  for (const builtin of BUILTIN_SKILL_IDS) ids.add(builtin)
  return ids
}

function rel(p: string): string {
  return path.relative(ROOT, p).split(path.sep).join("/")
}

async function main() {
  const [agent, router, routerMd, skillsYaml, releaseProfile, portable, routerTest, discovered] = await Promise.all([
    fs.readFile(PATHS.agent, "utf-8"),
    fs.readFile(PATHS.router, "utf-8"),
    fs.readFile(PATHS.routerMd, "utf-8"),
    fs.readFile(PATHS.skillsYaml, "utf-8"),
    fs.readFile(PATHS.releaseProfile, "utf-8"),
    fs.readFile(PATHS.portableTest, "utf-8"),
    fs.readFile(PATHS.routerTest, "utf-8"),
    discoverSkillIds(PATHS.skillsDir),
  ])

  const references: Reference[] = [
    ...parseAgentAllowlist(agent, rel(PATHS.agent)),
    ...parseRouterSkill(router, rel(PATHS.router)),
    ...parseRouterMd(routerMd, rel(PATHS.routerMd)),
    ...parseSkillsYaml(skillsYaml, rel(PATHS.skillsYaml)),
    ...parseReleaseProfile(releaseProfile, rel(PATHS.releaseProfile)),
    ...parsePortableImported(portable, rel(PATHS.portableTest)),
    ...parseRouterTestExpectations(routerTest, rel(PATHS.routerTest)),
  ]

  // Emit TSV
  const lines = [
    ["reference_id", "source", "line", "status"].join("\t"),
  ]
  const counts = { discovered: 0, alias: 0, missing: 0, builtin: 0, builtinFoundation: 0, platformOnly: 0 }
  const seen = new Set<string>()
  for (const r of references) {
    const key = `${r.id}\t${r.source}\t${r.line}`
    if (seen.has(key)) continue
    seen.add(key)
    let status: string
    if (ALLOWED_ALIASES.has(r.id)) {
      status = `alias->${ALLOWED_ALIASES.get(r.id)}`
      counts.alias++
    } else if (discovered.has(r.id)) {
      if (r.governance === "builtin-foundation") {
        status = r.governance
        counts.builtinFoundation++
      } else if (r.governance === "platform-only") {
        status = r.governance
        counts.platformOnly++
      } else if (BUILTIN_SKILL_IDS.has(r.id)) {
        status = "discovered(builtin)"
        counts.builtin++
      } else {
        status = "discovered"
        counts.discovered++
      }
    } else {
      status = "MISSING"
      counts.missing++
    }
    lines.push([r.id, r.source, String(r.line), status].join("\t"))
  }

  // Append a small footer with discovered IDs not referenced anywhere (orphan candidates)
  const referenced = new Set(references.map((r) => r.id))
  const orphans = [...discovered].filter((id) => !referenced.has(id)).sort()
  lines.push(`# referenced_count\t${references.length}`)
  lines.push(`# missing_count\t${counts.missing}`)
  lines.push(`# discovered_count\t${discovered.size}`)
  lines.push(orphans.length ? `# orphaned_discovered_skills\t${orphans.join(",")}` : "# orphaned_discovered_skills\t(none)")

  const metaPath = path.join(ROOT, "docs/skill-center/skill-reference-integrity-2026-08-23.tsv")
  await fs.writeFile(metaPath, lines.join("\n") + "\n", "utf-8")
  console.log(JSON.stringify({ counts, discoveredCount: discovered.size, orphanCount: orphans.length, sampleOrphans: orphans.slice(0, 5) }, null, 2))
}

await main()
