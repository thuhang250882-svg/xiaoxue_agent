import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import { ResourceIntegrityCore } from "../src/main/resource-integrity-core"

const packageDir = path.resolve(import.meta.dir, "..")
const pythonRuntimeDir = process.env.XIAOXUE_PYTHON_RUNTIME_DIR
  ? path.resolve(process.env.XIAOXUE_PYTHON_RUNTIME_DIR)
  : path.join(packageDir, "resources", "python")
const roots = [
  { prefix: "skills", directory: path.resolve(packageDir, "../..", ".opencode", "skills") },
  { prefix: "obsidian-plugin", directory: path.join(packageDir, "resources", "obsidian-plugin") },
  // Python runtime 是 immutable 内容；只排除 createdAt 类时间戳元数据，
  // 实际可执行文件与依赖 wheel 全部纳入 hash。
  { prefix: "python", directory: pythonRuntimeDir },
]

const pending = (
  await Promise.all(
    roots.map(async (root) =>
      (await walk(root.directory)).map(async (file) => {
        const relative = path.relative(root.directory, file).replaceAll("\\", "/")
        if (ResourceIntegrityCore.isIgnoredPath(relative)) return null
        return {
          path: `${root.prefix}/${relative}`,
          sha256: createHash("sha256")
            .update(await readFile(file))
            .digest("hex"),
        }
      }),
    ),
  )
).flat()
const files = (await Promise.all(pending))
  .filter((entry): entry is { path: string; sha256: string } => entry !== null)
  .toSorted((left, right) => left.path.localeCompare(right.path))

await Bun.write(
  path.join(packageDir, "resources", "integrity.json"),
  `${JSON.stringify({ version: 1, files }, null, 2)}\n`,
)

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const location = path.join(directory, entry.name)
        if (entry.isDirectory()) return walk(location)
        return entry.isFile() ? [location] : []
      }),
    )
  ).flat()
}
