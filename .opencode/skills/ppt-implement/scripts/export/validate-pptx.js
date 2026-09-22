#!/usr/bin/env node

const fs = require("fs")
const JSZip = require("jszip")

async function main() {
  const file = process.argv[2]
  const expected = Number(process.argv[3])
  if (!file || !Number.isInteger(expected) || expected < 1 || !fs.existsSync(file)) {
    throw new Error("用法: node validate-pptx.js <pptx-file> <expected-slide-count>")
  }
  const archive = await JSZip.loadAsync(fs.readFileSync(file))
  const actual = Object.keys(archive.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length
  if (actual !== expected) throw new Error(`PPTX 页数不符：期望 ${expected}，实际 ${actual}`)
  console.log(`PPTX 结构校验通过：${actual} 页`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
