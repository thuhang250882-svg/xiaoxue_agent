import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"

if (process.platform !== "win32") throw new Error("The bundled office Python runtime is currently Windows-only")

const packageDir = path.resolve(import.meta.dirname, "..")
const source = Bun.env.XIAOXUE_PYTHON_SOURCE ?? "python"
const destination = path.join(packageDir, "resources", "python")
const requirements = path.join(packageDir, "python", "requirements-windows.lock")
const smokeScript = path.join(packageDir, "python", "smoke.py")
const pdfExtractor = path.join(packageDir, "python", "pdf_extract.py")
const base = (await run([source, "-c", "import sys; print(sys.base_prefix)"])).trim()

await rm(destination, { recursive: true, force: true })
await mkdir(destination, { recursive: true })

const rootFiles = (await readdir(base, { withFileTypes: true }))
  .filter(
    (entry) =>
      entry.isFile() &&
      (/^python(?:w)?\.exe$/i.test(entry.name) ||
        /^python\d+\.dll$/i.test(entry.name) ||
        /^vcruntime\d+(?:_\d+)?\.dll$/i.test(entry.name) ||
        entry.name === "LICENSE.txt"),
  )
  .map((entry) => entry.name)

await Promise.all(rootFiles.map((name) => cp(path.join(base, name), path.join(destination, name))))
await Promise.all(
  ["DLLs", "Lib"].map((name) =>
    cp(path.join(base, name), path.join(destination, name), {
      recursive: true,
      filter: (sourcePath) => {
        const relative = path.relative(base, sourcePath).toLowerCase()
        const parts = relative.split(path.sep)
        if (parts.includes("site-packages")) return false
        if (parts.some((part) => ["__pycache__", "idlelib", "tkinter", "ensurepip", "test", "tests"].includes(part)))
          return false
        return !relative.endsWith(".pyc")
      },
    }),
  ),
)

await cp(smokeScript, path.join(destination, "xiaoxue_runtime_check.py"))
await cp(pdfExtractor, path.join(destination, "pdf_extract.py"))

const pip = [
  source,
  "-m",
  "pip",
  "install",
  "--disable-pip-version-check",
  "--no-compile",
  "--target",
  path.join(destination, "Lib", "site-packages"),
  "--requirement",
  requirements,
]
if (Bun.env.XIAOXUE_PYTHON_WHEELHOUSE) {
  pip.push("--no-index", "--find-links", Bun.env.XIAOXUE_PYTHON_WHEELHOUSE)
}
await run(pip)

const executable = path.join(destination, "python.exe")
const smoke = await run([executable, path.join(destination, "xiaoxue_runtime_check.py")], {
  ...process.env,
  PYTHONHOME: destination,
  PYTHONNOUSERSITE: "1",
  PYTHONUTF8: "1",
})
const details = JSON.parse(smoke) as { python: string; packages: Record<string, string> }
await writeFile(
  path.join(destination, "xiaoxue-runtime.json"),
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      architecture: process.arch,
      ...details,
    },
    null,
    2,
  ),
)

console.log(`Prepared Xiaoxue Python ${details.python} with ${Object.keys(details.packages).length} document packages`)

async function run(command: string[], env: NodeJS.ProcessEnv = process.env) {
  const child = Bun.spawn(command, { env, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code === 0) return stdout
  throw new Error(`${command.join(" ")} failed with exit code ${code}\n${stderr.trim()}`)
}
