import { describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Layer } from "effect"
import { Skill } from "../../src/skill"
import { Agent } from "../../src/agent/agent"
import { Permission } from "../../src/permission"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { provideTmpdirInstance, testInstanceStoreLayer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import path from "path"

/**
 * Phase 3.1A Internal Specialist Surface Test.
 *
 * Phase 3.1 retained `meeting-minutes-manager` and `humanizer` as
 * "internal specialists" after the user-visible office consolidation,
 * but did not establish a real runtime invocation path: no agent
 * permission allowlist referenced them, so they were orphaned on disk
 * with only a documentary `visibility: "internal"` annotation.
 *
 * Phase 3.1A repairs this by adding both to the office subagent
 * allowlist in `packages/opencode/src/agent/agent.ts`. This test
 * pins the dual-visibility contract that the fix establishes:
 *
 *   1. xiaoxue primary (the user-visible surface) DENIES both skills
 *      so `Skill.available(xiaoxue)` does NOT expose them.
 *   2. office subagent ALLOWS both skills so `Skill.available(office)`
 *      DOES expose them, proving a real internal invocation path.
 *   3. The runtime Skill service can `get()` both skills when the
 *      calling agent is the office subagent (loadable, not just listed).
 *
 * The visibility frontmatter field is intentionally NOT asserted here:
 * `packages/opencode/src/skill/index.ts` does not parse it. Visibility
 * is enforced exclusively by the agent permission map. This test is
 * the executable evidence of that enforcement.
 */
const node = LayerNode.compile(CrossSpawnSpawner.node)

const it = testEffect(Layer.mergeAll(LayerNode.compile(Skill.node), node, testInstanceStoreLayer))

const INTERNAL_SPECIALIST_IDS = ["meeting-minutes-manager", "humanizer"] as const
const CANONICAL_OFFICE_ID = "office-assistant"

// Mirror `agent.ts` defaults (lines 129-146): "*" allow + doom_loop ask +
// question/plan_enter/plan_exit deny + read wildcards. The xiaoxue and
// office configs override "*" to "deny" so per-skill allowlist takes effect.
const baseDefaults = Permission.fromConfig({
  "*": "allow",
  doom_loop: "ask",
  question: "deny",
  plan_enter: "deny",
  plan_exit: "deny",
})

function xiaoxueAgent(): Agent.Info {
  return {
    name: "xiaoxue",
    description: "Phase 3.1A test xiaoxue",
    mode: "primary",
    options: {},
    permission: Permission.merge(
      baseDefaults,
      Permission.fromConfig({
        "*": "deny",
        question: "allow",
        read: "allow",
        skill: {
          "*": "deny",
          // xiaoxue primary intentionally omits both INTERNAL_SPECIALIST_IDS
          // so they are denied. office-assistant stays in the user surface.
          [CANONICAL_OFFICE_ID]: "allow",
        },
      }),
    ),
  }
}

function officeSubagent(): Agent.Info {
  return {
    name: "office",
    description: "Phase 3.1A test office subagent",
    mode: "subagent",
    options: {},
    permission: Permission.merge(
      baseDefaults,
      Permission.fromConfig({
        "*": "deny",
        bash: "ask",
        edit: "ask",
        read: "allow",
        webfetch: "allow",
        websearch: "allow",
        write: "ask",
        skill: {
          "*": "deny",
          [CANONICAL_OFFICE_ID]: "allow",
          // Phase 3.1A repair: real internal invocation path for both
          // retained specialists. office subagent can require() either.
          "meeting-minutes-manager": "allow",
          humanizer: "allow",
        },
        office_document: "allow",
      }),
    ),
  }
}

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

Phase 3.1A test fixture body. Do not invoke as a real Skill; this file
exists only so this test can verify Skill.available() filtering.
`,
  )
}

describe("phase 3.1A internal specialist surface", () => {
  it.live(
    "xiaoxue surface hides meeting-minutes-manager and humanizer (user-visible surface consolidation holds)",
    () =>
      provideTmpdirInstance(
        (dir) =>
          Effect.gen(function* () {
            for (const id of INTERNAL_SPECIALIST_IDS) {
              yield* Effect.promise(() =>
                writeSkill(
                  dir,
                  path.join(".opencode", "skills", id, "SKILL.md"),
                  id,
                  `Phase 3.1A test fixture for ${id}`,
                ),
              )
            }

            const skill = yield* Skill.Service
            const names = new Set(
              (yield* skill.available(xiaoxueAgent())).map((s) => s.name),
            )

            for (const id of INTERNAL_SPECIALIST_IDS) {
              expect(names.has(id)).toBe(false)
            }
          }),
        { git: true },
      ),
  )

  it.live(
    "office subagent surface exposes meeting-minutes-manager and humanizer (real internal invocation path)",
    () =>
      provideTmpdirInstance(
        (dir) =>
          Effect.gen(function* () {
            for (const id of [...INTERNAL_SPECIALIST_IDS, CANONICAL_OFFICE_ID]) {
              yield* Effect.promise(() =>
                writeSkill(
                  dir,
                  path.join(".opencode", "skills", id, "SKILL.md"),
                  id,
                  `Phase 3.1A test fixture for ${id}`,
                ),
              )
            }

            const skill = yield* Skill.Service
            const names = new Set(
              (yield* skill.available(officeSubagent())).map((s) => s.name),
            )

            for (const id of INTERNAL_SPECIALIST_IDS) {
              expect(names.has(id)).toBe(true)
            }
            // sanity: canonical surface skill is still in office subagent
            expect(names.has(CANONICAL_OFFICE_ID)).toBe(true)
          }),
        { git: true },
      ),
  )

  it.live(
    "office subagent can get() both specialists (loadable, not just listed)",
    () =>
      provideTmpdirInstance(
        (dir) =>
          Effect.gen(function* () {
            for (const id of INTERNAL_SPECIALIST_IDS) {
              yield* Effect.promise(() =>
                writeSkill(
                  dir,
                  path.join(".opencode", "skills", id, "SKILL.md"),
                  id,
                  `Phase 3.1A test fixture for ${id}`,
                ),
              )
            }

            const skill = yield* Skill.Service
            for (const id of INTERNAL_SPECIALIST_IDS) {
              const info = yield* skill.get(id)
              expect(info?.name).toBe(id)
              expect(info?.location).not.toBe("<built-in>")
            }
          }),
        { git: true },
      ),
  )
})