import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

import { ResourceIntegrityCore } from "../src/main/resource-integrity-core"

if (process.platform !== "win32") throw new Error("Packaged Windows verification must run on Windows")

const packageDir = path.resolve(import.meta.dirname, "..")
// 与 electron-builder.config.ts 的 directories.output 保持一致
const root = path.join(packageDir, "dist", "xiaoxue-output", "win-unpacked")
const resources = path.join(root, "resources")
// 与 electron-builder.config.ts 的 productName 映射一致：prod 通道的主程序
// 名为"录井小雪.exe"，不带 Dev/Beta 后缀
const productName =
  process.env.OPENCODE_CHANNEL === "prod"
    ? "录井小雪"
    : process.env.OPENCODE_CHANNEL === "beta"
      ? "录井小雪 Beta"
      : "录井小雪 Dev"
const required = [
  path.join(root, `${productName}.exe`),
  path.join(resources, "app.asar"),
  path.join(resources, "integrity.json"),
  path.join(resources, "skills"),
  path.join(resources, "obsidian-plugin", "manifest.json"),
  path.join(resources, "python", "python.exe"),
  path.join(resources, "python", "xiaoxue_runtime_check.py"),
  path.join(resources, "python", "pdf_extract.py"),
  path.join(resources, "python", "Lib", "site-packages", "rapidocr", "models", "PP-OCRv6_det_small.onnx"),
  path.join(resources, "python", "Lib", "site-packages", "rapidocr", "models", "PP-OCRv6_rec_small.onnx"),
  path.join(
    resources,
    "app.asar.unpacked",
    "node_modules",
    "@lydell",
    "node-pty-win32-x64",
    "prebuilds",
    "win32-x64",
    "conpty.node",
  ),
]

required.forEach((file) => {
  if (!existsSync(file)) throw new Error(`Packaged Windows dependency is missing: ${file}`)
})

// 在非 Electron 运行时中，electron 包导出的是可执行文件路径字符串；但其类型
// 声明只描述应用内的 API 模块（CrossProcessExports），因此从 unknown 收窄。
const electronExport: unknown = createRequire(import.meta.url)("electron")
const executable = typeof electronExport === "string" ? electronExport : undefined
if (!executable || !existsSync(executable)) throw new Error("Electron runtime is unavailable for ASAR verification")

const manifest = (await Bun.file(path.join(resources, "integrity.json")).json()) as unknown
if (!ResourceIntegrityCore.isManifest(manifest))
  throw new Error("Packaged resources contain an invalid integrity manifest")
ResourceIntegrityCore.verify("skills", path.join(resources, "skills"), manifest)
ResourceIntegrityCore.verify("obsidian-plugin", path.join(resources, "obsidian-plugin"), manifest)
ResourceIntegrityCore.verify("python", path.join(resources, "python"), manifest)

const appAudit = Bun.spawn(
  [
    executable,
    "-e",
    [
      'const fs = require("node:fs")',
      'const path = require("node:path")',
      "const files = []",
      "const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {",
      "  const target = path.join(directory, entry.name)",
      "  if (entry.isDirectory()) return walk(target)",
      '  if (entry.name.endsWith(".js")) files.push(target)',
      "})",
      'walk(path.join(process.argv[1], "out"))',
      'const source = files.map((file) => fs.readFileSync(file, "utf8")).join("\\n")',
      "process.stdout.write(JSON.stringify({",
      '  doc: source.includes("application/msword"),',
      '  docx: source.includes("wordprocessingml.document"),',
      '  parser: source.includes("word-extractor"),',
      '  officeExtraction: source.includes("Extracted Office document"),',
      '  managedSkills: source.includes(".xiaoxue") && source.includes("skills"),',
      "}))",
    ].join("\n"),
    path.join(resources, "app.asar"),
  ],
  {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdout: "pipe",
    stderr: "pipe",
  },
)
const [appAuditText, appAuditError, appAuditCode] = await Promise.all([
  new Response(appAudit.stdout).text(),
  new Response(appAudit.stderr).text(),
  appAudit.exited,
])
if (appAuditCode !== 0) throw new Error(`Packaged application audit failed\n${appAuditError.trim()}`)
const appFeatures = JSON.parse(appAuditText) as Record<string, boolean>
const missingFeatures = Object.entries(appFeatures).flatMap(([name, present]) => (present ? [] : [name]))
if (missingFeatures.length) {
  throw new Error(`Packaged application is missing required features: ${missingFeatures.join(", ")}`)
}

const python = path.join(resources, "python")
const runtime = Bun.spawn([path.join(python, "python.exe"), path.join(python, "xiaoxue_runtime_check.py")], {
  env: {
    ...process.env,
    PYTHONHOME: python,
    PYTHONNOUSERSITE: "1",
    PYTHONUTF8: "1",
  },
  stdout: "pipe",
  stderr: "pipe",
})
const [runtimeText, runtimeError, runtimeCode] = await Promise.all([
  new Response(runtime.stdout).text(),
  new Response(runtime.stderr).text(),
  runtime.exited,
])
if (runtimeCode !== 0) throw new Error(`Packaged Python verification failed\n${runtimeError.trim()}`)

const result = JSON.parse(runtimeText) as {
  python: string
  packages: Record<string, string>
  pdfExtraction: boolean
  pdfOcr: boolean
}
if (!result.pdfExtraction) throw new Error("Packaged Python PDF extraction smoke test did not pass")
if (!result.pdfOcr) throw new Error("Packaged Python offline PDF OCR smoke test did not pass")
console.log(
  `Verified packaged Windows resources: ${manifest.files.length} integrity entries, Word DOC/DOCX pipeline, PDF text extraction and offline OCR, managed skills, Python ${result.python}, ${Object.keys(result.packages).length} Python dependencies`,
)
