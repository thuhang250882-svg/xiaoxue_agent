#!/usr/bin/env bun
/**
 * RC6 Lifecycle 安装前 Checklist
 *
 * 在干净 Windows 工作站上启动 packaged Desktop 跑真实 model E2E 前,
 * 检查环境是否满足条件。
 *
 * 用法:
 *   bun ./scripts/rc6-lifecycle/install-checklist.ts
 *   bun ./scripts/rc6-lifecycle/install-checklist.ts --strict
 *   bun ./scripts/rc6-lifecycle/install-checklist.ts --json
 */

import { existsSync } from "node:fs"
import { join, resolve } from "node:path"

interface Check {
  id: string
  name: string
  passed: boolean
  detail: string
}

const ROOT = resolve(import.meta.dir, "..", "..")

interface CheckInput {
  BunGlobal?: { version?: string; argv?: string[] }
}

const BunGlobal = (globalThis as CheckInput).BunGlobal ?? ((globalThis as { Bun?: unknown }).Bun as CheckInput["BunGlobal"])

function checkBunVersion(): Check {
  const ver = BunGlobal?.version ?? "unknown"
  const m = ver.match(/^(\d+)\.(\d+)/)
  if (!m) return { id: "bun", name: "Bun ≥ 1.3", passed: false, detail: `version=${ver}` }
  const major = parseInt(m[1] ?? "0", 10)
  const minor = parseInt(m[2] ?? "0", 10)
  const passed = major > 1 || (major === 1 && minor >= 3)
  return { id: "bun", name: "Bun ≥ 1.3", passed, detail: `version=${ver}` }
}

function checkGitStatus(): Check {
  const fs = require("node:fs") as typeof import("node:fs")

  const proc = require("node:child_process") as typeof import("node:child_process")
  try {
    const out = proc.execFileSync("git", ["branch", "--show-current"], { cwd: ROOT, encoding: "utf8" }).trim()
    if (out === "rc6-clean-machine-lifecycle") {
      return { id: "git", name: "Git HEAD on rc6-clean-machine-lifecycle", passed: true, detail: out }
    }
    return { id: "git", name: "Git HEAD on rc6-clean-machine-lifecycle", passed: false, detail: `current=${out}` }
  } catch (e) {
    return { id: "git", name: "Git HEAD on rc6-clean-machine-lifecycle", passed: false, detail: `git failed: ${String(e)}` }
  }
}

function checkIntegrity(): Check {
  const p = join(ROOT, "packages", "desktop", "resources", "integrity.json")
  if (!existsSync(p)) return { id: "integrity", name: "integrity.json present", passed: false, detail: `missing ${p}` }
  const fs = require("node:fs") as typeof import("node:fs")
  const stat = fs.statSync(p)
  return { id: "integrity", name: "integrity.json non-empty", passed: stat.size > 40000, detail: `size=${stat.size}` }
}

function checkCoreSkills(): Check {
  const skills = ["审查合同", "knowledge-distill", "tender-document-review", "tender-bid-generation"]
  const missing: string[] = []
  for (const s of skills) {
    const p = join(ROOT, ".opencode", "skills", s, "SKILL.md")
    if (!existsSync(p)) missing.push(s)
  }
  return {
    id: "core-skills",
    name: "4 核心 RC6 业务 Skill present",
    passed: missing.length === 0,
    detail: missing.length === 0 ? "all 4 skills OK" : `missing: ${missing.join(", ")}`,
  }
}

function checkStaticAnalysis(): Check {
  const p = join(ROOT, "scripts", "rc6-e2e", "static-analysis.ts")
  return { id: "static-analysis", name: "static-analysis harness present", passed: existsSync(p), detail: p }
}

function checkNoInstaller(): Check {
  const candidates = [
    join(ROOT, "dist", "*.exe"),
    join(ROOT, "dist-installer"),
    join(ROOT, "release"),
    join(ROOT, "xiaoxue_agent-0.8.0-rc.6-setup.exe"),
  ]
  const fs = require("node:fs") as typeof import("node:fs")
  for (const c of candidates) {
    if (existsSync(c)) {
      const stat = fs.statSync(c)
      if (stat.isDirectory()) {
        const entries = fs.readdirSync(c)
        if (entries.some((e) => e.endsWith(".exe") || e.endsWith(".msi"))) {
          return { id: "no-installer", name: "无 installer 产物（lifecycle 不打包）", passed: false, detail: `found: ${c}` }
        }
      } else {
        return { id: "no-installer", name: "无 installer 产物（lifecycle 不打包）", passed: false, detail: `found: ${c}` }
      }
    }
  }
  return { id: "no-installer", name: "无 installer 产物（lifecycle 不打包）", passed: true, detail: "no installer artifacts" }
}

function checkApiKey(): Check {
  const fs = require("node:fs") as typeof import("node:fs")
  const home = process.env.USERPROFILE ?? process.env.HOME ?? ""
  const candidates = [join(home, ".xiaoxue", "credentials.json"), join(home, ".xiaoxue", "config.json")]
  for (const c of candidates) {
    if (existsSync(c)) {
      try {
        const content = fs.readFileSync(c, "utf8")
        if (content.includes("xiaoxue_default") || content.includes("apiKey") || content.includes("api_key")) {
          return { id: "api-key", name: "xiaoxue_default API key configured", passed: true, detail: `found in ${c}` }
        }
      } catch {}
    }
  }
  return {
    id: "api-key",
    name: "xiaoxue_default API key configured",
    passed: false,
    detail: "no ~/.xiaoxue/credentials.json with apiKey — must set XIAOXUE_API_KEY env var",
  }
}

function checkAcceptanceMatrix(): Check {
  const p = join(ROOT, "docs", "release", "rc6", "business-skill-acceptance-matrix-2026-08-22.md")
  return { id: "acceptance", name: "Acceptance Matrix document present", passed: existsSync(p), detail: p }
}

async function main() {
  const args = (BunGlobal?.argv ?? []).slice(2)
  const strict = args.includes("--strict")
  const jsonMode = args.includes("--json")

  const checks: Check[] = [
    checkBunVersion(),
    checkGitStatus(),
    checkIntegrity(),
    checkCoreSkills(),
    checkStaticAnalysis(),
    checkNoInstaller(),
    checkApiKey(),
    checkAcceptanceMatrix(),
  ]

  let passed = 0
  let failed = 0
  for (const c of checks) {
    if (c.passed) passed++
    else failed++
  }

  if (jsonMode) {
    console.log(JSON.stringify({ passed, failed, checks }, null, 2))
  } else {
    console.log("=== RC6 Lifecycle Install Checklist ===\n")
    for (const c of checks) {
      const icon = c.passed ? "✓" : "✗"
      console.log(`  ${icon} ${c.name}: ${c.detail}`)
    }
    console.log(`\n=== Summary: ${passed} passed / ${failed} failed ===`)
  }

  if (strict && failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})