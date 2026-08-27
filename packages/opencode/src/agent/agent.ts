import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Config } from "@/config/config"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import { Provider } from "@/provider/provider"
import { ModelRegistry } from "@/provider/model-registry"

import { generateObject, streamObject, type ModelMessage } from "ai"
import { Truncate } from "@/tool/truncate"
import { Auth } from "../auth"
import { ProviderTransform } from "@/provider/transform"

import PROMPT_GENERATE from "./generate.txt"
import PROMPT_COMPACTION from "./prompt/compaction.txt"
import PROMPT_EXPLORE from "./prompt/explore.txt"
import PROMPT_SUMMARY from "./prompt/summary.txt"
import PROMPT_TITLE from "./prompt/title.txt"
import XIAOXUE_SYSTEM_PROMPT from "../../../../configs/xiaoxue/system.md"
import XIAOXUE_ROUTER_PROMPT from "../../../../configs/xiaoxue/router.md"
import XIAOXUE_SAFETY_PROMPT from "../../../../configs/xiaoxue/safety.md"
import XIAOXUE_OUTPUT_RULES from "../../../../configs/xiaoxue/output_rules.md"
import XIAOXUE_OFFICE_PROMPT from "../../../../configs/xiaoxue/office.md"
import XIAOXUE_GEOLOGY_REPORT_PROMPT from "../../../../configs/xiaoxue/geology_report.md"
import XIAOXUE_TENDER_REVIEW_PROMPT from "../../../../configs/xiaoxue/tender_review.md"
import XIAOXUE_TENDER_BID_GENERATION_PROMPT from "../../../../configs/xiaoxue/tender_bid_generation.md"
import XIAOXUE_CONTRACT_REVIEW_PROMPT from "../../../../configs/xiaoxue/contract_review.md"
import XIAOXUE_KNOWLEDGE_QUERY_PROMPT from "../../../../configs/xiaoxue/knowledge_query.md"
import XIAOXUE_DOCUMENT_GENERATION_PROMPT from "../../../../configs/xiaoxue/document_generation.md"
import { Permission } from "@/permission"
import { mergeDeep, pipe, sortBy, values } from "remeda"
import { Global } from "@opencode-ai/core/global"
import path from "path"
import { Plugin } from "@/plugin"
import { Skill } from "../skill"
import { Effect, Context, Layer, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import * as Option from "effect/Option"
import * as OtelTracer from "@effect/opentelemetry/Tracer"
import { AbsolutePath, type DeepMutable } from "@opencode-ai/core/schema"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { LocationServiceMap, locationServiceMapLayer } from "@opencode-ai/core/location-services"
import { Reference } from "@opencode-ai/core/reference"
import { Location } from "@opencode-ai/core/location"
import { PluginV2 } from "@opencode-ai/core/plugin"

export const Info = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  mode: Schema.Literals(["subagent", "primary", "all"]),
  native: Schema.optional(Schema.Boolean),
  hidden: Schema.optional(Schema.Boolean),
  topP: Schema.optional(Schema.Finite),
  temperature: Schema.optional(Schema.Finite),
  color: Schema.optional(Schema.String),
  permission: PermissionV1.Ruleset,
  model: Schema.optional(
    Schema.Struct({
      modelID: ModelV2.ID,
      providerID: ProviderV2.ID,
    }),
  ),
  modelKey: Schema.optional(Schema.String),
  variant: Schema.optional(Schema.String),
  prompt: Schema.optional(Schema.String),
  options: Schema.Record(Schema.String, Schema.Unknown),
  steps: Schema.optional(Schema.Finite),
}).annotate({ identifier: "Agent" })
export type Info = DeepMutable<Schema.Schema.Type<typeof Info>>

const GeneratedAgent = Schema.Struct({
  identifier: Schema.String,
  whenToUse: Schema.String,
  systemPrompt: Schema.String,
})

export interface Interface {
  readonly get: (agent: string) => Effect.Effect<Info>
  readonly list: () => Effect.Effect<Info[]>
  readonly defaultInfo: () => Effect.Effect<Info>
  readonly defaultAgent: () => Effect.Effect<string>
  readonly generate: (input: {
    description: string
    model?: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
  }) => Effect.Effect<
    {
      identifier: string
      whenToUse: string
      systemPrompt: string
    },
    Provider.DefaultModelError
  >
}

type State = Omit<Interface, "generate">

export class Service extends Context.Service<Service, Interface>()("@opencode/Agent") {}

export const use = serviceUse(Service)

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const auth = yield* Auth.Service
    const plugin = yield* Plugin.Service
    const skill = yield* Skill.Service
    const provider = yield* Provider.Service
    const locations = yield* LocationServiceMap.Service

    const state = yield* InstanceState.make<State>(
      Effect.fn("Agent.state")(function* (ctx) {
        const cfg = yield* config.get()
        const skillDirs = yield* skill.dirs()
        const referenceDirs = Object.keys(cfg.references ?? cfg.reference ?? {}).length
          ? yield* Effect.gen(function* () {
              yield* (yield* PluginV2.Service).wait(PluginV2.ID.make("core/config-reference"))
              return (yield* (yield* Reference.Service).list()).map((reference) => reference.path)
            }).pipe(Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(ctx.directory) }))))
          : []
        const whitelistedDirs = [
          Truncate.GLOB,
          path.join(Global.Path.tmp, "*"),
          ...skillDirs.map((dir) => path.join(dir, "*")),
          ...referenceDirs.map((dir) => path.join(dir, "*")),
        ]
        const readonlyExternalDirectory = {
          "*": "ask",
          ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
        } satisfies Record<string, "allow" | "ask" | "deny">

        const defaults = Permission.fromConfig({
          "*": "allow",
          doom_loop: "ask",
          external_directory: {
            "*": "ask",
            ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
          },
          question: "deny",
          plan_enter: "deny",
          plan_exit: "deny",
          // mirrors github.com/github/gitignore Node.gitignore pattern for .env files
          read: {
            "*": "allow",
            "*.env": "ask",
            "*.env.*": "ask",
            "*.env.example": "allow",
          },
        })

        const user = Permission.fromConfig(cfg.permission ?? {})

        const agents: Record<string, Info> = {
          build: {
            name: "build",
            description: "The default agent. Executes tools based on configured permissions.",
            options: {},
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_enter: "allow",
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          xiaoxue: {
            name: "xiaoxue",
            description:
              "录井小雪 - 面向录井工程分公司的企业级知识与业务智能体，统一识别并路由报告审核、日常办公、标书、合同、知识查询和文档生成任务。",
            prompt: [XIAOXUE_SYSTEM_PROMPT, XIAOXUE_ROUTER_PROMPT, XIAOXUE_SAFETY_PROMPT, XIAOXUE_OUTPUT_RULES].join(
              "\n\n",
            ),
            options: {},
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
                question: "allow",
                read: "allow",
                skill: {
                  "*": "deny",
                  "cognitive-profile": "allow",
                  "contract-management": "allow",
                  "document-review-tracked": "allow",
                  "experiment-design": "allow",
                  "fullstack-dev": "allow",
                  "geolog-logging-review": "allow",
                  "geology-knowledge": "allow",
                  "knowledge-management": "allow",
                  "manim-agent": "allow",
                  "minimax-xlsx": "allow",
                  "mud-logging-report-generation": "allow",
                  "mud-logging-supervision": "allow",
                  obsidian: "allow",
                  "office-assistant": "allow",
                  "oilfield-it-project-management": "allow",
                  papercheck: "allow",
                  "pdfkit-py": "allow",
                  "pptx-generator": "allow",
                  "practical-course-producer": "allow",
                  "prompt-engineering-expert": "allow",
                  "research-baseline-builder": "allow",
                  "skill-governance": "allow",
                  "tender-management": "allow",
                  "tutor-skills": "allow",
                  "well-control-risk-assessment": "allow",
                },
                xiaoxue_memory: "allow",
                xiaoxue_obsidian_search: "allow",
                xiaoxue_obsidian_read: "allow",
                xiaoxue_obsidian_archive: "allow",
                xiaoxue_route: "allow",
                task: {
                  "*": "deny",
                  office: "allow",
                  report: "allow",
                  tender: "allow",
                  contract: "allow",
                  knowledge: "allow",
                  document: "allow",
                },
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          plan: {
            name: "plan",
            description: "Plan mode. Disallows all edit tools.",
            options: {},
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_exit: "allow",
                task: {
                  general: "deny",
                },
                external_directory: {
                  [path.join(Global.Path.data, "plans", "*")]: "allow",
                },
                edit: {
                  "*": "deny",
                  [path.join(".opencode", "plans", "*.md")]: "allow",
                  [path.relative(ctx.worktree, path.join(Global.Path.data, path.join("plans", "*.md")))]: "allow",
                },
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          general: {
            name: "general",
            description: `General-purpose agent for researching complex questions and executing multi-step tasks. Use this agent to execute multiple units of work in parallel.`,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                todowrite: "deny",
              }),
              user,
            ),
            options: {},
            mode: "subagent",
            native: true,
          },
          explore: {
            name: "explore",
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
                grep: "allow",
                glob: "allow",
                list: "allow",
                bash: "allow",
                skill: "allow",
                webfetch: "allow",
                websearch: "allow",
                read: "allow",
                external_directory: readonlyExternalDirectory,
              }),
              user,
            ),
            description: `Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns (eg. "src/components/**/*.tsx"), search code for keywords (eg. "API endpoints"), or answer questions about the codebase (eg. "how do API endpoints work?"). When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis across multiple locations and naming conventions.`,
            prompt: PROMPT_EXPLORE,
            options: {},
            mode: "subagent",
            native: true,
          },
          review: {
            name: "review",
            description:
              "旧会话兼容用通用文档审阅 Agent。新建地质录井报告审核任务必须使用 report；review 不作为首页或主 Agent 路由目标。",
            prompt:
              "你是旧会话兼容的通用文档审阅助手。仅检查文本完整性、前后一致性、表达规范和证据定位。地质录井报告审核应提示改用 report Agent，不得代替 geology_report_review 专业链路。",
            options: {},
            mode: "subagent",
            hidden: true,
            native: true,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
                grep: "allow",
                glob: "allow",
                list: "allow",
                read: "allow",
                skill: {
                  "*": "deny",
                },
              }),
              user,
            ),
          },
          office: {
            name: "office",
            description:
              "日常办公智能体，负责工作总结、汇报、会议纪要、整改清单、工作计划、技术方案、项目申报和材料润色。",
            prompt: XIAOXUE_OFFICE_PROMPT,
            options: {},
            mode: "subagent",
            native: true,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
                bash: "ask",
                edit: "ask",
                read: "allow",
                write: "ask",
                skill: {
                  "*": "deny",
                  "cognitive-profile": "allow",
                  "knowledge-management": "allow",
                  "oilfield-it-project-management": "allow",
                  "pptx-generator": "allow",
                  "prompt-engineering-expert": "allow",
                  "office-assistant": "allow",
                },
                office_document: "allow",
              }),
              user,
            ),
          },
          report: {
            name: "report",
            description: "地质录井报告审核智能体，使用真实附件和 geology_report_review 输出结构化审核结果。",
            prompt: XIAOXUE_GEOLOGY_REPORT_PROMPT,
            options: {},
            mode: "subagent",
            native: true,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
                bash: "ask",
                read: "allow",
                write: "ask",
                skill: {
                  "*": "deny",
                  "geolog-logging-review": "allow",
                  "pdfkit-py": "allow",
                  "geology-knowledge": "allow",
                  "document-review-tracked": "allow",
                  "mud-logging-supervision": "allow",
                  "well-control-risk-assessment": "allow",
                },
                geology_report_review: "allow",
              }),
              user,
            ),
          },
          tender: {
            name: "tender",
            description: "招投标文件解析、辅助审核和证据化投标章节生成 Agent。",
            prompt: [XIAOXUE_TENDER_REVIEW_PROMPT, XIAOXUE_TENDER_BID_GENERATION_PROMPT].join("\n\n"),
            options: {},
            mode: "subagent",
            native: true,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
                bash: "ask",
                read: "allow",
                write: "ask",
                skill: {
                  "*": "deny",
                  "pdfkit-py": "allow",
                  "tender-management": "allow",
                },
                tender_review: "allow",
              }),
              user,
            ),
          },
          contract: {
            name: "contract",
            description: "合同业务风险辅助审核 Agent，基于当前合同和我方立场输出证据化风险清单。",
            prompt: XIAOXUE_CONTRACT_REVIEW_PROMPT,
            options: {},
            mode: "subagent",
            native: true,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
                bash: "ask",
                read: "allow",
                write: "ask",
                skill: {
                  "*": "deny",
                  "pdfkit-py": "allow",
                  "contract-management": "allow",
                  "document-review-tracked": "allow",
                },
                contract_review: "allow",
              }),
              user,
            ),
          },
          knowledge: {
            name: "knowledge",
            description: "企业知识库查询 Agent，优先使用本地标准、制度、模板和案例并返回可定位来源。",
            prompt: XIAOXUE_KNOWLEDGE_QUERY_PROMPT,
            options: {},
            mode: "subagent",
            native: true,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
                bash: "ask",
                edit: "ask",
                grep: "allow",
                glob: "allow",
                list: "allow",
                read: "allow",
                write: "ask",
                skill: {
                  "*": "deny",
                  "cognitive-profile": "allow",
                  "experiment-design": "allow",
                  "fullstack-dev": "allow",
                  "knowledge-management": "allow",
                  obsidian: "allow",
                  "research-baseline-builder": "allow",
                  "skill-governance": "allow",
                  "tutor-skills": "allow",
                  "geology-knowledge": "allow",
                },
                knowledge_search: "allow",
                knowledge_manage: "allow",
              }),
              user,
            ),
          },
          document: {
            name: "document",
            description: "专业文档生成 Agent，负责将已确认内容导出为正式文件，不负责产生新的专业结论。",
            prompt: XIAOXUE_DOCUMENT_GENERATION_PROMPT,
            options: {},
            mode: "subagent",
            native: true,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
                bash: "ask",
                edit: "ask",
                read: "allow",
                write: "ask",
                skill: {
                  "*": "deny",
                  "knowledge-management": "allow",
                  "minimax-xlsx": "allow",
                  papercheck: "allow",
                  "pdfkit-py": "allow",
                  "pptx-generator": "allow",
                  "office-assistant": "allow",
                  "mud-logging-report-generation": "allow",
                  "document-review-tracked": "allow",
                },
                office_document: "allow",
              }),
              user,
            ),
          },
          compaction: {
            name: "compaction",
            mode: "primary",
            native: true,
            hidden: true,
            prompt: PROMPT_COMPACTION,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
              }),
              user,
            ),
            options: {},
          },
          title: {
            name: "title",
            mode: "primary",
            options: {},
            native: true,
            hidden: true,
            temperature: 0.5,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
              }),
              user,
            ),
            prompt: PROMPT_TITLE,
          },
          summary: {
            name: "summary",
            mode: "primary",
            options: {},
            native: true,
            hidden: true,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
              }),
              user,
            ),
            prompt: PROMPT_SUMMARY,
          },
        }

        for (const [key, value] of Object.entries(cfg.agent ?? {})) {
          if (value.disable) {
            delete agents[key]
            continue
          }
          let item = agents[key]
          if (!item)
            item = agents[key] = {
              name: key,
              mode: "all",
              permission: Permission.merge(defaults, user),
              options: {},
              native: false,
            }
          // model_key references a stable registry entry so editing the underlying
          // modelId never breaks agent bindings; legacy "providerID/modelID" strings
          // keep working and are cascade-updated by the registry on edit.
          const modelKey = (value as { model_key?: unknown }).model_key
          if (typeof modelKey === "string" && modelKey) {
            const resolved = yield* Effect.promise(() => ModelRegistry.resolveAgentModel({ modelKey }))
            item.model = {
              providerID: ProviderV2.ID.make(resolved.providerID),
              modelID: ModelV2.ID.make(resolved.modelID),
            }
            item.modelKey = modelKey
          } else if (value.model) item.model = Provider.parseModel(value.model)
          item.variant = value.variant ?? item.variant
          item.prompt = value.prompt ?? item.prompt
          item.description = value.description ?? item.description
          item.temperature = value.temperature ?? item.temperature
          item.topP = value.top_p ?? item.topP
          item.mode = value.mode ?? item.mode
          item.color = value.color ?? item.color
          item.hidden = value.hidden ?? item.hidden
          item.name = value.name ?? item.name
          item.steps = value.steps ?? item.steps
          item.options = mergeDeep(item.options, value.options ?? {})
          item.permission = Permission.merge(item.permission, Permission.fromConfig(value.permission ?? {}))
        }

        if (cfg.xiaoxue?.approval_mode === "request") {
          const approval = Permission.fromConfig({
            bash: "ask",
            external_directory: "ask",
            webfetch: "ask",
            websearch: "ask",
          })
          for (const agent of Object.values(agents)) {
            if (agent.hidden) continue
            agent.permission = Permission.merge(agent.permission, approval)
          }
        }

        // Ensure Truncate.GLOB is allowed unless explicitly configured
        for (const name in agents) {
          const agent = agents[name]
          const explicit = agent.permission.some((r) => {
            if (r.permission !== "external_directory") return false
            if (r.action !== "deny") return false
            return r.pattern === Truncate.GLOB
          })
          if (explicit) continue

          agents[name].permission = Permission.merge(
            agents[name].permission,
            Permission.fromConfig({ external_directory: { [Truncate.GLOB]: "allow" } }),
          )
        }

        const get = Effect.fnUntraced(function* (agent: string) {
          return agents[agent]
        })

        const list = Effect.fnUntraced(function* () {
          const cfg = yield* config.get()
          return pipe(
            agents,
            values(),
            sortBy(
              [(x) => (cfg.default_agent ? x.name === cfg.default_agent : x.name === "xiaoxue"), "desc"],
              [(x) => x.name, "asc"],
            ),
          )
        })

        const defaultInfo = Effect.fnUntraced(function* () {
          const c = yield* config.get()
          if (c.default_agent) {
            const agent = agents[c.default_agent]
            if (!agent) throw new Error(`default agent "${c.default_agent}" not found`)
            if (agent.mode === "subagent") throw new Error(`default agent "${c.default_agent}" is a subagent`)
            if (agent.hidden === true) throw new Error(`default agent "${c.default_agent}" is hidden`)
            return agent
          }
          // 小雪 is the branded default primary agent for this fork; without
          // this, insertion order would pick "build" and drop the xiaoxue prompt.
          const xiaoxue = agents["xiaoxue"]
          if (xiaoxue && xiaoxue.mode !== "subagent" && xiaoxue.hidden !== true) return xiaoxue
          const visible = Object.values(agents).find((a) => a.mode !== "subagent" && a.hidden !== true)
          if (!visible) throw new Error("no primary visible agent found")
          return visible
        })

        const defaultAgent = Effect.fnUntraced(function* () {
          return (yield* defaultInfo()).name
        })

        return {
          get,
          list,
          defaultInfo,
          defaultAgent,
        } satisfies State
      }),
    )

    return Service.of({
      get: Effect.fn("Agent.get")(function* (agent: string) {
        return yield* InstanceState.useEffect(state, (s) => s.get(agent))
      }),
      list: Effect.fn("Agent.list")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.list())
      }),
      defaultInfo: Effect.fn("Agent.defaultInfo")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.defaultInfo())
      }),
      defaultAgent: Effect.fn("Agent.defaultAgent")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.defaultAgent())
      }),
      generate: Effect.fn("Agent.generate")(function* (input: {
        description: string
        model?: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
      }) {
        const cfg = yield* config.get()
        const model = input.model ?? (yield* provider.defaultModel())
        const resolved = yield* provider.getModel(model.providerID, model.modelID)
        const language = yield* provider.getLanguage(resolved)
        const tracer = cfg.experimental?.openTelemetry
          ? Option.getOrUndefined(yield* Effect.serviceOption(OtelTracer.OtelTracer))
          : undefined

        const system = [PROMPT_GENERATE]
        yield* plugin.trigger("experimental.chat.system.transform", { model: resolved }, { system })
        const existing = yield* InstanceState.useEffect(state, (s) => s.list())

        // TODO: clean this up so provider specific logic doesnt bleed over
        const authInfo = yield* auth.get(model.providerID).pipe(Effect.orDie)
        const isOpenaiOauth = model.providerID === "openai" && authInfo?.type === "oauth"

        const params = {
          experimental_telemetry: {
            isEnabled: cfg.experimental?.openTelemetry,
            tracer,
            metadata: {
              userId: cfg.username ?? "unknown",
            },
          },
          temperature: 0.3,
          messages: [
            ...(isOpenaiOauth
              ? []
              : system.map(
                  (item): ModelMessage => ({
                    role: "system",
                    content: item,
                  }),
                )),
            {
              role: "user",
              content: `Create an agent configuration based on this request: "${input.description}".\n\nIMPORTANT: The following identifiers already exist and must NOT be used: ${existing.map((i) => i.name).join(", ")}\n  Return ONLY the JSON object, no other text, do not wrap in backticks`,
            },
          ],
          model: language,
          schema: Object.assign(
            Schema.toStandardSchemaV1(GeneratedAgent),
            Schema.toStandardJSONSchemaV1(GeneratedAgent),
          ),
        } satisfies Parameters<typeof generateObject>[0]

        if (isOpenaiOauth) {
          return yield* Effect.promise(async () => {
            const result = streamObject({
              ...params,
              providerOptions: ProviderTransform.providerOptions(resolved, {
                instructions: system.join("\n"),
                store: false,
              }),
              onError: () => {},
            })
            for await (const part of result.fullStream) {
              if (part.type === "error") throw part.error
            }
            return result.object
          })
        }

        return yield* Effect.promise(() => generateObject(params).then((r) => r.object))
      }),
    })
  }),
)

const locationServiceMapNode = LayerNode.make({
  service: LocationServiceMap.Service,
  layer: locationServiceMapLayer,
  deps: [],
})

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [Config.node, Auth.node, Plugin.node, Skill.node, Provider.node, locationServiceMapNode],
})

export * as Agent from "./agent"
