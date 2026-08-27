import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync } from "node:fs"
import path from "node:path"

type Profile = {
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
  OFFICE_NETWORK_UNAVAILABLE: string[]
  PLATFORM_ONLY: string[]
  protectedPlatformOnly: string[]
  mergedIntoOfficeAssistant: string[]
}

type BuilderSnapshot = {
  files: Array<string | { from?: string; to?: string }>
  extraResources: Array<{ from?: string; to?: string }>
}

const packageDir = path.resolve(import.meta.dir, "../..")
const rootDir = path.resolve(packageDir, "../..")
const skillsDir = path.join(rootDir, ".opencode", "skills")
const profilePath = path.join(rootDir, "configs", "xiaoxue", "rc-release-profile.json")

describe("Xiaoxue RC release profile", () => {
  test("partitions all 27 consolidated local Skills", async () => {
    const profile = (await Bun.file(profilePath).json()) as Profile
    const rc = [...profile.rc.L0_ENTRIES, ...profile.rc.INTERNAL_DEPENDENCIES, ...profile.rc.FOUNDATIONS]
    const partition = [...rc, ...profile.RC_OPTIONAL, ...profile.PLATFORM_ONLY, ...profile.OFFICE_NETWORK_UNAVAILABLE]
    const active = readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(path.join(skillsDir, entry.name, "SKILL.md")))
      .map((entry) => entry.name)
      .sort()

    expect(profile.releasePolicy).toBe("FILTER_WITHOUT_PHYSICAL_DELETION")
    expect(active.length).toBe(27)
    expect(profile.platformEffectiveSkillCount).toBe(27)
    expect(rc.length).toBe(10)
    expect(profile.rc.skillCount).toBe(10)
    expect(new Set(partition).size).toBe(27)
    expect(partition.toSorted()).toEqual(active)
  })

  test("marks non-self-contained document runtimes unavailable", async () => {
    const profile = (await Bun.file(profilePath).json()) as Profile
    expect(profile.rc.FOUNDATIONS).toEqual(["pdfkit-py", "skill-governance"])
    expect(profile.OFFICE_NETWORK_UNAVAILABLE.toSorted()).toEqual(["markitdown-skill", "minimax-docx"])
  })

  test("covers the nine RC user paths and does not count merged office specialists independently", async () => {
    const profile = (await Bun.file(profilePath).json()) as Profile
    expect(Object.keys(profile.corePaths).toSorted()).toEqual(
      [
        "ordinary_chat",
        "office_assistant",
        "geology_report_review",
        "report_generation_export",
        "local_pdf_processing",
        "knowledge_retrieval",
        "tender_review_generation",
        "contract_review_drafting",
        "skill_center_basics",
      ].toSorted(),
    )
    expect(profile.mergedIntoOfficeAssistant.toSorted()).toEqual(
      ["long-document-writing", "meeting-minutes-manager", "humanizer"].toSorted(),
    )
    for (const skill of profile.mergedIntoOfficeAssistant) {
      expect(existsSync(path.join(skillsDir, skill, "SKILL.md"))).toBe(false)
    }
    expect(profile.corePaths.office_assistant.skills).toEqual(["office-assistant", "oilfield-it-project-management"])
  })

  test("contains no protected public-network capabilities", async () => {
    const profile = (await Bun.file(profilePath).json()) as Profile
    const rc = [...profile.rc.L0_ENTRIES, ...profile.rc.INTERNAL_DEPENDENCIES, ...profile.rc.FOUNDATIONS]
    expect(profile.protectedPlatformOnly).toEqual([])
    expect(rc).not.toContain("github")
    expect(existsSync(path.join(skillsDir, "github", "SKILL.md"))).toBe(false)
    expect(existsSync(path.join(skillsDir, "web-access", "SKILL.md"))).toBe(false)
  })

  test("electron builder uses staging Skills and the RC integrity manifest only for the RC profile", () => {
    const rc = builderSnapshot("rc")
    const platform = builderSnapshot("platform")
    expect(rc.extraResources.find((entry) => entry.to === "skills/")?.from).toBe("resources/staging/skills/")
    expect(rc.extraResources.find((entry) => entry.to === "integrity.json")?.from).toBe(
      "resources/staging/integrity.json",
    )
    expect(rc.extraResources.find((entry) => entry.to === "catalog/")?.from).toBe("resources/staging/catalog/")
    expect(platform.extraResources.find((entry) => entry.to === "skills/")?.from).toBe("../../.opencode/skills/")
    expect(platform.extraResources.find((entry) => entry.to === "integrity.json")?.from).toBe(
      "resources/integrity.json",
    )
    expect(platform.extraResources.find((entry) => entry.to === "catalog/")).toBeUndefined()
    expect(platform.files).toEqual(["out/**/*", "resources/**/*", "!resources/staging/**"])
  })
})

function builderSnapshot(profile: "rc" | "platform") {
  const script = `
    import config from ${JSON.stringify(path.join(packageDir, "electron-builder.config.ts"))}
    console.log(JSON.stringify({ files: config.files, extraResources: config.extraResources }))
  `
  const result = Bun.spawnSync([process.execPath, "-e", script], {
    cwd: packageDir,
    env: { ...process.env, XIAOXUE_RELEASE_PROFILE: profile },
    stdout: "pipe",
    stderr: "pipe",
  })
  if (result.exitCode !== 0) throw new Error(result.stderr.toString())
  return JSON.parse(result.stdout.toString()) as BuilderSnapshot
}
