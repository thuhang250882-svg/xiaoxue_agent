import { Effect, Schema } from "effect"
import { routeXiaoxueTask } from "@/agent/xiaoxue-router"
import { Tool } from "./tool"

const Parameters = Schema.Struct({
  task: Schema.String,
})

export const XiaoxueRouterTool = Tool.define(
  "xiaoxue_route",
  Effect.succeed({
    description: "识别录井小雪当前任务应进入的业务 Agent。明确任务必须先使用确定性路由结果。",
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
