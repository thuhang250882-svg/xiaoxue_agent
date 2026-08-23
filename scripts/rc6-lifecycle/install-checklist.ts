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
import { createHash } from "node:crypto"

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
  // 真正读取 manifest, set 比对 + 逐文件 SHA-256 校验。复用与 generator / verify-packaged
  // 相同的语义规则, 唯一 source of truth 是 generate-resource-integrity.ts 写出的清单。
  let raw: string
  try {
    raw = require("node:fs").readFileSync(p, "utf8") as string
  } catch (cause) {
    return { id: "integrity", name: "integrity.json readable", passed: false, detail: `read failed: ${String(cause)}` }
  }
  let manifest: unknown
  try {
    manifest = JSON.parse(raw)
  } catch (cause) {
    return { id: "integrity", name: "integrity.json parse", passed: false, detail: `parse failed: ${String(cause)}` }
  }
  if (!isManifest(manifest)) return { id: "integrity", name: "integrity.json schema", passed: false, detail: "schema invalid (version=1 required, files[{path,sha256}] required)" }
  // manifest 路径使用 generator 当前的 source root：
  //   skills            <-- .opencode/skills (extraResources 源)
  //   obsidian-plugin   <-- packages/desktop/resources/obsidian-plugin
  //   python            <-- packages/desktop/resources/python
  // install-checklist 在 pre-package 阶段运行, 必须按 source 路径验证,
  // 而不是 packaged output 的 resources/ 路径。
  const sourceRoot: Record<string, string> = {
    skills: join(ROOT, ".opencode", "skills"),
    "obsidian-plugin": join(ROOT, "packages", "desktop", "resources", "obsidian-plugin"),
    python: join(ROOT, "packages", "desktop", "resources", "python"),
  }
  const expected = new Map(manifest.files.map((file) => [file.path, file.sha256] as const))
  const mismatched: string[] = []
  for (const file of manifest.files) {
    const rootName = file.path.split("/", 1)[0] ?? ""
    const relative = file.path.slice(rootName.length + 1)
    const root = sourceRoot[rootName]
    if (!root) {
      mismatched.push(`${file.path}: unknown prefix`)
      continue
    }
    const absolute = join(root, relative)
    if (!existsSync(absolute)) {
      mismatched.push(`${file.path}: missing`)
      continue
    }
    const digest = createHash("sha256").update(require("node:fs").readFileSync(absolute)).digest("hex")
    if (digest !== file.sha256) mismatched.push(`${file.path}: hash mismatch`)
  }
  if (mismatched.length === 0) {
    return { id: "integrity", name: "integrity.json semantic match", passed: true, detail: `version=1, ${manifest.files.length} entries, all SHA-256 match` }
  }
  return { id: "integrity", name: "integrity.json semantic match", passed: false, detail: `${mismatched.length} issue(s): ${mismatched.slice(0, 3).join("; ")}${mismatched.length > 3 ? "; ..." : ""}` }
}

function isManifest(value: unknown): value is { version: number; files: Array<{ path: string; sha256: string }> } {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { version?: unknown; files?: unknown }
  if (candidate.version !== 1) return false
  if (!Array.isArray(candidate.files)) return false
  return candidate.files.every(
    (file) =>
      typeof file === "object" &&
      file !== null &&
      typeof (file as { path?: unknown }).path === "string" &&
      typeof (file as { sha256?: unknown }).sha256 === "string" &&
      /^[a-f0-9]{64}$/.test((file as { sha256: string }).sha256),
  )
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

// RC6 Gate A Run02 regression: root package.json trustedDependencies must NOT
// list packages whose install scripts need node-gyp on Windows without VS
// Build Tools. tree-sitter-powershell@0.25.10 ships no prebuilds and runtime
// only loads the bundled WASM (packages/opencode/src/tool/shell.ts), so its
// install script is pure overhead and breaks fresh installs on clean
// workstations. See docs/release/rc6/rc6-dependency-install-fix-2026-08-22.md.
const NATIVE_BUILD_BLOCKLIST = new Set(["tree-sitter-powershell"])

function checkTrustedDependenciesNativeBuild(): Check {
  const p = join(ROOT, "package.json")
  if (!existsSync(p)) return { id: "trusted-deps", name: "no native-postinstall blocklist in trustedDependencies", passed: false, detail: `missing ${p}` }
  let pkg: { trustedDependencies?: unknown }
  try {
    pkg = JSON.parse(require("node:fs").readFileSync(p, "utf8")) as { trustedDependencies?: unknown }
  } catch (cause) {
    return { id: "trusted-deps", name: "no native-postinstall blocklist in trustedDependencies", passed: false, detail: `parse failed: ${String(cause)}` }
  }
  const trusted = Array.isArray(pkg.trustedDependencies) ? pkg.trustedDependencies.filter((x): x is string => typeof x === "string") : []
  const hits = trusted.filter((name) => NATIVE_BUILD_BLOCKLIST.has(name))
  if (hits.length === 0) {
    return { id: "trusted-deps", name: "no native-postinstall blocklist in trustedDependencies", passed: true, detail: `${NATIVE_BUILD_BLOCKLIST.size} blocklisted package(s) absent from trustedDependencies` }
  }
  return {
    id: "trusted-deps",
    name: "no native-postinstall blocklist in trustedDependencies",
    passed: false,
    detail: `blocklisted: ${hits.join(", ")} (their install scripts need node-gyp and ship no prebuilds; runtime uses bundled WASM only)`,
  }
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
    checkTrustedDependenciesNativeBuild(),
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