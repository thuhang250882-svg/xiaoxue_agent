import { readdir } from "node:fs/promises"
import path from "node:path"

type Profile = {
  rc: {
    L0_ENTRIES: string[]
    INTERNAL_DEPENDENCIES: string[]
    FOUNDATIONS: string[]
  }
}

type Allow = {
  skill: string
  path: string
  rule: string
  match: string
  reason: string
}

export type OfflineSkillPolicyFinding = {
  skill: string
  file: string
  line: number
  rule: string
  match: string
}

const rules = [
  { name: "python-package-install", pattern: /\bpip\s+install\b/i },
  { name: "windows-package-manager", pattern: /\bwinget\b/i },
  { name: "debian-package-manager", pattern: /\bapt(?:-get)?\s+install\b/i },
  { name: "macos-package-manager", pattern: /\bbrew\s+install\b/i },
  { name: "dotnet-online-restore", pattern: /\bdotnet\s+restore\b/i },
  { name: "dynamic-nuget-reference", pattern: /\bnuget\s*:/i },
  { name: "public-url", pattern: /https?:\/\//i },
  { name: "network-downloader", pattern: /\b(?:curl|wget|Invoke-WebRequest)\b/i },
  { name: "privilege-escalation", pattern: /\bsudo\b|请求管理员权限|以管理员身份运行/i },
  { name: "system-path-mutation", pattern: /\bsetx\s+PATH\b|修改系统\s*PATH/i },
]

const textExtensions = new Set([".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".py", ".js", ".ts", ".tsx", ".jsx", ".sh", ".ps1", ".bat"])

export async function scanOfflineSkills(options?: {
  rootDir?: string
  profilePath?: string
  allowlistPath?: string
}) {
  const rootDir = path.resolve(options?.rootDir ?? path.resolve(import.meta.dirname, "../../.."))
  const profilePath = path.resolve(
    options?.profilePath ?? path.join(rootDir, "configs", "xiaoxue", "rc-release-profile.json"),
  )
  const allowlistPath = path.resolve(
    options?.allowlistPath ?? path.join(rootDir, "configs", "xiaoxue", "offline-skill-policy-allowlist.json"),
  )
  const profile = (await Bun.file(profilePath).json()) as Profile
  const allowlist = (await Bun.file(allowlistPath).json()) as Allow[]
  const skills = [...profile.rc.L0_ENTRIES, ...profile.rc.INTERNAL_DEPENDENCIES, ...profile.rc.FOUNDATIONS]

  return (
    await Promise.all(
      skills.map(async (skill) => {
        const directory = path.join(rootDir, ".opencode", "skills", skill)
        return (
          await Promise.all(
            (await walk(directory)).map(async (file) => {
              const relative = path.relative(directory, file).replaceAll("\\", "/")
              if (!textExtensions.has(path.extname(file).toLowerCase()) || path.basename(file) === "_skillhub_meta.json")
                return []
              const lines = (await Bun.file(file).text()).split(/\r?\n/)
              return lines.flatMap((line, index) =>
                rules.flatMap((rule) => {
                  const match = line.match(rule.pattern)?.[0]
                  if (!match) return []
                  if (
                    allowlist.some(
                      (entry) =>
                        entry.skill === skill &&
                        entry.path === relative &&
                        entry.rule === rule.name &&
                        line.includes(entry.match) &&
                        entry.reason.trim().length > 0,
                    )
                  )
                    return []
                  return [{ skill, file: relative, line: index + 1, rule: rule.name, match }]
                }),
              )
            }),
          )
        ).flat()
      }),
    )
  ).flat() satisfies OfflineSkillPolicyFinding[]
}

async function walk(directory: string): Promise<string[]> {
  return (
    await Promise.all(
      (await readdir(directory, { withFileTypes: true })).map((entry) => {
        const target = path.join(directory, entry.name)
        if (entry.isDirectory()) return walk(target)
        return entry.isFile() ? [target] : []
      }),
    )
  ).flat()
}

if (import.meta.main) {
  const findings = await scanOfflineSkills()
  findings.forEach((finding) =>
    console.error(`${finding.skill}\t${finding.file}:${finding.line}\t${finding.rule}\t${finding.match}`),
  )
  if (findings.length) throw new Error(`Office-network Skill policy failed with ${findings.length} violation(s)`)
  console.log("Verified office-network Skill policy")
}
