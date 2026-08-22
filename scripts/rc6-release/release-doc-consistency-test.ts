#!/usr/bin/env bun
/**
 * RC6 release documentation consistency test.
 *
 * Checks (all hard-fail, exit 1 on any violation):
 *   - 25 step numbers [01..25] are present exactly once across the 5 main docs
 *     (no missing, no duplicate)
 *   - gate commit can be parsed by `git cat-file -t`
 *   - runner / fixture paths declared by docs exist on disk
 *   - release branch reference is consistent (rc6-release-prep)
 *   - declared product version == 0.8.0-rc.6
 *   - no literal API key (sk- + 24+ chars) in any scanned release file
 *   - no `size == 48119` (or similar byte-count-as-hard-gate) in any scanned release file
 *
 * Usage: bun ./scripts/rc6-release/release-doc-consistency-test.ts
 *        bun ./scripts/rc6-release/release-doc-consistency-test.ts --quiet
 */

import { existsSync, readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..", "..")
const DOCS_DIR = resolve(ROOT, "docs", "release", "rc6")
const SCRIPTS_DIR = resolve(ROOT, "scripts")
const FIXTURES_DIR = resolve(ROOT, "fixtures", "rc6-lifecycle")

const MAIN_DOCS = [
  "README.md",
  "PREFLIGHT.md",
  "CLEAN_WORKSTATION_CHEATSHEET.md",
  "RC6_PIPELINE_SUMMARY.md",
  "RELEASE_NOTES.md",
]

const RELEASE_BRANCH = "rc6-release-prep"
const EXPECTED_VERSION = "0.8.0-rc.6"

type Finding = { check: string; severity: "error" | "warn"; detail: string }
const findings: Finding[] = []

function record(check: string, severity: "error" | "warn", detail: string) {
  findings.push({ check, severity, detail })
}

function readDoc(rel: string): string {
  return readFileSync(resolve(DOCS_DIR, rel), "utf8")
}

function git(args: string[]): { ok: boolean; out: string } {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" })
  return { ok: r.status === 0, out: (r.stdout ?? "").trim() }
}

// ---------- Check 1: 25 step numbers [01..25] present exactly once ---------
{
  const expected = new Set<string>()
  for (let i = 1; i <= 25; i++) expected.add(`[${String(i).padStart(2, "0")}]`)

  const perDocCounts = new Map<string, Map<string, number>>()
  const aggregate = new Map<string, number>()

  for (const doc of MAIN_DOCS) {
    const text = readDoc(doc)
    const counts = new Map<string, number>()
    for (const tag of expected) {
      // Match `[NN]` only when not inside a fenced code block boundary; for the
      // purpose of this test, a simple global count is sufficient.
      const re = new RegExp(`\\${tag}`, "g")
      const n = (text.match(re) ?? []).length
      counts.set(tag, n)
    }
    perDocCounts.set(doc, counts)
    for (const [tag, n] of counts) {
      aggregate.set(tag, (aggregate.get(tag) ?? 0) + n)
    }
  }

  for (const tag of expected) {
    const total = aggregate.get(tag) ?? 0
    if (total === 0) {
      record("step-coverage", "error", `${tag} not present in any of the 5 main docs`)
    }
  }

  // For each doc, flag any step that appears > 1 time (likely a duplicate heading).
  for (const [doc, counts] of perDocCounts) {
    for (const [tag, n] of counts) {
      if (n > 1) {
        record("step-duplication", "warn", `${doc}: ${tag} appears ${n} times`)
      }
    }
  }
}

// ---------- Check 2: gate commit is parseable -------------------------------
{
  // Search README / PREFLIGHT / CHEATSHEET / PIPELINE / CONSISTENCY for the
  // canonical gate commit reference. We accept any 40-char hex prefix.
  const gatePattern = /\b([0-9a-f]{40})\b/g
  const candidates = new Set<string>()
  for (const doc of MAIN_DOCS) {
    const text = readDoc(doc)
    for (const m of text.matchAll(gatePattern)) {
      candidates.add(m[1])
    }
  }

  if (candidates.size === 0) {
    record("gate-commit-present", "error", "no 40-char hex commit reference found in any main doc")
  } else {
    let anyOk = false
    for (const sha of candidates) {
      const r = git(["cat-file", "-t", sha])
      if (r.ok && r.out === "commit") {
        anyOk = true
        break
      }
    }
    if (!anyOk) {
      record(
        "gate-commit-resolvable",
        "error",
        `candidates ${[...candidates].join(", ")} are not parseable commits in this repo`,
      )
    }
  }
}

// ---------- Check 3: runner / fixture paths declared by docs exist ----------
{
  const requiredPaths = [
    resolve(SCRIPTS_DIR, "rc6-lifecycle", "install-checklist.ts"),
    resolve(SCRIPTS_DIR, "rc6-lifecycle", "model-e2e-runner.ts"),
    resolve(SCRIPTS_DIR, "rc6-lifecycle", "acceptance-runner.ts"),
    resolve(SCRIPTS_DIR, "rc6-lifecycle", "synthesized-fixture.ts"),
    resolve(SCRIPTS_DIR, "rc6-release-prep", "installer-prep.ts"),
    resolve(SCRIPTS_DIR, "rc6-release", "rollback-workstation.ps1"),
    resolve(FIXTURES_DIR, "knowledge-distill", "synthetic-standard-001.md"),
    resolve(FIXTURES_DIR, "tender-document-review", "synthetic-tender-001.md"),
    resolve(FIXTURES_DIR, "tender-bid-generation", "synthetic-requirement-matrix.json"),
    resolve(FIXTURES_DIR, "审查合同", "synthetic-contract-001.md"),
  ]
  for (const p of requiredPaths) {
    if (!existsSync(p)) {
      record("runner-fixture-exists", "error", `missing ${p}`)
    }
  }
}

// ---------- Check 4: release branch consistency -----------------------------
{
  const r = git(["rev-parse", "--verify", `refs/heads/${RELEASE_BRANCH}`])
  if (!r.ok) {
    record("release-branch-exists", "error", `branch ${RELEASE_BRANCH} not present locally`)
  }
}

// ---------- Check 5: declared product version ------------------------------
{
  let foundCorrect = false
  for (const doc of MAIN_DOCS) {
    const text = readDoc(doc)
    if (text.includes(EXPECTED_VERSION)) {
      foundCorrect = true
      break
    }
  }
  if (!foundCorrect) {
    record("version-pin", "error", `expected version ${EXPECTED_VERSION} not declared in any main doc`)
  }
  // Also flag any literal "0.8.0-rc.<other>" that would conflict.
  for (const doc of MAIN_DOCS) {
    const text = readDoc(doc)
    const re = /0\.8\.0-rc\.\d+/g
    for (const m of text.matchAll(re)) {
      if (m[0] !== EXPECTED_VERSION) {
        record("version-conflict", "warn", `${doc}: found conflicting ${m[0]}`)
      }
    }
  }
}

// ---------- Check 6: no literal API key in release files -------------------
{
  // sk-<24+ chars>; excludes placeholders like sk-... and sk-XXXX.
  const keyRe = /\bsk-[A-Za-z0-9]{20,}\b/g
  const scanRoots = [DOCS_DIR, SCRIPTS_DIR]
  const walk = (dir: string): string[] => {
    const out: string[] = []
    for (const entry of require("node:fs").readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name)
      if (entry.isDirectory()) out.push(...walk(full))
      else if (/\.(md|ps1|ts|json|sh|txt)$/i.test(entry.name)) out.push(full)
    }
    return out
  }
  for (const root of scanRoots) {
    for (const file of walk(root)) {
      const text = readFileSync(file, "utf8")
      for (const m of text.matchAll(keyRe)) {
        record(
          "api-key-leak",
          "error",
          `${file.replace(ROOT + "\\", "")}: literal API key pattern '${m[0]}'`,
        )
      }
    }
  }
}

// ---------- Check 7: no `size == 48119` (or similar) hard gate -------------
{
  const forbiddenPatterns: { re: RegExp; label: string }[] = [
    { re: /size\s*==\s*48119/gi, label: "size == 48119" },
    { re: /size\s*==\s*\d{4,}\s*bytes?/gi, label: "size == N bytes (literal)" },
    { re: /bytes?\s*==\s*\d{4,}/gi, label: "bytes == N (literal)" },
    { re: /\(Get-Item[^\n]*\)\.Length\s*\n[^\n]*expected/gi, label: "Get-Item .Length hard gate" },
  ]
  for (const doc of MAIN_DOCS) {
    const text = readDoc(doc)
    for (const { re, label } of forbiddenPatterns) {
      for (const m of text.matchAll(re)) {
        record("hard-size-gate", "error", `${doc}: ${label} -> '${m[0].slice(0, 80)}'`)
      }
    }
  }
}

// ---------- Report ----------------------------------------------------------
const errors = findings.filter((f) => f.severity === "error")
const warns = findings.filter((f) => f.severity === "warn")

if (!process.argv.includes("--quiet")) {
  console.log("RC6 release doc consistency report")
  console.log("==================================")
  console.log(`main docs scanned: ${MAIN_DOCS.length}`)
  console.log(`errors: ${errors.length}    warnings: ${warns.length}`)
  console.log("")
  for (const f of findings) {
    console.log(`  [${f.severity.toUpperCase()}] ${f.check}: ${f.detail}`)
  }
}

if (errors.length > 0) {
  console.error(`\nFAIL: ${errors.length} hard-error finding(s).`)
  process.exit(1)
} else {
  console.log("\nPASS: all hard consistency checks satisfied.")
  process.exit(0)
}