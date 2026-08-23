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

const bundled = [
  "cognitive-profile",
  "experiment-design",
  "giiisp-paper-search-apis",
  "knowledge-distill",
  "llm-wiki-knowledge",
  "manim-agent",
  "mcp-criticagent",
  "minimax-pdf",
  "office-assistant",
  "papercheck",
  "practical-course-producer",
  "research-baseline-builder",
  "sci-employee-deep-research",
  "skill-criticagent",
  "tender-bid-generation",
  "tender-document-review",
  "审查合同",
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
  it.instance("discovers current bundled skills and exposes them to xiaoxue", () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      yield* Effect.promise(() =>
        Bun.write(path.join(instance.directory, "opencode.json"), JSON.stringify({ skills: { paths: [skills] } })),
      )

      const agentService = yield* Agent.Service
      const skillService = yield* Skill.Service
      const agent = yield* agentService.get("xiaoxue")
      if (!agent) throw new Error("xiaoxue agent not found")

      const available = yield* skillService.available(agent)
      const names = new Set(available.map((skill) => skill.name))
      bundled.forEach((name) => expect(names.has(name), name).toBe(true))
      expect(available.find((skill) => skill.name === "office-assistant")?.description).toContain("会议纪要")
      expect(available.find((skill) => skill.name === "审查合同")?.description).toContain("合同")
      expect(available.find((skill) => skill.name === "experiment-design")?.description).toContain("样本量")
      expect(available.find((skill) => skill.name === "minimax-pdf")?.description).toContain("PDF")

      const office = yield* agentService.get("office")
      const document = yield* agentService.get("document")
      const knowledge = yield* agentService.get("knowledge")
      if (!office || !document || !knowledge) throw new Error("xiaoxue business agent not found")
      const officeSkills = new Set((yield* skillService.available(office)).map((skill) => skill.name))
      const documentSkills = new Set((yield* skillService.available(document)).map((skill) => skill.name))
      const knowledgeSkills = new Set((yield* skillService.available(knowledge)).map((skill) => skill.name))
      expect(officeSkills.has("manim-agent")).toBe(true)
      expect(officeSkills.has("practical-course-producer")).toBe(true)
      expect(documentSkills.has("minimax-pdf")).toBe(true)
      expect(documentSkills.has("papercheck")).toBe(true)
      expect(knowledgeSkills.has("experiment-design")).toBe(true)
      expect(knowledgeSkills.has("skill-criticagent")).toBe(true)
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
      expect(route.output).toContain('"skill":"office-assistant"')

      const result = yield* tool.execute({ name: "office-assistant" }, context)

      expect(result.output).toContain('<skill_content name="office-assistant">')
      expect(result.output).toContain("日常办公助手")
      expect(result.output).toContain("会议纪要")
      expect(result.metadata.dir).toBe(path.join(skills, "office-assistant"))

      const papercheck = yield* tool.execute({ name: "papercheck" }, context)
      expect(papercheck.output).toContain('<skill_content name="papercheck">')
      expect(papercheck.output).toContain("Use this skill to run citation audits")
      expect(papercheck.metadata.dir).toBe(path.join(skills, "papercheck"))

      const manim = yield* tool.execute({ name: "manim-agent" }, context)
      expect(manim.output).toContain("录井小雪的受管内网模式禁止调用")
    }),
  )
})
