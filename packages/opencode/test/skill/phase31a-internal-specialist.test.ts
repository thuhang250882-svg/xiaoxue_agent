import { describe, expect, test } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Effect, Layer } from "effect"
import { existsSync } from "node:fs"
import path from "node:path"
import { Skill } from "../../src/skill"
import { provideTmpdirInstance, testInstanceStoreLayer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const root = path.resolve(import.meta.dir, "../../../..")
const office = path.join(root, ".opencode", "skills", "office-assistant")
const merged = [
  "long-document-writing.md",
  "long-document-writing-summary.md",
  "meeting-minutes-manager.md",
  "meeting-minutes-templates.md",
  "humanizer.md",
  "humanizer-readme.md",
]
const it = testEffect(
  Layer.mergeAll(
    LayerNode.compile(Skill.node),
    LayerNode.compile(CrossSpawnSpawner.node),
    testInstanceStoreLayer,
  ),
)

describe("office specialist consolidation", () => {
  test("keeps every specialist knowledge asset under office-assistant", async () => {
    const skill = await Bun.file(path.join(office, "SKILL.md")).text()
    for (const name of merged) {
      expect(existsSync(path.join(office, "references", name))).toBe(true)
      expect(skill).toContain("references/" + name)
    }
  })

  test("preserves the unique long-document, meeting, and humanizer contracts", async () => {
    const long = await Bun.file(path.join(office, "references", "long-document-writing.md")).text()
    const meeting = await Bun.file(path.join(office, "references", "meeting-minutes-manager.md")).text()
    const humanizer = await Bun.file(path.join(office, "references", "humanizer.md")).text()

    expect(long).toContain("分章续写")
    expect(long).toContain("上下文保持")
    expect(meeting).toContain("录井技术评审")
    expect(meeting).toContain("待办事项提取")
    expect(humanizer).toContain("24. Generic Positive Conclusions")
    expect(humanizer).toContain("PERSONALITY AND SOUL")
  })

  test("removes independent specialist allowlist entries", async () => {
    const agent = await Bun.file(path.join(root, "packages", "opencode", "src", "agent", "agent.ts")).text()
    expect(agent).not.toContain("\"long-document-writing\": \"allow\"")
    expect(agent).not.toContain("\"meeting-minutes-manager\": \"allow\"")
    expect(agent).not.toContain("humanizer: \"allow\"")
  })

  it.live("loads merged capabilities through office-assistant only", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Promise.all(
              ["SKILL.md", ...merged.map((name) => path.join("references", name))].map(
                (name) =>
                  Bun.write(
                    path.join(dir, ".opencode", "skills", "office-assistant", name),
                    Bun.file(path.join(office, name)),
                  ),
              ),
            ),
          )

          const skill = yield* Skill.Service
          const names = (yield* skill.all())
            .filter((item) => item.location !== "<built-in>")
            .map((item) => item.name)
          expect(names).toContain("office-assistant")
          expect(names).not.toContain("long-document-writing")
          expect(names).not.toContain("meeting-minutes-manager")
          expect(names).not.toContain("humanizer")

          const loaded = yield* skill.require("office-assistant")
          for (const name of merged) expect(loaded.content).toContain("references/" + name)
        }),
      { git: true },
    ),
  )
})
