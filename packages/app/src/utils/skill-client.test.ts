import { describe, expect, test } from "bun:test"
import { normalizeSkillInfo, normalizeSkillInfos } from "./skill-client"

describe("SkillInfo compatibility boundary", () => {
  test("normalizes a legacy record without granting write permissions", () => {
    const skill = normalizeSkillInfo({
      name: "legacy-skill",
      description: "Old server payload",
      location: "C:/skills/legacy/SKILL.md",
      content: "# Legacy",
    })

    expect(skill).toMatchObject({
      source: "unknown",
      capabilities: { editable: false, removable: false, enableable: false },
      enabled: false,
      health: "warning",
    })
    expect(skill.diagnostics).toEqual([
      expect.objectContaining({ level: "warning", code: "SKILL_LEGACY_RECORD" }),
    ])
  })

  test.each(["bundled", "user", "project", "remote"] as const)("preserves canonical %s records", (source) => {
    const skill = normalizeSkillInfo({
      name: `${source}-skill`,
      location: "C:/skills/SKILL.md",
      content: "# Skill",
      source,
      capabilities: {
        editable: source === "user" || source === "project",
        removable: source === "user" || source === "project",
        enableable: true,
      },
      enabled: true,
      health: "healthy",
      diagnostics: [{ level: "info", code: "SKILL_HEALTHY", message: "Skill is healthy" }],
      version: 4,
    })

    expect(skill.source).toBe(source)
    expect(skill.capabilities.editable).toBe(source === "user" || source === "project")
    expect(skill.health).toBe("healthy")
    expect((skill as unknown as Record<string, unknown>).version).toBe(4)
  })

  test("fails closed for unknown sources and malformed capabilities", () => {
    const skill = normalizeSkillInfo({
      name: "future-skill",
      source: "marketplace",
      capabilities: { editable: "yes", removable: 1, enableable: null },
      health: "future",
      diagnostics: [],
    })

    expect(skill.source).toBe("unknown")
    expect(skill.capabilities).toEqual({ editable: false, removable: false, enableable: false })
    expect(skill.health).toBe("warning")
    expect(skill.diagnostics[0]?.code).toBe("SKILL_LEGACY_RECORD")
  })

  test("drops invalid list entries", () => {
    expect(normalizeSkillInfos([null, {}, { name: "valid" }]).map((skill) => skill.name)).toEqual(["valid"])
  })
})
