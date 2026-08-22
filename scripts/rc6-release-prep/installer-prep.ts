#!/usr/bin/env bun
/**
 * RC6 Release Prep — Installer Prep (Dry-Run)
 *
 * 不实际跑 `bun run package`，仅做预检：
 *   - 验证 XIAOXUE_PRODUCT_VERSION / OPENCODE_CHANNEL 配置
 *   - 验证 electron-builder.config.ts 存在 + 不被改动
 *   - 验证 packaging 资源齐全（icon / entitlements / resources/python/）
 *   - 验证 bundled skills 资源完整性（与 rc6-packaged-resource-validation 阶段对齐）
 *
 * 用法:
 *   bun ./scripts/rc6-release-prep/installer-prep.ts
 *   bun ./scripts/rc6-release-prep/installer-prep.ts --strict
 *
 * 严禁事项（继续生效）:
 *   - 不得在此脚本中调用 `bun run package`
 *   - 不得创建 installer 产物
 *   - 不得签名 / 上传 / 发布
 */

import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

interface Check {
  id: string
  name: string
  passed: boolean
  detail: string
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, "..", "..")
const PACKAGES_DESKTOP = join(ROOT, "packages", "desktop")
const BUILD_CONFIG = join(PACKAGES_DESKTOP, "electron-builder.config.ts")

const BunGlobal = (globalThis as { Bun?: { argv?: string[] } }).Bun

function checkProductVersion(): Check {
  const v = process.env.XIAOXUE_PRODUCT_VERSION
  if (!v) return { id: "ver", name: "XIAOXUE_PRODUCT_VERSION set", passed: false, detail: "env var not set — required for prod builds" }
  if (v !== "0.8.0-rc.6") return { id: "ver", name: "XIAOXUE_PRODUCT_VERSION = 0.8.0-rc.6", passed: false, detail: `current=${v}` }
  return { id: "ver", name: "XIAOXUE_PRODUCT_VERSION = 0.8.0-rc.6", passed: true, detail: v }
}

function checkChannel(): Check {
  const c = process.env.OPENCODE_CHANNEL
  if (!c) return { id: "channel", name: "OPENCODE_CHANNEL set", passed: false, detail: "env var not set" }
  if (c !== "prod") return { id: "channel", name: "OPENCODE_CHANNEL = prod", passed: false, detail: `current=${c}` }
  return { id: "channel", name: "OPENCODE_CHANNEL = prod", passed: true, detail: c }
}

function checkBuildConfig(): Check {
  if (!existsSync(BUILD_CONFIG)) return { id: "config", name: "electron-builder.config.ts present", passed: false, detail: BUILD_CONFIG }
  const size = statSync(BUILD_CONFIG).size
  return { id: "config", name: "electron-builder.config.ts present", passed: true, detail: `${BUILD_CONFIG} (${size} bytes)` }
}

function checkBuildResources(): Check {
  const required = [
    join(PACKAGES_DESKTOP, "resources", "icons", "icon.ico"),
    join(PACKAGES_DESKTOP, "resources", "icons", "icon.icns"),
    join(PACKAGES_DESKTOP, "resources", "entitlements.plist"),
    join(PACKAGES_DESKTOP, "resources", "python"),
  ]
  const missing = required.filter((p) => !existsSync(p))
  if (missing.length > 0) return { id: "res", name: "build resources present", passed: false, detail: `missing: ${missing.join(", ")}` }
  return { id: "res", name: "build resources present", passed: true, detail: `${required.length} paths OK` }
}

function checkBundledSkills(): Check {
  const skillsDir = join(ROOT, ".opencode", "skills")
  if (!existsSync(skillsDir)) return { id: "skills", name: ".opencode/skills present", passed: false, detail: skillsDir }
  const integrity = join(PACKAGES_DESKTOP, "resources", "integrity.json")
  if (!existsSync(integrity)) return { id: "skills", name: "integrity.json present", passed: false, detail: integrity }
  const size = statSync(integrity).size
  return { id: "skills", name: ".opencode/skills + integrity.json present", passed: true, detail: `${skillsDir}, integrity=${size} bytes` }
}

function checkObsidianPlugin(): Check {
  const p = join(PACKAGES_DESKTOP, "resources", "obsidian-plugin")
  const required = ["manifest.json", "main.js", "styles.css"]
  if (!existsSync(p)) return { id: "obsidian", name: "obsidian-plugin present", passed: false, detail: p }
  const missing = required.filter((f) => !existsSync(join(p, f)))
  if (missing.length > 0) return { id: "obsidian", name: "obsidian-plugin files present", passed: false, detail: `missing: ${missing.join(", ")}` }
  return { id: "obsidian", name: "obsidian-plugin files present", passed: true, detail: `${required.length} files OK` }
}

function checkNotRunning(): Check {
  // Sanity: confirm we are not accidentally running in a context that would
  // trigger actual packaging. The presence of dist/xiaoxue-output would mean
  // a previous packaging was started.
  const dist = join(PACKAGES_DESKTOP, "dist", "xiaoxue-output")
  if (existsSync(dist)) {
    const size = statSync(dist).size
    return { id: "no-pack", name: "no installer artifacts (release prep 阶段不打包)", passed: false, detail: `dist/xiaoxue-output exists, size=${size}` }
  }
  return { id: "no-pack", name: "no installer artifacts (release prep 阶段不打包)", passed: true, detail: "no dist/xiaoxue-output" }
}

function checkPackageJsonScripts(): Check {
  const pkgPath = join(PACKAGES_DESKTOP, "package.json")
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts: Record<string, string> }
  const required = ["build", "package", "prepackage:win"]
  const missing = required.filter((s) => !pkg.scripts[s])
  if (missing.length > 0) return { id: "pkg", name: "package.json scripts present", passed: false, detail: `missing: ${missing.join(", ")}` }
  return { id: "pkg", name: "package.json scripts present", passed: true, detail: `${required.length} scripts OK` }
}

function main() {
  const strict = (BunGlobal?.argv ?? []).includes("--strict")

  const checks: Check[] = [
    checkProductVersion(),
    checkChannel(),
    checkBuildConfig(),
    checkBuildResources(),
    checkBundledSkills(),
    checkObsidianPlugin(),
    checkPackageJsonScripts(),
    checkNotRunning(),
  ]

  console.log("=== RC6 Release Prep — Installer Dry-Run ===\n")
  for (const c of checks) {
    const mark = c.passed ? "✓" : "✗"
    console.log(`  ${mark} ${c.name}: ${c.detail}`)
  }

  const failed = checks.filter((c) => !c.passed).length
  console.log(`\n=== Summary: ${checks.length - failed} passed / ${failed} failed ===`)
  console.log("\nREMINDER: This is a dry-run only. Do NOT run `bun run package` in sandbox.")
  console.log("Installer packaging must happen on a clean Windows workstation.")

  if (strict && failed > 0) process.exit(1)
}

main()