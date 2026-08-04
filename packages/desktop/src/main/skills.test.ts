import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { syncManagedSkills } from "./skills-sync"

const root = join(tmpdir(), `xiaoxue-skills-${process.pid}`)

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe("managed skills", () => {
  test("refreshes bundled skills while preserving user-created skills", async () => {
    const bundled = join(root, "bundled")
    const managed = join(root, "managed")
    mkdirSync(join(bundled, "review"), { recursive: true })
    mkdirSync(join(managed, "review"), { recursive: true })
    mkdirSync(join(managed, "custom"), { recursive: true })
    writeFileSync(join(bundled, "review", "SKILL.md"), "latest")
    writeFileSync(join(managed, "review", "SKILL.md"), "old")
    writeFileSync(join(managed, "custom", "SKILL.md"), "custom")

    syncManagedSkills(bundled, managed)

    expect(await Bun.file(join(managed, "review", "SKILL.md")).text()).toBe("latest")
    expect(await Bun.file(join(managed, "custom", "SKILL.md")).text()).toBe("custom")
  })
})
