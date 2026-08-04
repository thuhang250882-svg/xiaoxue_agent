import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

const packageDir = path.resolve(import.meta.dir, "..")
const ignoredNames = new Set([".DS_Store", "Thumbs.db", "desktop.ini"])
const roots = [
  { prefix: "skills", directory: path.resolve(packageDir, "../..", ".opencode", "skills") },
  { prefix: "obsidian-plugin", directory: path.join(packageDir, "resources", "obsidian-plugin") },
]

const pending = (
  await Promise.all(
    roots.map(async (root) =>
      (await walk(root.directory)).map(async (file) => ({
        path: `${root.prefix}/${path.relative(root.directory, file).replaceAll("\\", "/")}`,
        sha256: createHash("sha256").update(await readFile(file)).digest("hex"),
      })),
    ),
  )
)
  .flat()
const files = (await Promise.all(pending)).toSorted((left, right) => left.path.localeCompare(right.path))

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
        const location = path.join(directory, entry.name)
        if (entry.isDirectory()) return walk(location)
        return entry.isFile() ? [location] : []
      }),
    )
  ).flat()
}
