export * as ResourceIntegrityCore from "./resource-integrity-core"

import { createHash } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

export type Manifest = {
  version: number
  files: Array<{ path: string; sha256: string }>
}

const ignoredNames = new Set([".DS_Store", ".gitkeep", "Thumbs.db", "desktop.ini"])
const ignoredSuffixes = [".pyc", ".pyo"]

export function isIgnoredPath(relative: string) {
  const normalized = relative.replaceAll("\\", "/")
  const parts = normalized.split("/")
  const name = parts.at(-1) ?? ""
  return (
    ignoredNames.has(name) ||
    parts.includes("__pycache__") ||
    ignoredSuffixes.some((suffix) => name.toLowerCase().endsWith(suffix)) ||
    normalized === "xiaoxue-runtime.json"
  )
}

export function verify(prefix: string, directory: string, manifest: Manifest) {
  // 中文文件名在 localeCompare 与码元排序下顺序不同，必须用 Map 比对而非并行排序数组。
  const expected = new Map(
    manifest.files
      .filter((file) => file.path.startsWith(`${prefix}/`))
      .map((file) => [file.path.slice(prefix.length + 1), file.sha256]),
  )
  const actual = walk(directory).map((file) => path.relative(directory, file).replaceAll("\\", "/"))
  if (!expected.size || expected.size !== actual.length) {
    throw new Error(`打包资源完整性校验失败：${prefix} 文件数量不一致。`)
  }
  actual.forEach((relative) => {
    const sha256 = expected.get(relative)
    if (!sha256) throw new Error(`打包资源完整性校验失败：${prefix}/${relative}`)
    const digest = createHash("sha256")
      .update(readFileSync(path.join(directory, relative)))
      .digest("hex")
    if (digest !== sha256) throw new Error(`打包资源完整性校验失败：${prefix}/${relative}`)
  })
}

export function isManifest(value: unknown): value is Manifest {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    value.version === 1 &&
    "files" in value &&
    Array.isArray(value.files) &&
    value.files.every(
      (file) =>
        typeof file === "object" &&
        file !== null &&
        "path" in file &&
        typeof file.path === "string" &&
        "sha256" in file &&
        typeof file.sha256 === "string" &&
        /^[a-f0-9]{64}$/.test(file.sha256),
    )
  )
}

function walk(directory: string, root = directory): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const location = path.join(directory, entry.name)
    if (isIgnoredPath(path.relative(root, location))) return []
    if (entry.isDirectory()) return walk(location, root)
    return entry.isFile() ? [location] : []
  })
}
