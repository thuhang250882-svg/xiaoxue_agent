# RC6 Clean-Machine Lifecycle — Manifest

日期：2026-08-22
分支：`rc6-clean-machine-lifecycle`
HEAD：见 `rc6-clean-machine-lifecycle-2026-08-22.md`

> 本阶段交付的是 **真实 model E2E 框架**：在干净 Windows 工作站上启动 packaged Desktop（不打包模式），调用 `xiaoxue_default` model 跑完整 Acceptance Matrix。Sandbox 内只验证流程契约，不实际调 model。

## 1. 工具总览

| 脚本 | 用途 | 沙盒可跑 | 真实工作站必需 |
| --- | --- | --- | --- |
| `scripts/rc6-lifecycle/install-checklist.ts` | 启动前环境自检 | ✓ | ✓ |
| `scripts/rc6-lifecycle/synthesized-fixture.ts` | 生成脱敏 fixture | ✓ | ✓ |
| `scripts/rc6-lifecycle/model-e2e-runner.ts` | 单 case 调 model 跑端到端 | mock 模式 | 真实 model |
| `scripts/rc6-lifecycle/acceptance-runner.ts` | 跑完整 46 case Acceptance Matrix | dry-run / mock | 真实 model |

## 2. 结果（沙盒自检）

| 项目 | 状态 | 备注 |
| --- | --- | --- |
| `install-checklist` | 7/8 | 仅 `xiaoxue_default API key` 在沙盒不可用（需 `XIAOXUE_API_KEY` env var） |
| `synthesized-fixture --all` | 4 文件生成 | knowledge-distill / tender-document-review / tender-bid-generation / 审查合同 |
| `acceptance-runner --dry-run` | 46 cases 列出 | 5 节 × Skill + 1 节 Prompt Injection + 1 节 Trigger |
| `model-e2e-runner --mock-llm` | 1 case 写出 | 验证 harness 流程契约 |

## 3. Sandbox 限制（不能在沙盒执行的部分）

1. PowerShell 沙盒无法启动 packaged Desktop GUI
2. 默认 model `xiaoxue_default` 的 API key 在沙盒不可用
3. Bun.spawn 调用 model provider 在沙盒需 `--allow-net`
4. 真实 prompt/response/transcript 需要真实 model 才能产出

→ 真实 model E2E 必须在干净 Windows 工作站上跑。

## 4. 文件清单

```
scripts/rc6-lifecycle/
├── install-checklist.ts        # 启动前环境自检
├── synthesized-fixture.ts      # 脱敏业务文档 fixture 生成器
├── model-e2e-runner.ts         # 单 case 调 model 跑端到端 (含 mock 模式)
└── acceptance-runner.ts        # 完整 46 case Acceptance Matrix runner

fixtures/rc6-lifecycle/
├── knowledge-distill/synthetic-standard-001.md
├── tender-document-review/synthetic-tender-001.md
├── tender-bid-generation/synthetic-requirement-matrix.json
└── 审查合同/synthetic-contract-001.md

docs/release/rc6/lifecycle/
├── MANIFEST.md                       # 本文件
├── RUN.md                            # 干净工作站操作手册
├── install-checklist-result.txt      # 沙盒自检结果
├── acceptance-runner-dryrun.txt      # 46 case dry-run 输出
└── results/<timestamp>/<skill>.json  # 真实 model E2E 输出（待生成）
```

## 5. 退出条件

- `install-checklist`：8/8 全部通过（含 API key）
- `synthesized-fixture`：4 个核心 Skill fixture 已生成
- `acceptance-runner`：46 cases 全部跑过，状态非 `pending` 且无 hard threshold fail
- `model-e2e-runner`：每个 case 产出 prompt/response/transcript JSON

→ 满足以上条件后，本阶段结束，下一阶段进入 RC6 candidate tag/release 准备。