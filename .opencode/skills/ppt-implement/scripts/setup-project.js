#!/usr/bin/env node

const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const { spawnSync } = require("child_process")

const skillDir = path.resolve(process.argv[2] || process.env.XIAOXUE_PPT_SKILL_DIR || "")
const workspaceDir = path.resolve(process.argv[3] || process.env.XIAOXUE_WORKSPACE_DIR || "")

if (!process.argv[2] || !process.argv[3]) {
  console.error("用法: node setup-project.js <skill-dir> <workspace-dir>")
  process.exit(1)
}

if (!fs.existsSync(path.join(skillDir, "SKILL.md"))) {
  console.error(`技能目录无效: ${skillDir}`)
  process.exit(1)
}

const frontendDir = path.join(workspaceDir, "frontend")
const projectFile = path.join(workspaceDir, "docs", "project.json")
if (fs.existsSync(frontendDir) && !fs.existsSync(projectFile)) {
  console.error(`目标已存在且不是 ppt-implement 工程，拒绝覆盖: ${frontendDir}`)
  process.exit(1)
}

fs.mkdirSync(workspaceDir, { recursive: true })
if (!fs.existsSync(frontendDir)) {
  fs.cpSync(path.join(skillDir, "templates", "frontend"), frontendDir, { recursive: true })
}

const runtimeDir = path.join(workspaceDir, ".ppt-implement-runtime", "export")
fs.mkdirSync(path.dirname(runtimeDir), { recursive: true })
fs.cpSync(path.join(skillDir, "scripts", "export"), runtimeDir, { recursive: true, force: true })

fs.mkdirSync(path.dirname(projectFile), { recursive: true })
fs.writeFileSync(projectFile, JSON.stringify({ project_type: "ppt", sub_project_type: "ppt" }, null, 2))

function install(directory) {
  const lockFile = path.join(directory, "package-lock.json")
  if (!fs.existsSync(lockFile)) {
    console.error(`缺少依赖锁文件，拒绝进行不可复现安装: ${lockFile}`)
    process.exit(1)
  }
  const lockHash = crypto.createHash("sha256").update(fs.readFileSync(lockFile)).digest("hex")
  const marker = path.join(directory, "node_modules", ".xiaoxue-package-lock.sha256")
  if (fs.existsSync(marker) && fs.readFileSync(marker, "utf8").trim() === lockHash) return
  const npmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
  if (!fs.existsSync(npmCli)) {
    console.error(`找不到 npm CLI: ${npmCli}`)
    process.exit(1)
  }
  const result = spawnSync(process.execPath, [npmCli, "ci", "--no-audit", "--no-fund"], {
    cwd: directory,
    stdio: "inherit",
    shell: false,
    timeout: 15 * 60 * 1000,
  })
  if (result.error) console.error(result.error.message)
  if (result.status !== 0) {
    console.error(`依赖安装失败: ${directory}。请检查依赖源或网络后重试；工程未进入可导出状态。`)
    process.exit(result.status || 1)
  }
  fs.writeFileSync(marker, lockHash + "\n")
}

function installChromium(directory) {
  const cli = path.join(directory, "node_modules", "playwright", "cli.js")
  if (!fs.existsSync(cli)) {
    console.error(`找不到 Playwright CLI: ${cli}`)
    process.exit(1)
  }
  const result = spawnSync(process.execPath, [cli, "install", "chromium"], {
    cwd: directory,
    stdio: "inherit",
    shell: false,
    timeout: 15 * 60 * 1000,
  })
  if (result.error) console.error(result.error.message)
  if (result.status !== 0) process.exit(result.status || 1)
}

install(frontendDir)
install(runtimeDir)
installChromium(runtimeDir)
console.log(`ppt-implement 工程已就绪: ${workspaceDir}`)
