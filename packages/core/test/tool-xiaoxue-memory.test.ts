import { describe, expect } from "bun:test"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { MemoryContext, type ManageInput } from "@opencode-ai/core/memory-context"
import { PermissionV2 } from "@opencode-ai/core/permission"
import { SessionV2 } from "@opencode-ai/core/session"
import { ToolOutputStore } from "@opencode-ai/core/tool-output-store"
import { ToolRegistry } from "@opencode-ai/core/tool/registry"
import { XiaoxueMemoryTool } from "@opencode-ai/core/tool/xiaoxue-memory"
import { Effect, Layer } from "effect"
import { testEffect } from "./lib/effect"
import { settleTool, toolDefinitions, toolIdentity } from "./lib/tool"

const sessionID = SessionV2.ID.make("ses_xiaoxue_memory_tool_test")
const assertions: PermissionV2.AssertInput[] = []
const inputs: ManageInput[] = []

const permission = Layer.succeed(
  PermissionV2.Service,
  PermissionV2.Service.of({
    assert: (input) => Effect.sync(() => assertions.push(input)),
    ask: () => Effect.die("unused"),
    reply: () => Effect.die("unused"),
    get: () => Effect.die("unused"),
    forSession: () => Effect.die("unused"),
    list: () => Effect.die("unused"),
  }),
)
const memory = MemoryContext.layerWith({
  recall: () => Effect.succeed(""),
  manage: (input) =>
    Effect.sync(() => {
      inputs.push(input)
      return { success: true, message: "已更新长期记忆。", entries: [input.content ?? ""] }
    }),
})
const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([ToolRegistry.node, ToolRegistry.toolsNode, XiaoxueMemoryTool.node]),
    [
      [MemoryContext.node, memory],
      [PermissionV2.node, permission],
      [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
    ],
  ),
)

describe("XiaoxueMemoryTool", () => {
  it.effect("registers the V2 tool and delegates an approved write", () =>
    Effect.gen(function* () {
      assertions.length = 0
      inputs.length = 0
      const registry = yield* ToolRegistry.Service
      const input = { action: "add" as const, target: "memory" as const, content: "项目默认分支是 dev。" }

      expect((yield* toolDefinitions(registry)).map((tool) => tool.name)).toEqual([XiaoxueMemoryTool.name])
      expect(
        yield* settleTool(registry, {
          sessionID,
          ...toolIdentity,
          call: { type: "tool-call", id: "call-memory", name: XiaoxueMemoryTool.name, input },
        }),
      ).toMatchObject({
        result: { type: "text", value: expect.stringContaining("已更新长期记忆") },
        output: { structured: { success: true, message: "已更新长期记忆。" } },
      })
      expect(inputs).toEqual([input])
      expect(assertions).toMatchObject([
        { sessionID, action: XiaoxueMemoryTool.name, resources: ["*"], save: ["*"] },
      ])
    }),
  )
})

