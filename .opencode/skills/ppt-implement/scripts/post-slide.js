#!/usr/bin/env node

const fs = require("fs")
const path = require("path")

const workspaceDir = path.resolve(process.argv[2] || process.env.XIAOXUE_WORKSPACE_DIR || "")
const filePath = path.resolve(process.argv[3] || "")
if (!process.argv[2] || !process.argv[3]) {
  console.error("用法: node post-slide.js <workspace-dir> <slide-file>")
  process.exit(1)
}

const slidesDir = path.join(workspaceDir, "frontend", "src", "slides")
const relative = path.relative(slidesDir, filePath).replaceAll("\\", "/")
const match = /^slide-(\d+)\.js$/.exec(relative)
if (!match || !fs.existsSync(filePath)) {
  console.error(`幻灯片文件无效: ${filePath}`)
  process.exit(1)
}

const indexPath = path.join(workspaceDir, "frontend", "index.html")
const tag = `<script type="module" src="/src/slides/${relative}"></script>`
const index = fs.readFileSync(indexPath, "utf8")
if (!index.includes(tag)) {
  fs.writeFileSync(indexPath, index.replace("</body>", `    ${tag}\n  </body>`))
}

const pagesPath = path.join(workspaceDir, "docs", "pages.json")
fs.mkdirSync(path.dirname(pagesPath), { recursive: true })
const pages = fs.existsSync(pagesPath) ? JSON.parse(fs.readFileSync(pagesPath, "utf8")) : []
const pageNum = Number(match[1])
const next = pages.filter((page) => page.pageNum !== pageNum)
next.push({ pageKey: `ppt-${pageNum}`, title: "", url: `/index.html?page=${pageNum}`, poster: "", pageNum })
next.sort((a, b) => a.pageNum - b.pageNum)
fs.writeFileSync(pagesPath, JSON.stringify(next, null, 2))
console.log(`已登记 slide-${pageNum}.js`)
