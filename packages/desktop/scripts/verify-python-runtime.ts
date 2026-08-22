import { existsSync } from "node:fs"
import path from "node:path"

import { assertPythonVersion, loadPinnedPythonVersion } from "./python-runtime-spec"

if (process.platform !== "win32") process.exit(0)

const packageDir = path.resolve(import.meta.dirname, "..")
const root = path.join(packageDir, "resources", "python")
const executable = path.join(root, "python.exe")
const smoke = path.join(root, "xiaoxue_runtime_check.py")
const manifest = path.join(root, "xiaoxue-runtime.json")
const versionSpecPath = path.join(packageDir, "python", "PYTHON_VERSION")

const pinnedVersion = loadPinnedPythonVersion(versionSpecPath)

for (const file of [executable, smoke, manifest]) {
  if (existsSync(file)) continue
  throw new Error(`Bundled Python runtime is incomplete: ${file}. Run bun run python:prepare first.`)
}

const child = Bun.spawn([executable, smoke], {
  env: {
    ...process.env,
    PYTHONHOME: root,
    PYTHONNOUSERSITE: "1",
    PYTHONUTF8: "1",
  },
  stdout: "pipe",
  stderr: "pipe",
})
const [stdout, stderr, code] = await Promise.all([
  new Response(child.stdout).text(),
  new Response(child.stderr).text(),
  child.exited,
])
if (code !== 0) throw new Error(`Bundled Python verification failed\n${stderr.trim()}`)

const result = JSON.parse(stdout) as { python: string; packages: Record<string, string> }
assertPythonVersion(
  result.python,
  pinnedVersion,
  `Rebuild the runtime with bun run python:prepare against the pinned interpreter.`,
)
console.log(
  `Verified Xiaoxue Python ${result.python} (matches PYTHON_VERSION): ${Object.keys(result.packages).join(", ")}`,
)
