import { describe, expect, test } from "bun:test"
import path from "path"

import { readSkillCatalog } from "@/skill/catalog"
import { tmpdir } from "../fixture/fixture"

describe("Skill catalog", () => {
  test("loads governed entries and rejects malformed rows", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "skill-catalog.json")
    await Bun.write(file, JSON.stringify({
      version: 1,
      skills: [
        { name: "office-assistant", description: "办公", tier: "core" },
        { name: "experiment-design", tier: "platform" },
        { name: "invalid", tier: "internet" },
      ],
    }))

    expect(await readSkillCatalog(file)).toEqual([
      { name: "office-assistant", description: "办公", tier: "core" },
      { name: "experiment-design", description: undefined, tier: "platform" },
    ])
  })

  test("returns an empty catalog when the file is unavailable", async () => {
    expect(await readSkillCatalog("relative/catalog.json")).toEqual([])
  })
})
