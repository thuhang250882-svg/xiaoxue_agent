#!/usr/bin/env bun
/**
 * RC6 E2E 静态分析 harness
 *
 * 不依赖真实 model 或 API key。
 * 用于在 packaged resource validation 之后、model RC6 E2E 阶段前,
 * 静态核对 RC6 业务 Skill 是否满足 Acceptance Matrix 的"前置条件"维度:
 *
 *  1. SKILL.md frontmatter 可解析 (name/description/triggers/dependencies)
 *  2. references/*.md 引用完整, 不指向不存在文件
 *  3. 工具/知识依赖存在 (packages/opencode/src/skill 中已注册)
 *  4. Trigger 关键词覆盖 (description 中的中文/英文 trigger 词)
 *
 * 用法:
 *   bun ./scripts/rc6-e2e/static-analysis.ts
 *   bun ./scripts/rc6-e2e/static-analysis.ts --skill <skill-name>
 *   bun ./scripts/rc6-e2e/static-analysis.ts --strict
 */

// @ts-ignore -- bun runtime global
const BunGlobal = (globalThis as { Bun?: { YAML?: { parse: (s: string) => unknown } } }).Bun

import { readdir, readFile, stat } from "node:fs/promises"
import { join, relative, resolve } from "node:path"

interface Frontmatter {
  name?: string
  description?: string
  "argument-hint"?: string
  name_en?: string
  description_en?: string
  triggers?: string[]
  dependencies?: string[]
  tools?: string[]
  knowledge?: string[]
}

interface CheckResult {
  skill: string
  checks: Array<{
    name: string
    passed: boolean
    detail: string
  }>
}

const ROOT = resolve(import.meta.dir, "..", "..")
const SKILLS_DIR = join(ROOT, ".opencode", "skills")

const TARGET_SKILLS = [
  "审查合同",
  "knowledge-distill",
  "tender-document-review",
  "tender-bid-generation",
] as const

const KNOWN_TOOLS = new Set<string>([
  "knowledge_manage",
  "document_generation",
  "tender_review",
])

function normalizeFrontmatter(raw: Record<string, unknown>): Frontmatter {
  const fm: Frontmatter = {}
  if (typeof raw.name === "string") fm.name = raw.name
  if (typeof raw.description === "string") fm.description = raw.description
  if (typeof raw["argument-hint"] === "string") fm["argument-hint"] = raw["argument-hint"]
  if (typeof raw.name_en === "string") fm.name_en = raw.name_en
  if (typeof raw.description_en === "string") fm.description_en = raw.description_en
  if (Array.isArray(raw.triggers)) fm.triggers = (raw.triggers as unknown[]).map(String)
  if (Array.isArray(raw.dependencies)) fm.dependencies = (raw.dependencies as unknown[]).map(String)
  if (Array.isArray(raw.tools)) fm.tools = (raw.tools as unknown[]).map(String)
  if (Array.isArray(raw.knowledge)) fm.knowledge = (raw.knowledge as unknown[]).map(String)
  return fm
}

function parseFrontmatter(content: string): Frontmatter | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return null
  const yaml = match[1] ?? ""

  if (BunGlobal?.YAML?.parse) {
    try {
      const parsed = BunGlobal.YAML.parse(yaml)
      if (parsed && typeof parsed === "object") {
        return normalizeFrontmatter(parsed as Record<string, unknown>)
      }
    } catch {
      // fall through to manual parser
    }
  }

  return manualFrontmatterParse(yaml)
}

function manualFrontmatterParse(yaml: string): Frontmatter {
  const lines = yaml.split(/\r?\n/)
  const fm: Frontmatter = {}
  let pendingKey: string | null = null
  let pendingValue: string[] = []
  let inArray = false

  const flush = () => {
    if (pendingKey === null) return
    const value = pendingValue.join("\n").trim()
    if (inArray) {
      const arr = pendingValue.map((v) => v.replace(/^\s*-\s*/, "").trim()).filter(Boolean)
      ;(fm as Record<string, unknown>)[pendingKey] = arr
    } else if (value) {
      ;(fm as Record<string, unknown>)[pendingKey] = value.replace(/^["']|["']$/g, "")
    }
    pendingKey = null
    pendingValue = []
    inArray = false
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === "") {
      continue
    }
    const arrayMatch = line.match(/^\s*-\s+(.+)$/)
    if (arrayMatch && pendingKey !== null && inArray) {
      const item = arrayMatch[1] ?? ""
      pendingValue.push(item)
      continue
    }
    const headerMatch = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*)\s*:\s*(.*)$/)
    if (headerMatch) {
      flush()
      const key = headerMatch[1] ?? ""
      const value = headerMatch[2] ?? ""
      pendingKey = key
      const trimmedVal = value.trim()
      if (trimmedVal === "" || trimmedVal === ">" || trimmedVal === "|" || trimmedVal === "|-") {
        inArray = false
        pendingValue = []
      } else if (trimmedVal.startsWith("-")) {
        inArray = true
        pendingValue = [trimmedVal.replace(/^-\s*/, "")]
      } else {
        inArray = false
        pendingValue = [trimmedVal.replace(/^["']|["']$/g, "")]
      }
      continue
    }
    if (pendingKey !== null && /^\s+/.test(line)) {
      pendingValue.push(trimmed)
    }
  }
  flush()
  return fm
}

async function listSkillFiles(skill: string): Promise<string[]> {
  const dir = join(SKILLS_DIR, skill)
  const files: string[] = []

  async function walk(prefix: string) {
    const entries = await readdir(prefix, { withFileTypes: true })
    for (const e of entries) {
      const p = join(prefix, e.name)
      if (e.isDirectory()) await walk(p)
      else files.push(relative(dir, p).replace(/\\/g, "/"))
    }
  }

  try {
    await stat(dir)
    await walk(dir)
  } catch {
    return []
  }
  return files
}

function splitPhrases(s: string): string[] {
  return s
    .split(/[、,，;；]|\s+or\s+|\s+and\s+/i)
    .map((p) => p.replace(/^["'`]|["'`]$/g, "").trim())
    .filter(Boolean)
}

function extractTriggers(description: string | undefined): string[] {
  if (!description) return []
  const phrases: string[] = []

  const m1 = description.match(/当用户要求[「『"'](.+?)[」』"']时/)
  if (m1) phrases.push(...splitPhrases(m1[1] ?? ""))

  const m2 = description.match(/Trigger when the user asks? to\s*"([^"]+)"/i)
  if (m2) phrases.push(...splitPhrases(m2[1] ?? ""))

  const m3 = description.match(/Use when the user asks? to\s+(.+?)(?:\.\s+Do not|\.\s*$|\n)/is)
  if (m3) phrases.push(...splitPhrases(m3[1] ?? ""))

  return [...new Set(phrases)]
}

async function checkSkill(skill: string): Promise<CheckResult> {
  const result: CheckResult = { skill, checks: [] }
  const skillPath = join(SKILLS_DIR, skill, "SKILL.md")
  let content: string
  try {
    content = await readFile(skillPath, "utf8")
  } catch (e) {
    result.checks.push({ name: "skill directory exists", passed: false, detail: String(e) })
    return result
  }
  result.checks.push({ name: "skill directory exists", passed: true, detail: skillPath })

  const fm = parseFrontmatter(content)
  if (!fm) {
    result.checks.push({ name: "frontmatter parseable", passed: false, detail: "no --- block" })
    return result
  }
  result.checks.push({ name: "frontmatter parseable", passed: true, detail: `name=${fm.name ?? "(missing)"}` })

  if (!fm.name) {
    result.checks.push({ name: "name present", passed: false, detail: "no name field" })
  } else {
    result.checks.push({ name: "name present", passed: true, detail: fm.name })
  }

  const descLen = (fm.description ?? "").length
  result.checks.push({
    name: "description ≥ 30 chars",
    passed: descLen >= 30,
    detail: `length=${descLen}`,
  })

  const triggers = fm.triggers ?? extractTriggers(fm.description)
  const useDeclaredTriggers = Array.isArray(fm.triggers) && (fm.triggers?.length ?? 0) > 0
  result.checks.push({
    name: "triggers ≥ 3 keywords (declared or extracted)",
    passed: triggers.length >= 3,
    detail: `count=${triggers.length}; source=${useDeclaredTriggers ? "declared" : "extracted"}; sample=${triggers.slice(0, 3).join("|")}`,
  })

  const deps = fm.dependencies ?? []
  if (deps.length === 0) {
    result.checks.push({ name: "dependencies declared or empty", passed: true, detail: "no deps" })
  } else {
    const allKnown = deps.every((d) => KNOWN_TOOLS.has(d) || d.endsWith(".skill"))
    result.checks.push({
      name: "all dependencies registered",
      passed: allKnown,
      detail: deps.join(", "),
    })
  }

  const tools = fm.tools ?? []
  if (tools.length > 0) {
    const allKnown = tools.every((t) => KNOWN_TOOLS.has(t))
    result.checks.push({
      name: "all tools registered in opencode",
      passed: allKnown,
      detail: tools.join(", "),
    })
  }

  const files = await listSkillFiles(skill)
  const mdFiles = files.filter((f) => f.endsWith(".md"))
  result.checks.push({
    name: "≥ 1 SKILL.md file",
    passed: mdFiles.includes("SKILL.md"),
    detail: `md_count=${mdFiles.length}`,
  })

  const refFiles = files.filter((f) => f.startsWith("references/") && f.endsWith(".md"))
  result.checks.push({
    name: "≥ 0 reference contracts",
    passed: true,
    detail: `references_count=${refFiles.length}`,
  })

  const refMentions = (content.match(/references\/[A-Za-z0-9_\-\u4e00-\u9fff]+\.md/g) ?? []).filter((v, i, a) => a.indexOf(v) === i)
  if (refMentions.length > 0) {
    const missing = refMentions.filter((r) => !files.includes(r))
    result.checks.push({
      name: "all referenced files exist",
      passed: missing.length === 0,
      detail: missing.length === 0 ? `${refMentions.length} refs OK` : `missing: ${missing.join(", ")}`,
    })
  }

  return result
}

async function main() {
  const args = (BunGlobal as unknown as { argv: string[] }).argv.slice(2)
  const strict = args.includes("--strict")
  const skillIdx = args.indexOf("--skill")
  const skillFilter = skillIdx >= 0 ? args[skillIdx + 1] : null

  const targets = skillFilter ? [skillFilter] : [...TARGET_SKILLS]
  const allResults: CheckResult[] = []

  for (const skill of targets) {
    const r = await checkSkill(skill)
    allResults.push(r)
  }

  let passed = 0
  let failed = 0
  for (const r of allResults) {
    console.log(`\n# ${r.skill}`)
    for (const c of r.checks) {
      const icon = c.passed ? "✓" : "✗"
      console.log(`  ${icon} ${c.name}: ${c.detail}`)
      if (c.passed) passed++
      else failed++
    }
  }

  console.log(`\n=== Summary: ${passed} passed / ${failed} failed (${allResults.length} skills) ===`)

  if (strict && failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})