import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { Effect } from "effect"
import { afterEach, describe, expect } from "bun:test"
import path from "path"
import { Agent } from "../../src/agent/agent"
import { Skill } from "../../src/skill"
import { MessageID, SessionID } from "../../src/session/schema"
import { SkillTool } from "../../src/tool/skill"
import { ToolRegistry } from "../../src/tool/registry"
import type { Tool } from "../../src/tool/tool"
import { XiaoxueRouterTool } from "../../src/tool/xiaoxue-router"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const imported = [
  "aihot",
  "autoresearch",
  "browser-use",
  "起草合同",
  "darwin-skill",
  "deep-research",
  "fullstack-dev",
  "geolog-logging-review",
  "github",
  "github-trending-cn",
  "humanizer",
  "image-well",
  "markitdown-skill",
  "material-organizer",
  "meeting-minutes-manager",
  "minimax-docx",
  "minimax-xlsx",
  "nano-banana-pro",
  "obsidian",
  "openai-whisper-api",
  "pdfkit-py",
  "pptx-generator",
  "prompt-engineering-expert",
  "tencent-esign-contract",
  "tencent-meeting-skill",
  "tencentcloud-ocr",
  "tender-management",
  "tutor-skills",
  "web-access",
  "wpscli",
  "yourself-skill",
] as const

const repo = path.resolve(import.meta.dir, "../../../..")
const skills = path.join(repo, ".opencode", "skills")
const it = testEffect(
  LayerNode.compile(LayerNode.group([Agent.node, Skill.node, ToolRegistry.node, CrossSpawnSpawner.node, Ripgrep.node])),
)

afterEach(async () => {
  await disposeAllInstances()
})

describe("xiaoxue portable skills", () => {
  it.instance("discovers all imported skills and exposes them to xiaoxue", () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      yield* Effect.promise(() =>
        Bun.write(path.join(instance.directory, "opencode.json"), JSON.stringify({ skills: { paths: [skills] } })),
      )

      const agent = yield* (yield* Agent.Service).get("xiaoxue")
      if (!agent) throw new Error("xiaoxue agent not found")

      const available = yield* (yield* Skill.Service).available(agent)
      const names = new Set(available.map((skill) => skill.name))
      imported.forEach((name) => expect(names.has(name)).toBe(true))
      expect(available.find((skill) => skill.name === "meeting-minutes-manager")?.description).toContain("会议纪要")
      expect(available.find((skill) => skill.name === "起草合同")?.description).toContain("合同")
    }),
  )

  it.instance("loads an imported skill through the real skill tool", () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      yield* Effect.promise(() =>
        Bun.write(path.join(instance.directory, "opencode.json"), JSON.stringify({ skills: { paths: [skills] } })),
      )

      const agent = yield* (yield* Agent.Service).get("xiaoxue")
      if (!agent) throw new Error("xiaoxue agent not found")

      const registry = yield* ToolRegistry.Service
      const tools = yield* registry.tools({
        providerID: ProviderV2.ID.opencode,
        modelID: ModelV2.ID.make("gpt-5"),
        agent,
      })
      const tool = tools.find((item) => item.id === SkillTool.id)
      if (!tool) throw new Error("skill tool not found")

      const context: Tool.Context = {
        sessionID: SessionID.make("ses_portable_skills"),
        messageID: MessageID.make("msg_portable_skills"),
        callID: "call_portable_skills",
        agent: "xiaoxue",
        abort: AbortSignal.any([]),
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      }
      const router = tools.find((item) => item.id === XiaoxueRouterTool.id)
      if (!router) throw new Error("xiaoxue router tool not found")
      const route = yield* router.execute({ task: "整理周例会纪要并提取会议待办" }, context)
      expect(router.description).toContain("立即用 skill Tool 加载")
      expect(route.output).toContain('"skill":"meeting-minutes-manager"')

      const result = yield* tool.execute({ name: "meeting-minutes-manager" }, context)

      expect(result.output).toContain('<skill_content name="meeting-minutes-manager">')
      expect(result.output).toContain("会议纪要智能管理助手")
      expect(result.output).toContain("minutes-templates.md")
      expect(result.metadata.dir).toBe(path.join(skills, "meeting-minutes-manager"))
    }),
  )
})
