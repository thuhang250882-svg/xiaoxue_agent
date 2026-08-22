#!/usr/bin/env bun
/**
 * RC6 E2E Trigger 互斥验证 harness
 *
 * 不依赖真实 model, 仅静态分析 description 关键词,
 * 模拟 Acceptance Matrix 第 6 节的 "Trigger 互斥验收"。
 *
 * 用法:
 *   bun ./scripts/rc6-e2e/trigger-mutex.ts
 */

// @ts-ignore -- bun runtime global
const BunGlobal = (globalThis as { Bun?: { YAML?: { parse: (s: string) => unknown } } }).Bun

import { readFile } from "node:fs/promises"
import { join, resolve } from "node:path"

const ROOT = resolve(import.meta.dir, "..", "..")
const SKILLS_DIR = join(ROOT, ".opencode", "skills")

interface TriggerCase {
  task: string
  expected: string
  matchSkill?: string
}

const TRIGGER_CASES: TriggerCase[] = [
  { task: "帮我审核这份招标文件", expected: "tender-document-review" },
  { task: "看看有没有废标风险", expected: "tender-document-review" },
  { task: "帮我生成这份标书", expected: "tender-bid-generation" },
  { task: "帮我写技术响应部分", expected: "tender-bid-generation" },
  { task: "帮我审核这个合同", expected: "审查合同" },
  { task: "帮我整理合同履约时间表", expected: "审查合同" },
  { task: "帮我总结这些标准", expected: "knowledge-distill" },
  { task: "把这些规范整理进知识库", expected: "knowledge-distill" },
  { task: "帮我查这个地质规定", expected: "geology-knowledge" },
  { task: "帮我审核这份录井报告", expected: "mud-logging-review" },
]

function parseFrontmatter(content: string): { name?: string; description?: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const yaml = match[1] ?? ""
  if (BunGlobal?.YAML?.parse) {
    try {
      const parsed = BunGlobal.YAML.parse(yaml)
      if (parsed && typeof parsed === "object") {
        const r = parsed as Record<string, unknown>
        return {
          name: typeof r.name === "string" ? r.name : undefined,
          description: typeof r.description === "string" ? r.description : undefined,
        }
      }
    } catch {}
  }
  return {}
}

async function loadSkillDescriptions(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const fs = await import("node:fs/promises")
  const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true })
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const p = join(SKILLS_DIR, e.name, "SKILL.md")
    try {
      const content = await readFile(p, "utf8")
      const fm = parseFrontmatter(content)
      if (fm.description) map.set(e.name, fm.description)
    } catch {}
  }
  return map
}

function scoreMatch(task: string, skillName: string, desc: string): number {
  let score = 0
  const t = task.toLowerCase()
  const d = desc.toLowerCase()

  const keywords: Record<string, string[]> = {
    审查合同: [
      "合同", "审核", "审查", "履约", "条款", "责任", "签约",
      "审查合同", "合同审查", "审一下合同", "合同能签", "合同有问题",
      "看看合同", "合同风险", "合同有没有坑",
    ],
    "tender-document-review": [
      "招标", "审核", "审查", "废标", "投标", "否决", "响应", "风险",
      "招标文件", "招标公告", "评分办法", "技术规范", "投标文件",
      "招标响应", "投标响应", "投标", "标书",
    ],
    "tender-bid-generation": [
      "标书", "生成", "响应", "技术标", "商务标", "编制", "撰写",
      "写标书", "生成投标文件", "编制投标响应", "生成技术标", "生成商务标",
      "生成草稿", "生成响应",
    ],
    "knowledge-distill": [
      "总结", "知识库", "整理", "规范", "标准", "归纳", "入库",
      "蒸馏知识", "总结规范", "把资料整理", "提取可追溯事实",
      "识别资料冲突", "建立知识卡片", "整理资料", "知识蒸馏",
    ],
    "geology-knowledge": [
      "地质", "规定", "查询", "规范", "标准",
      "地质规定", "地质规范", "地质标准",
    ],
    "geolog-logging-review": [
      "录井", "审核", "报告", "审查", "评价",
      "录井报告", "录井审核", "录井评价", "录井审核报告",
      "mud-logging-review", "mud logging review",
    ],
    "mud-logging-review": [
      "录井", "审核", "报告", "审查", "评价",
      "录井报告", "录井审核", "录井评价", "录井审核报告",
    ],
  }

  const words = keywords[skillName] ?? []
  for (const w of words) {
    if (t.includes(w.toLowerCase())) score += 1
    if (d.includes(w.toLowerCase())) score += 0.5
  }

  if (t.includes(skillName.toLowerCase())) score += 5

  return score
}

async function main() {
  const descs = await loadSkillDescriptions()
  console.log(`Loaded ${descs.size} skill descriptions\n`)

  const CORE_SKILLS = new Set([
    "审查合同",
    "knowledge-distill",
    "tender-document-review",
    "tender-bid-generation",
  ])

  let passed = 0
  let failed = 0
  let corePassed = 0
  let coreFailed = 0
  let referencePassed = 0
  let referenceFailed = 0

  for (const tc of TRIGGER_CASES) {
    let bestScore = 0
    let bestMatch: string | null = null
    const matches: Array<{ name: string; score: number }> = []

    for (const [name, desc] of descs) {
      const s = scoreMatch(tc.task, name, desc)
      if (s > 0) matches.push({ name, score: s })
      if (s > bestScore) {
        bestScore = s
        bestMatch = name
      }
    }

    const ok = bestMatch === tc.expected
    const isCoreExpected = CORE_SKILLS.has(tc.expected)
    const icon = ok ? "✓" : "✗"
    const tag = isCoreExpected ? "[core]" : "[reference]"
    console.log(
      `  ${icon} ${tag} "${tc.task}" → expected: ${tc.expected}, actual: ${bestMatch ?? "(none)"} (score=${bestScore.toFixed(2)})`
    )
    if (matches.length > 1) {
      console.log(`    candidates: ${matches.map((m) => `${m.name}(${m.score.toFixed(1)})`).join(", ")}`)
    }
    if (ok) {
      passed++
      if (isCoreExpected) corePassed++
      else referencePassed++
    } else {
      failed++
      if (isCoreExpected) coreFailed++
      else referenceFailed++
    }
  }

  console.log(`\n=== Trigger mutex: ${passed} passed / ${failed} failed ===`)
  console.log(`  - Core RC6 business skills: ${corePassed}/${corePassed + coreFailed}`)
  console.log(`  - Reference skills: ${referencePassed}/${referencePassed + referenceFailed}`)
  if (coreFailed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})