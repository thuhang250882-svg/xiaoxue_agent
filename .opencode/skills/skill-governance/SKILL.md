---
name: skill-governance
description: 审计、合并、优化和验证本地 Agent Skill，包括重复能力识别、触发边界治理、结构检查、离线依赖审查和可恢复下线。用于 Skill 清理、评分、重构或批量治理，不评估 MCP 服务。
---

# Skill 治理

面向本地 Skill 集合执行可审计、可恢复的治理。

## 工作原则

1. 先记录来源、名称、描述、资源、调用方和网络依赖，再提出变更。
2. 同一业务的多个入口合并为一个主 Skill，详细模式放入 `references/` 并按需加载。
3. 工具能力与业务能力分开；描述只覆盖真实触发场景，避免“任何相关任务都必须触发”。
4. 下线前备份或确认 Git 可恢复，并同步更新白名单、路由、配置和测试。
5. 办公网构建不得保留隐式公网调用、下载、登录、API Key 或 GitHub 依赖。
6. 用结构校验、真实发现、路由用例和代表性任务验证，不用只匹配文案的测试代替行为证据。

## 参考与脚本

- 需要旧版评分维度时读取 [audit-legacy.md](references/audit-legacy.md)。
- 需要旧版迭代优化方法时读取 [optimization-legacy.md](references/optimization-legacy.md)，但其中的 GitHub 或外部发布步骤一律不执行。
- `scripts/` 与 `vendor/` 提供本地结构和触发测试；运行前使用隔离临时目录。
