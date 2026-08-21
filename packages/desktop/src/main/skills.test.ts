import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { syncManagedSkills, removeBundledSkillDuplicates } from "./skills-sync"

const root = join(tmpdir(), `xiaoxue-skills-${process.pid}`)

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe("managed skills", () => {
  test("removes bundled mirrors while preserving user-created skills", async () => {
    const bundled = join(root, "bundled")
    const managed = join(root, "managed")
    mkdirSync(join(bundled, "review"), { recursive: true })
    mkdirSync(join(managed, "review"), { recursive: true })
    mkdirSync(join(managed, "custom"), { recursive: true })
    writeFileSync(join(bundled, "review", "SKILL.md"), "latest")
    writeFileSync(join(managed, "review", "SKILL.md"), "old")
    writeFileSync(join(managed, "custom", "SKILL.md"), "custom")

    syncManagedSkills(bundled, managed)

    expect(existsSync(join(managed, "review"))).toBe(false)
    expect(await Bun.file(join(managed, "custom", "SKILL.md")).text()).toBe("custom")
  })

  test("removes orphaned SKILL.md files from managed root", async () => {
    const bundled = join(root, "bundled")
    const managed = join(root, "managed")
    mkdirSync(bundled, { recursive: true })
    mkdirSync(managed, { recursive: true })
    mkdirSync(join(managed, "valid-skill"), { recursive: true })
    writeFileSync(join(managed, "SKILL.md"), "orphaned")
    writeFileSync(join(managed, "valid-skill", "SKILL.md"), "valid")

    syncManagedSkills(bundled, managed)

    expect(existsSync(join(managed, "SKILL.md"))).toBe(false)
    expect(existsSync(join(managed, "valid-skill", "SKILL.md"))).toBe(true)
  })

  test("removeBundledSkillDuplicates is an alias for syncManagedSkills", () => {
    expect(removeBundledSkillDuplicates).toBe(syncManagedSkills)
  })
})
