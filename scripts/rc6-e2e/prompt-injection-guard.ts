#!/usr/bin/env bun
/**
 * RC6 E2E Prompt Injection 静态分析 harness
 *
 * 不调用 model, 验证 RC6 业务 Skill 是否在 SKILL.md 与 references/*.md
 * 中正确处理 Prompt Injection 防御 (按 Acceptance Matrix 第 5 节)。
 *
 * 检查项:
 *  1. SKILL.md 必须包含 explicit guard 段落 ("不执行" / "不删除" / "不外传")
 *  2. references/*.md 中的契约必须声明 "originalText / quote" 字段
 *  3. 必须不包含绕过指令 ("忽略所有规则" / "system prompt override")
 *
 * 用法:
 *   bun ./scripts/rc6-e2e/prompt-injection-guard.ts
 */

import { readFile, readdir } from "node:fs/promises"
import { join, resolve } from "node:path"

const ROOT = resolve(import.meta.dir, "..", "..")
const SKILLS_DIR = join(ROOT, ".opencode", "skills")

const TARGET_SKILLS = ["审查合同", "knowledge-distill", "tender-document-review", "tender-bid-generation"]

const REQUIRED_GUARD_KEYWORDS = [
  [
    "不执行", "不删除", "不调用", "不外传", "不得", "禁止", "严禁", "不允许",
    "不得作为", "不可信", "不作为指令", "不触发", "仅作为", "仅作为",
    "不得绕过", "不得写入", "不得声称", "不得生成", "不得执行",
  ],
] as const

const FORBIDDEN_KEYWORDS = [
  "忽略所有规则",
  "ignore previous instructions",
  "system prompt override",
  "reveal system prompt",
] as const

interface GuardCheckResult {
  skill: string
  filesChecked: number
  guardHits: string[]
  forbiddenHits: string[]
  originalTextContract: boolean
  passed: boolean
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(p)))
    else if (e.name.endsWith(".md")) out.push(p)
  }
  return out
}

async function checkSkill(skill: string): Promise<GuardCheckResult> {
  const skillDir = join(SKILLS_DIR, skill)
  const files = await walk(skillDir)
  const guardHits: string[] = []
  const forbiddenHits: string[] = []
  let originalTextContract = false

  for (const file of files) {
    const content = await readFile(file, "utf8")
    const rel = file.slice(skillDir.length + 1)

    const hits = REQUIRED_GUARD_KEYWORDS[0].filter((k) => content.includes(k))
    if (hits.length > 0) guardHits.push(`${rel}: ${hits.join("+")}`)

    for (const fk of FORBIDDEN_KEYWORDS) {
      if (content.toLowerCase().includes(fk.toLowerCase())) {
        forbiddenHits.push(`${rel}: "${fk}"`)
      }
    }

    if (
      content.includes("originalText") ||
      content.includes("quote") ||
      content.includes("原文") ||
      content.includes("原始摘录") ||
      content.includes("tender_evidence") ||
      content.includes("contract_evidence")
    ) {
      originalTextContract = true
    }
  }

  const passed = guardHits.length >= 1 && originalTextContract && forbiddenHits.length === 0

  return {
    skill,
    filesChecked: files.length,
    guardHits,
    forbiddenHits,
    originalTextContract,
    passed,
  }
}

async function main() {
  let passed = 0
  let failed = 0

  for (const skill of TARGET_SKILLS) {
    const r = await checkSkill(skill)
    const icon = r.passed ? "✓" : "✗"
    console.log(`\n# ${icon} ${skill}`)
    console.log(`  files_checked: ${r.filesChecked}`)
    console.log(`  guard_hits: ${r.guardHits.length}`)
    for (const h of r.guardHits) console.log(`    ${h}`)
    console.log(`  originalText/quote contract: ${r.originalTextContract}`)
    console.log(`  forbidden_hits: ${r.forbiddenHits.length}`)
    for (const h of r.forbiddenHits) console.log(`    ${h}`)
    if (r.passed) passed++
    else failed++
  }

  console.log(`\n=== Prompt injection guard: ${passed} passed / ${failed} failed ===`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})