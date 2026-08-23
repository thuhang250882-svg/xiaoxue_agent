import { describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Layer } from "effect"
import { Skill } from "../../src/skill"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { provideTmpdirInstance, testInstanceStoreLayer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import path from "path"

const node = LayerNode.compile(CrossSpawnSpawner.node)

/**
 * Phase 3.0 Available Skills Snapshot.
 *
 * Verifies that the runtime-available Skill surface for an
 * ordinary Xiaoxue Agent contains exactly one 录井审核 Skill
 * (`geolog-logging-review`) and that the legacy `mud-logging-review`
 * is not present anywhere a user could call it.
 *
 * Also asserts that the unrelated `mud-logging-report-generation`
 * Skill is still alive, so the consolidation does not accidentally
 * remove a generation-only Skill that shares the prefix.
 *
 * The .archive/ placement is exercised here as a real discovery
 * test rather than a documentation promise: we place a SKILL.md in
 * `.opencode/.archive/mud-logging-review/` and prove that the
 * runtime does NOT pick it up. This makes the deprecation safe.
 */
const it = testEffect(Layer.mergeAll(LayerNode.compile(Skill.node), node, testInstanceStoreLayer))

async function writeSkill(
  dir: string,
  relativePath: string,
  frontmatterName: string,
  description: string,
): Promise<void> {
  await Bun.write(
    path.join(dir, relativePath),
    `---
name: ${frontmatterName}
description: ${description}
---

# ${frontmatterName}

Snapshot fixture body. Do not invoke as a real Skill; this file
exists only so the Phase 3.0 snapshot test can verify discovery.
`,
  )
}

describe("phase 3.0 available skills snapshot", () => {
  it.live(
    "xiaoxue surface exposes geolog-logging-review and mud-logging-report-generation but not mud-logging-review",
    () =>
      provideTmpdirInstance(
        (dir) =>
          Effect.gen(function* () {
            // canonical review skill
            yield* Effect.promise(() =>
              writeSkill(
                dir,
                path.join(".opencode", "skills", "geolog-logging-review", "SKILL.md"),
                "geolog-logging-review",
                "审核地质录井报告（canonical review Skill）",
              ),
            )
            // generation skill shares the 录井 prefix and must remain available
            yield* Effect.promise(() =>
              writeSkill(
                dir,
                path.join(".opencode", "skills", "mud-logging-report-generation", "SKILL.md"),
                "mud-logging-report-generation",
                "编制地质录井报告（generation Skill, must not be removed）",
              ),
            )
            // legacy review Skill now lives under .archive/ and must NOT be discovered
            yield* Effect.promise(() =>
              writeSkill(
                dir,
                path.join(".opencode", ".archive", "mud-logging-review", "SKILL.md"),
                "mud-logging-review",
                "Legacy 100%-duplicate review Skill archived in Phase 3.0",
              ),
            )

            const skill = yield* Skill.Service
            const names = new Set(
              (yield* skill.all())
                .filter((s) => s.location !== "<built-in>")
                .map((s) => s.name),
            )

            // canonical review Skill is present
            expect(names.has("geolog-logging-review")).toBe(true)
            // generation Skill is still present (unrelated to the consolidation)
            expect(names.has("mud-logging-report-generation")).toBe(true)
            // legacy review Skill is NOT present (archived, not loaded)
            expect(names.has("mud-logging-review")).toBe(false)
          }),
        { git: true },
      ),
  )

  it.live(
    "the .archive placement is honored by the discovery glob (no false positives)",
    () =>
      provideTmpdirInstance(
        (dir) =>
          Effect.gen(function* () {
            // Drop a fake legacy review Skill ONLY in .archive; it must be ignored.
            yield* Effect.promise(() =>
              writeSkill(
                dir,
                path.join(".opencode", ".archive", "mud-logging-review", "SKILL.md"),
                "mud-logging-review",
                "Should never appear in discovery output.",
              ),
            )

            const skill = yield* Skill.Service
            const names = (yield* skill.all())
              .filter((s) => s.location !== "<built-in>")
              .map((s) => s.name)

            expect(names).not.toContain("mud-logging-review")
          }),
        { git: true },
      ),
  )

  it.live(
    "the canonical review Skill description is unambiguous vs the generation Skill",
    () =>
      provideTmpdirInstance(
        (dir) =>
          Effect.gen(function* () {
            yield* Effect.promise(() =>
              writeSkill(
                dir,
                path.join(".opencode", "skills", "geolog-logging-review", "SKILL.md"),
                "geolog-logging-review",
                "审核地质录井报告（review, 事实证据化问题清单）",
              ),
            )
            yield* Effect.promise(() =>
              writeSkill(
                dir,
                path.join(".opencode", "skills", "mud-logging-report-generation", "SKILL.md"),
                "mud-logging-report-generation",
                "编制地质录井报告（generation, 写报告正文）",
              ),
            )

            const skill = yield* Skill.Service
            const all = (yield* skill.all()).filter((s) => s.location !== "<built-in>")
            const review = all.find((s) => s.name === "geolog-logging-review")
            const generation = all.find((s) => s.name === "mud-logging-report-generation")

            expect(review?.description).toContain("审核")
            expect(generation?.description).toContain("编制")
            // the two descriptions are intentionally non-overlapping so the
            // LLM never has to choose between two "review" Skills
            expect(review?.description).not.toContain("编制")
            expect(generation?.description).not.toContain("审核")
          }),
        { git: true },
      ),
  )
})
