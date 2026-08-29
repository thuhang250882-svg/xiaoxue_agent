import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, readdir, readFile } from "node:fs/promises"
import path from "node:path"

import { ConfigMarkdown } from "@opencode-ai/core/config/markdown"
import { ResourceIntegrityCore } from "../src/main/resource-integrity-core"

type Profile = {
  version: string
  profile: string
  platformEffectiveSkillCount: number
  rc: {
    L0_ENTRIES: string[]
    INTERNAL_DEPENDENCIES: string[]
    FOUNDATIONS: string[]
  }
  RC_OPTIONAL: string[]
  OFFICE_NETWORK_UNAVAILABLE: string[]
  PLATFORM_ONLY: string[]
}

const packageDir = path.resolve(import.meta.dir, "..")
const rootDir = path.resolve(packageDir, "../..")
const skillsDir = path.join(rootDir, ".opencode", "skills")
const catalogDir = path.join(packageDir, "resources", "catalog")
await generateCatalog()
const pythonRuntimeDir = process.env.XIAOXUE_PYTHON_RUNTIME_DIR
  ? path.resolve(process.env.XIAOXUE_PYTHON_RUNTIME_DIR)
  : path.join(packageDir, "resources", "python")
const roots = [
  { prefix: "skills", directory: skillsDir },
  { prefix: "catalog", directory: catalogDir },
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

async function generateCatalog() {
  const profile = (await Bun.file(
    path.join(rootDir, "configs", "xiaoxue", "rc-release-profile.json"),
  ).json()) as Profile
  const governed = [
    ...[...profile.rc.L0_ENTRIES, ...profile.rc.INTERNAL_DEPENDENCIES, ...profile.rc.FOUNDATIONS].map((name) => ({
      name,
      tier: "core" as const,
    })),
    ...profile.RC_OPTIONAL.map((name) => ({ name, tier: "optional" as const })),
    ...profile.PLATFORM_ONLY.map((name) => ({ name, tier: "platform" as const })),
    ...profile.OFFICE_NETWORK_UNAVAILABLE.map((name) => ({ name, tier: "unavailable" as const })),
  ]
  const active = (await readdir(skillsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && existsSync(path.join(skillsDir, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .toSorted(compare)
  const selected = governed.map((entry) => entry.name).toSorted(compare)
  if (
    new Set(selected).size !== profile.platformEffectiveSkillCount ||
    selected.length !== profile.platformEffectiveSkillCount ||
    JSON.stringify(selected) !== JSON.stringify(active)
  ) {
    throw new Error(
      `Platform Skill catalog mismatch: declared=${profile.platformEffectiveSkillCount} governed=${selected.length} active=${active.length}`,
    )
  }

  const skills = await Promise.all(
    governed.map(async (entry) => {
      const data = ConfigMarkdown.parse(await Bun.file(path.join(skillsDir, entry.name, "SKILL.md")).text())
        .data as Record<string, unknown>
      return {
        name: entry.name,
        description: typeof data.description === "string" ? data.description : undefined,
        tier: entry.tier,
      }
    }),
  )
  await mkdir(catalogDir, { recursive: true })
  await Bun.write(
    path.join(catalogDir, "skill-catalog.json"),
    `${JSON.stringify(
      {
        version: 1,
        profile: profile.profile,
        profileVersion: profile.version,
        skills: skills.toSorted((left, right) => compare(left.name, right.name)),
      },
      null,
      2,
    )}\n`,
  )
}

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

function compare(left: string, right: string) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
