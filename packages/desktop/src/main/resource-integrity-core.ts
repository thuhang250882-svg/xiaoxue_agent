export * as ResourceIntegrityCore from "./resource-integrity-core"

import { createHash } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

export type Manifest = {
  version: number
  files: Array<{ path: string; sha256: string }>
}

export function verify(prefix: string, directory: string, manifest: Manifest) {
  const expected = manifest.files
    .filter((file) => file.path.startsWith(`${prefix}/`))
    .map((file) => ({ ...file, relative: file.path.slice(prefix.length + 1) }))
    .toSorted((left, right) => left.relative.localeCompare(right.relative))
  const actual = walk(directory).map((file) => path.relative(directory, file).replaceAll("\\", "/")).toSorted()
  if (!expected.length || expected.length !== actual.length) {
    throw new Error(`打包资源完整性校验失败：${prefix} 文件数量不一致。`)
  }
  expected.forEach((file, index) => {
    if (file.relative !== actual[index]) throw new Error(`打包资源完整性校验失败：${prefix}/${file.relative}`)
    const digest = createHash("sha256").update(readFileSync(path.join(directory, file.relative))).digest("hex")
    if (digest !== file.sha256) throw new Error(`打包资源完整性校验失败：${prefix}/${file.relative}`)
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

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const location = path.join(directory, entry.name)
    if (entry.isDirectory()) return walk(location)
    return entry.isFile() ? [location] : []
  })
}
