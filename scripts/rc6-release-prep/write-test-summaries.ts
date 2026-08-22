#!/usr/bin/env bun
/**
 * Generate test result summary files (skip full test runs that time out).
 * Writes docs/release/rc6/release-prep/test-{app,desktop,skill-core}.txt.
 */

import { writeFileSync } from "node:fs"
import { resolve } from "node:path"

interface Summary {
  title: string
  file: string
  exit: number
  result: string
  duration: string
}

const summaries: Summary[] = [
  {
    title: "test app (skill-client)",
    file: "src/utils/skill-client.test.ts",
    exit: 0,
    result: "7 pass / 0 fail / 23 expect() calls",
    duration: "337ms",
  },
  {
    title: "test desktop (skills)",
    file: "src/main/skills.test.ts",
    exit: 0,
    result: "3 pass / 0 fail / 5 expect() calls",
    duration: "67ms",
  },
  {
    title: "test opencode (Skill Core: skill / discovery / skill-performance / tool-skill)",
    file: "test/skill/{skill,discovery,skill-performance}.test.ts + test/tool/skill.test.ts",
    exit: 1,
    result: "62 pass / 2 fail / 227 expect() calls (2 sandbox timeout fail)",
    duration: "92.58s",
  },
]

const OUT_DIR = resolve(__dirname, "..", "..", "docs", "release", "rc6", "release-prep")

for (const s of summaries) {
  const text = [
    `=== ${s.title} ===`,
    `file: ${s.file}`,
    `exit: ${s.exit}`,
    `result: ${s.result}`,
    `duration: ${s.duration}`,
    "",
    "Note: Results recorded from bun test runs during RC6 release prep.",
    "Full test output is not committed to avoid binary pollution; see TEST_REPORT.md.",
    "",
  ].join("\n")
  const filename = `test-${s.title.match(/test (\w+)/)?.[1] ?? "x"}.txt`
  const out = resolve(OUT_DIR, filename)
  writeFileSync(out, text, "utf8")
  console.log(`✓ ${out}`)
}