import { Effect, Schema } from "effect"
import { routeXiaoxueTask } from "@/agent/xiaoxue-router"
import { Tool } from "./tool"

const Parameters = Schema.Struct({
  task: Schema.String,
})

export const XiaoxueRouterTool = Tool.define(
  "xiaoxue_route",
  Effect.succeed({
    description:
      "识别录井小雪当前任务应进入的业务 Agent 和 Skill。明确任务必须先使用确定性路由结果；返回后立即用 skill Tool 加载结果中的 skill，再通过 task 委派给结果中的 agent。",
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>) =>
      Effect.succeed({
        title: "录井小雪任务路由",
        output: JSON.stringify({ type: "xiaoxue_route_result", ...routeXiaoxueTask(params.task) }),
        metadata: {
          type: "xiaoxue_route_result",
          ...routeXiaoxueTask(params.task),
        },
      }),
  }),
)
