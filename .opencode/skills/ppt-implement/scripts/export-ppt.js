#!/usr/bin/env node

const fs = require("fs")
const path = require("path")
const { spawnSync } = require("child_process")

const skillDir = path.resolve(process.argv[2] || process.env.XIAOXUE_PPT_SKILL_DIR || "")
const workspaceDir = path.resolve(process.argv[3] || process.env.XIAOXUE_WORKSPACE_DIR || "")
if (!process.argv[2] || !process.argv[3] || !fs.existsSync(path.join(skillDir, "SKILL.md"))) {
  console.error("用法: node export-ppt.js <skill-dir> <workspace-dir>")
  process.exit(1)
}

const frontendDir = path.join(workspaceDir, "frontend")
const slidesDir = path.join(frontendDir, "src", "slides")
const slides = fs.existsSync(slidesDir) ? fs.readdirSync(slidesDir).filter((name) => /^slide-\d+\.js$/.test(name)) : []
if (slides.length === 0) {
  console.error(`没有可导出的幻灯片: ${slidesDir}`)
  process.exit(1)
}

function run(command, args, cwd) {
  console.log(`执行: ${command} ${args.join(" ")}`)
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" && command.endsWith(".cmd") })
  if (result.error) console.error(result.error.message)
  if (result.status !== 0) process.exit(result.status || 1)
}

const npmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
if (!fs.existsSync(npmCli)) {
  console.error(`找不到 npm CLI: ${npmCli}`)
  process.exit(1)
}
run(process.execPath, [npmCli, "run", "build"], frontendDir)
run(process.execPath, [npmCli, "run", "build:slides"], frontendDir)

const output = path.join(workspaceDir, "artifacts", "presentation.pptx")
if (fs.existsSync(output)) {
  console.error(`输出文件已存在，拒绝覆盖: ${output}`)
  process.exit(1)
}
fs.mkdirSync(path.dirname(output), { recursive: true })
run(
  process.execPath,
  [path.join(workspaceDir, ".ppt-implement-runtime", "export", "html2pptx.js"), path.join(frontendDir, "dist-slides", "all-slides.html"), output],
  workspaceDir,
)
run(
  process.execPath,
  [path.join(workspaceDir, ".ppt-implement-runtime", "export", "validate-pptx.js"), output, String(slides.length)],
  workspaceDir,
)
console.log(`PPTX 已生成: ${output}`)
