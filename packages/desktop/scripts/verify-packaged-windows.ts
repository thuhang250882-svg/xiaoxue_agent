import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

import { ResourceIntegrityCore } from "../src/main/resource-integrity-core"

if (process.platform !== "win32") throw new Error("Packaged Windows verification must run on Windows")

const packageDir = path.resolve(import.meta.dirname, "..")
// 与 electron-builder.config.ts 的 directories.output 保持一致
const root = path.join(packageDir, "dist", "xiaoxue-output", "win-unpacked")
const resources = path.join(root, "resources")
const required = [
  path.join(root, "录井小雪 Dev.exe"),
  path.join(resources, "app.asar"),
  path.join(resources, "skills"),
  path.join(resources, "obsidian-plugin", "manifest.json"),
  path.join(resources, "python", "python.exe"),
  path.join(resources, "python", "xiaoxue_runtime_check.py"),
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

const manifestReader = Bun.spawn(
  [
    executable,
    "-e",
    'process.stdout.write(require("node:fs").readFileSync(process.argv[1], "utf8"))',
    path.join(resources, "app.asar", "resources", "integrity.json"),
  ],
  {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdout: "pipe",
    stderr: "pipe",
  },
)
const [manifestText, manifestError, manifestCode] = await Promise.all([
  new Response(manifestReader.stdout).text(),
  new Response(manifestReader.stderr).text(),
  manifestReader.exited,
])
if (manifestCode !== 0) throw new Error(`Packaged ASAR manifest verification failed\n${manifestError.trim()}`)

const manifest = JSON.parse(manifestText) as unknown
if (!ResourceIntegrityCore.isManifest(manifest)) throw new Error("Packaged ASAR contains an invalid resource manifest")
ResourceIntegrityCore.verify("skills", path.join(resources, "skills"), manifest)
ResourceIntegrityCore.verify("obsidian-plugin", path.join(resources, "obsidian-plugin"), manifest)

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

const result = JSON.parse(runtimeText) as { python: string; packages: Record<string, string> }
console.log(
  `Verified packaged Windows resources: ${manifest.files.length} integrity entries, Word DOC/DOCX pipeline, managed skills, Python ${result.python}, ${Object.keys(result.packages).length} Python dependencies`,
)
