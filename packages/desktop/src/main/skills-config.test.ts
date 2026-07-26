import { describe, expect, test } from "bun:test"
import { withBundledSkills } from "./skills-config"

describe("bundled skills config", () => {
  test("creates inline config when the user has not provided one", () => {
    expect(JSON.parse(withBundledSkills(undefined, "C:/Xiaoxue/skills"))).toEqual({
      skills: { paths: ["C:/Xiaoxue/skills"] },
    })
  })

  test("preserves user config and existing skill sources", () => {
    expect(
      JSON.parse(
        withBundledSkills(
          JSON.stringify({
            model: "custom/model",
            skills: { paths: ["D:/user-skills"], urls: ["https://example.test/skills"] },
          }),
          "C:/Xiaoxue/skills",
        ),
      ),
    ).toEqual({
      model: "custom/model",
      skills: {
        paths: ["C:/Xiaoxue/skills", "D:/user-skills"],
        urls: ["https://example.test/skills"],
      },
    })
  })

  test("does not duplicate the bundled path or hide malformed user config", () => {
    const content = JSON.stringify({ skills: { paths: ["C:/Xiaoxue/skills"] } })
    expect(withBundledSkills(content, "C:/Xiaoxue/skills")).toBe(content)
    expect(withBundledSkills("{ invalid", "C:/Xiaoxue/skills")).toBe("{ invalid")
  })
})
