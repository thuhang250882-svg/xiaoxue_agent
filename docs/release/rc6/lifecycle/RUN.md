# RC6 Clean-Machine Lifecycle — RUN

日期：2026-08-22
目标：在干净 Windows 工作站上跑 RC6 真实 model E2E，调 `xiaoxue_default` model 跑完整 46 case Acceptance Matrix。

## 1. 干净工作站前置条件

- Windows 10/11 64-bit
- 已安装 packaged Desktop（从 `rc6-packaged-resource-validation` 阶段产物，或 `bun run electron-forge:start` 启动 dev 模式）
- Bun ≥ 1.3
- 已设置 `XIAOXUE_API_KEY` 环境变量（或 `~/.xiaoxue/credentials.json` 中含 `apiKey`）
- 网络可访问 model provider 端点

## 2. 完整 lifecycle 流程

```bash
# 第 1 步：环境自检（须 8/8 通过）
bun ./scripts/rc6-lifecycle/install-checklist.ts --strict

# 第 2 步：生成脱敏 fixture（4 个核心 Skill）
bun ./scripts/rc6-lifecycle/synthesized-fixture.ts --all

# 第 3 步：逐 Skill 跑 model E2E
bun ./scripts/rc6-lifecycle/model-e2e-runner.ts \
  --skill knowledge-distill \
  --fixture ./fixtures/rc6-lifecycle/knowledge-distill/synthetic-standard-001.md

bun ./scripts/rc6-lifecycle/model-e2e-runner.ts \
  --skill tender-document-review \
  --fixture ./fixtures/rc6-lifecycle/tender-document-review/synthetic-tender-001.md

bun ./scripts/rc6-lifecycle/model-e2e-runner.ts \
  --skill tender-bid-generation \
  --fixture ./fixtures/rc6-lifecycle/tender-bid-generation/synthetic-requirement-matrix.json

bun ./scripts/rc6-lifecycle/model-e2e-runner.ts \
  --skill 审查合同 \
  --fixture ./fixtures/rc6-lifecycle/审查合同/synthetic-contract-001.md

# 第 4 步：跑完整 Acceptance Matrix
bun ./scripts/rc6-lifecycle/acceptance-runner.ts \
  --fixture-dir ./fixtures/rc6-lifecycle/

# 第 5 步：交叉验证 rc6-model-e2e 静态 harness（前置门禁仍有效）
bun ./scripts/rc6-e2e/static-analysis.ts --strict
bun ./scripts/rc6-e2e/trigger-mutex.ts
bun ./scripts/rc6-e2e/prompt-injection-guard.ts
```

## 3. 退出条件

- `install-checklist`：8/8 通过
- `acceptance-runner`：46 cases 全部 `pass` 或 `skipped`（无 hard threshold fail）
- 4 个 Skill 的 model E2E JSON 输出落入 `docs/release/rc6/lifecycle/results/<timestamp>/`
- 静态 harness 3 个仍通过

## 4. 真实 model 调用的额外要求

1. **不要**修改 SKILL.md frontmatter（这是 RC6 业务 Skill 的契约）
2. **不要**复制真实业务文档到 fixture（必须用 synthesized fixture）
3. **不要**在 prompt 中嵌入真实客户名称、井号、合同金额
4. **必须**对每个 case 产出 prompt/response/transcript JSON 到 `results/`
5. **必须**遵守 Acceptance Matrix 第 5 节 Prompt Injection 测试约束（不执行删除、上传等动作）

## 5. 已知限制

- 真实 model 调用无法在 sandbox 内完成
- API key 不在本仓库内提交（仅 env var）
- 真实 prompt/response 内容可能含敏感信息，落盘后须人工审查

## 6. 与 RC6 模型对话

如果需要在 packaged Desktop 启动后用真实对话驱动 Skill，可手工操作：

```
1. 启动 packaged Desktop
3. 在 chat 框输入："请帮我总结这些标准：[粘贴 ./fixtures/.../synthetic-standard-001.md 内容]"
4. 观察 model 是否触发 knowledge-distill Skill 并输出符合 Acceptance Matrix 的事实卡
5. 复制 chat 历史到 docs/release/rc6/lifecycle/results/<timestamp>/chat-<skill>.md
```