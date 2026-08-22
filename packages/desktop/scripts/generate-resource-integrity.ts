import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

const packageDir = path.resolve(import.meta.dir, "..")
// 在 integrity hash 中必须排除：系统装饰文件、运行时缓存、用户会话临时目录。
const ignoredNames = new Set([".DS_Store", "Thumbs.db", "desktop.ini"])
// 扩展名层面的忽略项以 .pyc 为主，包含 .pyo/.pyd 让 CPython 字节码缓存全部跳过。
const ignoredSuffixes = [".pyc", ".pyo"]
// 与 prepare-python-runtime.ts 写入的 xiaoxue-runtime.json 协同：createdAt 字段每次
// prepare 都会刷新，必须把整个文件排除，否则 integrity.json 永远非 deterministic。
const ignoredRelativePaths = new Set<string>(["xiaoxue-runtime.json"])
const roots = [
  { prefix: "skills", directory: path.resolve(packageDir, "../..", ".opencode", "skills") },
  { prefix: "obsidian-plugin", directory: path.join(packageDir, "resources", "obsidian-plugin") },
  // Python runtime 是 immutable 内容；只排除 createdAt 类时间戳元数据，
  // 实际可执行文件与依赖 wheel 全部纳入 hash。
  { prefix: "python", directory: path.join(packageDir, "resources", "python") },
]

const pending = (
  await Promise.all(
    roots.map(async (root) =>
      (await walk(root.directory)).map(async (file) => {
        const relative = path.relative(root.directory, file).replaceAll("\\", "/")
        if (ignoredRelativePaths.has(relative)) return null
        return {
          path: `${root.prefix}/${relative}`,
          sha256: createHash("sha256").update(await readFile(file)).digest("hex"),
        }
      }),
    ),
  )
)
  .flat()
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
        if (ignoredNames.has(entry.name)) return []
        const lower = entry.name.toLowerCase()
        if (ignoredSuffixes.some((suffix) => lower.endsWith(suffix))) return []
        const location = path.join(directory, entry.name)
        if (entry.isDirectory()) {
          // __pycache__ 在 cp 阶段也会偶发残留，整个目录跳过即可。
          if (entry.name === "__pycache__") return []
          return walk(location)
        }
        return entry.isFile() ? [location] : []
      }),
    )
  ).flat()
}
