import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import type { Agent } from "./agent"

/**
 * Build the `permission` ruleset for a subagent's session when it's spawned
 * via the task tool. Combines:
 *
 * 1. The parent session's deny rules and external_directory rules.
 *    Parent agent restrictions only govern that agent; the subagent's own
 *    permissions determine its capabilities.
 * 2. Default `todowrite` and `task` denies if the subagent's own ruleset
 *    doesn't already permit them.
 */
export function deriveSubagentSessionPermission(input: {
  parentSessionPermission: PermissionV1.Ruleset
  subagent: Agent.Info
}): PermissionV1.Ruleset {
  const canTask = input.subagent.permission.some((rule) => rule.permission === "task")
  const canTodo = input.subagent.permission.some((rule) => rule.permission === "todowrite")
  return [
    // 只继承父会话的"具体" deny 规则与 external_directory 规则。父会话的
    // catch-all deny（permission="*"）绝不能继承：运行时合并顺序为
    // [子代理自身权限, 会话权限] 且 evaluate 取最后一条匹配——继承
    // catch-all deny 等于子代理自己的全部 allow（bash/read/白名单）都被
    // 否决，表现为"工具静默失败、Read 全路径拒绝"（实测让知识导入子代理
    // 完全瘫痪）。
    ...input.parentSessionPermission.filter(
      (rule) =>
        rule.permission === "external_directory" ||
        (rule.action === "deny" && rule.permission !== "*"),
    ),
    ...(canTodo ? [] : [{ permission: "todowrite" as const, pattern: "*" as const, action: "deny" as const }]),
    ...(canTask ? [] : [{ permission: "task" as const, pattern: "*" as const, action: "deny" as const }]),
  ]
}
