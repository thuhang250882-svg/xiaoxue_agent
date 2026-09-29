# 小雪记忆工作树收尾审查（2026-09-29）

基线：`dev@9541b46a69`；来源：`memory-evolution@cc7076da62` 加该工作树未提交内容。该分支的提交均已包含在 `dev`。本次只比较工作区差异，不以旧工作树覆盖当前实现。

## 差异决定

| 来源文件 | 审查结果 | 处理 |
| --- | --- | --- |
| `packages/app/src/components/settings-v2/xiaoxue-knowledge.tsx` | 来源仍为默认关闭、人工确认候选的旧界面；当前 `dev` 已有默认自动整理和旧候选处理入口 | 不移植 |
| `packages/app/src/components/settings-v2/xiaoxue-knowledge.test.ts` | 来源少了当前自动整理行为的测试 | 不移植 |
| `packages/core/src/v1/config/config.ts` | 来源描述旧默认值（6000/1200、默认关闭）；当前值与现行界面一致 | 不移植 |
| `packages/opencode/src/xiaoxue/memory.ts` | 来源缺少用户/项目范围、目录证据、迁移与自动安全发布；原有人工确认入口在当前实现中仍保留 | 不移植 |
| `packages/opencode/src/xiaoxue/memory-review.ts` | 来源缺少当前工作流学习扫描、范围约束及已有记忆去重上下文 | 不移植 |
| `packages/opencode/test/memory/memory.test.ts` | 当前多了迁移、跨工作区隔离和自动发布测试 | 不移植 |
| `packages/opencode/test/memory/memory-review.test.ts` | 当前多了 V1/V2 工作流提取和最近用户消息测试 | 不移植 |
| `packages/sdk/js/src/v2/gen/types.gen.ts` | 来源是较早生成结果，缺少当前 Provider `chunkTimeout` 类型；生成文件不能手工覆盖 | 不移植 |
| `docs/product/XIAOXUE_MEMORY_EVOLUTION_IMPLEMENTATION_20260911.md` | 历史阶段记录明确标注真实 Provider、桌面与跨日验收未完成，其中默认关闭和人工确认流程已过时 | 留在来源工作树作历史证据，不当作当前操作说明 |

其余 58 项工作区文本内容与 `dev` 相同（换行差异已归一化）。本次未发现需要从来源工作树移植的独有能力。来源工作树仍有未提交内容，应保持原位，待其所有者确认不再需要历史工作区后再归档；不以删除或重置目录作为清理方式。

本审查只比较代码和文档；真实 Provider、跨日运行和办公电脑桌面行为仍需单独验收。
