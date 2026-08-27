import { describe, expect, test } from "bun:test"
import path from "node:path"

import { scanOfflineSkills } from "./offline-skill-policy"

const rootDir = path.resolve(import.meta.dirname, "../../..")

describe("office-network Skill policy", () => {
  test("published Skills forbid package managers", async () => {
    expect(await scanOfflineSkills({ rootDir })).toEqual([])
  })

  test("published Skills forbid public downloads", async () => {
    expect(await scanOfflineSkills({ rootDir })).toEqual([])
  })
})
