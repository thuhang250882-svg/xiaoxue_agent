import { describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Layer, Effect } from "effect"
import path from "path"
import { Skill } from "../../src/skill"
import { provideTmpdirInstance, testInstanceStoreLayer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  Layer.mergeAll(LayerNode.compile(Skill.node), LayerNode.compile(CrossSpawnSpawner.node), testInstanceStoreLayer),
)

describe("skill center performance", () => {
  it.live("keeps 150-skill discovery, refresh, search, and memory bounded", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          Bun.gc(true)
          const heapBefore = process.memoryUsage().heapUsed
          yield* Effect.promise(() =>
            Promise.all(
              Array.from({ length: 150 }, (_, index) => {
                const name = `performance-skill-${index.toString().padStart(3, "0")}`
                return Bun.write(
                  path.join(dir, ".opencode", "skills", name, "SKILL.md"),
                  `---\nname: ${name}\ndescription: Performance fixture ${index}\n---\n\n# ${name}\n`,
                )
              }),
            ),
          )
          const discoveryStarted = performance.now()
          const skill = yield* Skill.Service
          const skills = yield* skill.all()
          const discoveryMs = performance.now() - discoveryStarted
          const refreshStarted = performance.now()
          yield* skill.refresh()
          const refreshMs = performance.now() - refreshStarted
          const searchStarted = performance.now()
          for (let index = 0; index < 500; index++) {
            const query = `skill-${(index % 150).toString().padStart(3, "0")}`
            skills.filter((item) => item.name.includes(query) || item.description?.includes(query))
          }
          const searchMs = performance.now() - searchStarted
          Bun.gc(true)
          const heapDeltaMb = (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024
          const result = {
            skillCount: skills.filter((item) => item.name.startsWith("performance-skill-")).length,
            discoveryMs: Number(discoveryMs.toFixed(2)),
            refreshMs: Number(refreshMs.toFixed(2)),
            search500Ms: Number(searchMs.toFixed(2)),
            heapDeltaMb: Number(heapDeltaMb.toFixed(2)),
          }
          yield* Effect.sync(() => process.stdout.write(`SKILL_PERFORMANCE ${JSON.stringify(result)}\n`))
          expect(result.skillCount).toBe(150)
          expect(discoveryMs).toBeLessThan(15_000)
          expect(refreshMs).toBeLessThan(15_000)
          expect(searchMs).toBeLessThan(500)
          expect(heapDeltaMb).toBeLessThan(256)
        }),
      { git: true },
    ),
  )
})
