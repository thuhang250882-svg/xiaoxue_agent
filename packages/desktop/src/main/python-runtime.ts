import { existsSync } from "node:fs"
import path from "node:path"

export type BundledPythonRuntime = {
  root: string
  executable: string
  manifest: string
  pathKey: string
  path: string
}

export function resolveBundledPython(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): BundledPythonRuntime | undefined {
  if (process.platform !== "win32") return
  const executable = path.join(root, "python.exe")
  if (!existsSync(executable)) return
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH"
  const current = env[pathKey] ?? ""
  const entries = [root, path.join(root, "Scripts"), ...current.split(path.delimiter)]
    .filter(Boolean)
    .filter((entry, index, items) => items.findIndex((item) => item.toLowerCase() === entry.toLowerCase()) === index)

  return {
    root,
    executable,
    manifest: path.join(root, "xiaoxue-runtime.json"),
    pathKey,
    path: entries.join(path.delimiter),
  }
}

export function configureBundledPython(root: string) {
  const runtime = resolveBundledPython(root)
  if (!runtime) return
  Object.assign(process.env, {
    [runtime.pathKey]: runtime.path,
    XIAOXUE_PYTHON: runtime.executable,
    XIAOXUE_PYTHON_HOME: runtime.root,
    PYTHONHOME: runtime.root,
    PYTHONIOENCODING: "utf-8",
    PYTHONNOUSERSITE: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONUTF8: "1",
  })
  return runtime
}
