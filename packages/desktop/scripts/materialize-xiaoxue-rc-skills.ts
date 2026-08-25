#!/usr/bin/env bun

import { createHash } from "node:crypto"
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

type Profile = {
  version: string
  profile: string
  platformEffectiveSkillCount: number
  releasePolicy: string
  rc: {
    L0_ENTRIES: string[]
    INTERNAL_DEPENDENCIES: string[]
    FOUNDATIONS: string[]
    skillCount: number
  }
  corePaths: Record<string, { skills: string[]; runtimeFoundations?: string[] }>
  RC_OPTIONAL: string[]
  PLATFORM_ONLY: string[]
  protectedPlatformOnly: string[]
  mergedIntoOfficeAssistant: string[]
}

type MaterializedFile = { path: string; sha256: string }

const packageDir = path.resolve(import.meta.dir, "..")
const rootDir = path.resolve(packageDir, "../..")
const defaultStaging = path.join(packageDir, "resources", "staging", "skills")
const defaultIntegrity = path.join(packageDir, "resources", "staging", "integrity.json")
const defaultSummary = path.join(packageDir, "resources", "staging", "rc-skill-materialization.json")
const profilePath = path.join(rootDir, "configs", "xiaoxue", "rc-release-profile.json")
const ignoredNames = new Set([".DS_Store", "Thumbs.db", "desktop.ini", "_skillhub_meta.json"])

export async function materialize(options?: {
  sourceRef?: string
  staging?: string
  integrity?: string
  summary?: string
}) {
  const sourceRef = options?.sourceRef ?? "HEAD"
  const staging = path.resolve(options?.staging ?? defaultStaging)
  const integrity = path.resolve(options?.integrity ?? defaultIntegrity)
  const summary = path.resolve(options?.summary ?? defaultSummary)
  if (path.parse(staging).root === staging || path.basename(staging) !== "skills") {
    throw new Error(`Unsafe RC staging target: ${staging}`)
  }

  const profile = (await Bun.file(profilePath).json()) as Profile
  const selected = [
    ...profile.rc.L0_ENTRIES,
    ...profile.rc.INTERNAL_DEPENDENCIES,
    ...profile.rc.FOUNDATIONS,
  ]
  validateProfile(profile, selected)

  const sourceCommit = new TextDecoder().decode(await git(["rev-parse", sourceRef])).trim()
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })

  const skills = await Promise.all(
    selected.map(async (skill) => {
      const prefix = `.opencode/skills/${skill}/`
      const listed = new TextDecoder().decode(
        await git(["-c", "core.quotepath=false", "ls-tree", "-r", "-z", "--name-only", sourceRef, "--", prefix]),
      )
      const paths = listed
        .split("\0")
        .filter(Boolean)
        .filter((source) => !ignoredNames.has(path.basename(source)))
        .toSorted(compare)
      if (!paths.includes(`${prefix}SKILL.md`)) throw new Error(`RC source is missing tracked SKILL.md: ${skill}`)

      const files = await Promise.all(
        paths.map(async (source) => {
          const bytes = await git(["show", `${sourceRef}:${source}`])
          const relative = source.slice(prefix.length)
          const target = path.join(staging, skill, relative)
          await mkdir(path.dirname(target), { recursive: true })
          await writeFile(target, bytes)
          const sha256 = digest(bytes)
          if (digest(await readFile(target)) !== sha256) throw new Error(`RC staged hash mismatch: ${skill}/${relative}`)
          return { path: relative, sha256 }
        }),
      )
      return {
        skill,
        fileCount: files.length,
        treeSha256: treeHash(files),
        files: files.toSorted((left, right) => compare(left.path, right.path)),
      }
    }),
  )

  const integrityFiles = await integrityEntries([
    { prefix: "skills", directory: staging },
    { prefix: "obsidian-plugin", directory: path.join(packageDir, "resources", "obsidian-plugin") },
  ])
  await mkdir(path.dirname(integrity), { recursive: true })
  await Bun.write(integrity, `${JSON.stringify({ version: 1, files: integrityFiles }, null, 2)}\n`)

  const result = {
    profile: profile.profile,
    profileVersion: profile.version,
    sourceCommit,
    platformEffectiveSkillCount: profile.platformEffectiveSkillCount,
    rcSkillCount: selected.length,
    materializedSkillCount: skills.length,
    selected,
    optional: profile.RC_OPTIONAL,
    platformOnly: profile.PLATFORM_ONLY,
    protectedPlatformOnly: profile.protectedPlatformOnly,
    skills,
  }
  await Bun.write(summary, `${JSON.stringify(result, null, 2)}\n`)
  return result
}

function validateProfile(profile: Profile, selected: string[]) {
  const partition = [...selected, ...profile.RC_OPTIONAL, ...profile.PLATFORM_ONLY]
  if (profile.releasePolicy !== "FILTER_WITHOUT_PHYSICAL_DELETION") throw new Error("RC profile may not delete platform Skills")
  if (new Set(selected).size !== selected.length || selected.length !== profile.rc.skillCount) {
    throw new Error(`RC Skill count mismatch: declared=${profile.rc.skillCount} actual=${new Set(selected).size}`)
  }
  if (new Set(partition).size !== partition.length || partition.length !== profile.platformEffectiveSkillCount) {
    throw new Error(`Platform partition mismatch: declared=${profile.platformEffectiveSkillCount} actual=${new Set(partition).size}`)
  }
  if (profile.mergedIntoOfficeAssistant.some((skill) => partition.includes(skill))) {
    throw new Error("Merged office specialists may not appear as independent RC or platform Skills")
  }
  if (profile.protectedPlatformOnly.some((skill) => !profile.PLATFORM_ONLY.includes(skill))) {
    throw new Error("Protected platform Skills must remain PLATFORM_ONLY")
  }
  const covered = new Set(Object.values(profile.corePaths).flatMap((entry) => entry.skills))
  if (selected.some((skill) => !covered.has(skill))) throw new Error("Every RC Skill must serve a declared core path")
}

async function integrityEntries(roots: Array<{ prefix: string; directory: string }>) {
  const pending = roots.flatMap((root) =>
    walk(root.directory).then((files) =>
      files.map(async (file) => ({
        path: `${root.prefix}/${path.relative(root.directory, file).replaceAll("\\", "/")}`,
        sha256: digest(await readFile(file)),
      })),
    ),
  )
  return (await Promise.all((await Promise.all(pending)).flat())).toSorted((left, right) => compare(left.path, right.path))
}

async function walk(directory: string): Promise<string[]> {
  return (
    await Promise.all(
      (await readdir(directory, { withFileTypes: true })).map((entry) => {
        if (ignoredNames.has(entry.name)) return []
        const location = path.join(directory, entry.name)
        if (entry.isDirectory()) return walk(location)
        return entry.isFile() ? [location] : []
      }),
    )
  ).flat()
}

function treeHash(files: MaterializedFile[]) {
  return digest(
    new TextEncoder().encode(
      files
        .toSorted((left, right) => compare(left.path, right.path))
        .map((file) => `${file.path}:${file.sha256}\n`)
        .join(""),
    ),
  )
}

function digest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex")
}

function compare(left: string, right: string) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

async function git(args: string[]) {
  const child = Bun.spawn(["git", ...args], { cwd: rootDir, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) throw new Error(`git ${args.join(" ")} failed (${code}): ${stderr.trim()}`)
  return new Uint8Array(stdout)
}

if (import.meta.main) {
  const result = await materialize()
  console.log(`Materialized ${result.materializedSkillCount} Xiaoxue RC Skills from ${result.sourceCommit}`)
}
