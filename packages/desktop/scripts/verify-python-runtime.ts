import { existsSync } from "node:fs"
import path from "node:path"

if (process.platform !== "win32") process.exit(0)

const root = path.resolve(import.meta.dirname, "..", "resources", "python")
const executable = path.join(root, "python.exe")
const smoke = path.join(root, "xiaoxue_runtime_check.py")
const manifest = path.join(root, "xiaoxue-runtime.json")

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
console.log(`Verified Xiaoxue Python ${result.python}: ${Object.keys(result.packages).join(", ")}`)
