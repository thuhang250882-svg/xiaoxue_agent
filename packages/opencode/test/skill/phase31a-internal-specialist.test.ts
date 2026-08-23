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
 * Phase 3.1A Internal Specialist Surface Test (Phase 3.1B expanded).
 *
 * Phase 3.1 retained `meeting-minutes-manager` and `humanizer` as
 * "internal specialists" after the user-visible office consolidation,
 * but did not establish a real runtime invocation path: no agent
 * permission allowlist referenced them, so they were orphaned on disk
 * with only a documentary `visibility: "internal"` annotation.
 *
 * Phase 3.1A repaired the two specialists by adding them to the office
 * subagent allowlist in `packages/opencode/src/agent/agent.ts`.
 *
 * Phase 3.1B expanded the same pattern to `long-document-writing`.
 * Phase 3.1 had deleted this skill (commit `db145df536`) and Phase 3.1A
 * marked it `MERGE_INTO_OFFICE_WITH_ACKNOWLEDGED_GAP`, but two of its
 * unique workflows (分章续写 / 上下文保持) were not actually covered by
 * office-assistant templates. Phase 3.1B restores the original
 * SKILL.md + references/skill-summary.md from git history and routes
 * the specialist through the office subagent allowlist.
 *
 * This test pins the dual-visibility contract for all three specialists:
 *
 *   1. xiaoxue primary (the user-visible surface) DENIES all three skills
 *      so `Skill.available(xiaoxue)` does NOT expose them.
 *   2. office subagent ALLOWS all three skills so `Skill.available(office)`
 *      DOES expose them, proving a real internal invocation path.
 *   3. The runtime Skill service can `get()` each specialist when the
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
const LONG_DOCUMENT_ID = "long-document-writing" as const
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
          // Phase 3.1B also reinstates long-document-writing as an office
          // subagent internal specialist to preserve unique chapter map /
          // 分章续写 / context retention workflows not covered by office-
          // assistant templates.
          [LONG_DOCUMENT_ID]: "allow",
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

describe("phase 3.1B long-document specialist surface", () => {
  it.live(
    "xiaoxue surface hides long-document-writing (user-visible surface consolidation holds)",
    () =>
      provideTmpdirInstance(
        (dir) =>
          Effect.gen(function* () {
            for (const id of [LONG_DOCUMENT_ID, CANONICAL_OFFICE_ID]) {
              yield* Effect.promise(() =>
                writeSkill(
                  dir,
                  path.join(".opencode", "skills", id, "SKILL.md"),
                  id,
                  `Phase 3.1B test fixture for ${id}`,
                ),
              )
            }

            const skill = yield* Skill.Service
            const names = new Set(
              (yield* skill.available(xiaoxueAgent())).map((s) => s.name),
            )

            expect(names.has(LONG_DOCUMENT_ID)).toBe(false)
            expect(names.has(CANONICAL_OFFICE_ID)).toBe(true)
          }),
        { git: true },
      ),
  )

  it.live(
    "office subagent surface exposes long-document-writing (real internal invocation path)",
    () =>
      provideTmpdirInstance(
        (dir) =>
          Effect.gen(function* () {
            for (const id of [LONG_DOCUMENT_ID, CANONICAL_OFFICE_ID]) {
              yield* Effect.promise(() =>
                writeSkill(
                  dir,
                  path.join(".opencode", "skills", id, "SKILL.md"),
                  id,
                  `Phase 3.1B test fixture for ${id}`,
                ),
              )
            }

            const skill = yield* Skill.Service
            const names = new Set(
              (yield* skill.available(officeSubagent())).map((s) => s.name),
            )

            expect(names.has(LONG_DOCUMENT_ID)).toBe(true)
            expect(names.has(CANONICAL_OFFICE_ID)).toBe(true)
          }),
        { git: true },
      ),
  )

  it.live(
    "office subagent can get() long-document-writing (loadable, not just listed)",
    () =>
      provideTmpdirInstance(
        (dir) =>
          Effect.gen(function* () {
            yield* Effect.promise(() =>
              writeSkill(
                dir,
                path.join(".opencode", "skills", LONG_DOCUMENT_ID, "SKILL.md"),
                LONG_DOCUMENT_ID,
                "Phase 3.1B test fixture for long-document-writing",
              ),
            )

            const skill = yield* Skill.Service
            const info = yield* skill.get(LONG_DOCUMENT_ID)
            expect(info?.name).toBe(LONG_DOCUMENT_ID)
            expect(info?.location).not.toBe("<built-in>")
          }),
        { git: true },
      ),
  )
})