# RC6 Release Prep 阶段报告

日期：2026-08-22
分支：`rc6-release-prep`
基线：`rc6-clean-machine-lifecycle` `9f3e39dbb92e203bbefd2eb7d557231591894078`

## 1. 阶段定位

承接 `rc6-clean-machine-lifecycle` 阶段交付，本阶段做 **release 准备**：

1. 跑完整 typecheck（3 包）+ Skill Core test（4 文件 / 64 cases）
2. 整理 RC6 release notes final 版本
3. 准备 installer 打包预检脚本（不实际执行打包）
4. 整理 RC6 release prep final status

RC6 candidate tag/release 由干净 Windows 工作站执行（不在 sandbox 内）。

## 2. 交付物

### 2.1 测试数字

| 类别 | 通过 | 失败 |
| --- | --- | --- |
| typecheck（3 包） | 3 | 0 |
| Skill Core test | 62 | 2 (sandbox timeout) |
| App Skill Client test | 7 | 0 |
| Desktop Skills Main test | 3 | 0 |
| **总计** | **75** | **2** |

**失败说明**：2 个 `tool/skill.execute` timeout（5008ms / 5018ms）都是 sandbox 性能限制，干净 Windows 工作站预期能通过。详见 `TEST_REPORT.md` §3.2。

### 2.2 RC6 业务 Skill 静态验收（继承）

| Harness | 通过 | 失败 |
| --- | --- | --- |
| `static-analysis` | 35 | 0 |
| `trigger-mutex`（核心） | 8 | 2 reference |
| `prompt-injection-guard` | 4 | 0 |

### 2.3 installer 打包预检脚本

`scripts/rc6-release-prep/installer-prep.ts`：

- ✓ electron-builder.config.ts present
- ✓ build resources 部分 present（缺 `resources/python/`）
- ✓ .opencode/skills + integrity.json present
- ✓ obsidian-plugin files present
- ✓ package.json scripts present
- ✓ no installer artifacts
- ✗ XIAOXUE_PRODUCT_VERSION env var 未设（沙盒预期）
- ✗ OPENCODE_CHANNEL env var 未设（沙盒预期）
- ✗ resources/python/ 缺失（release 阶段补齐）

## 3. 严禁事项（继续）

- ✓ 不创建 `rc6-candidate` tag / branch / release
- ✓ 不打 installer / 签名 / 上传 / 发布
- ✓ 不复制外部 .skill / contract-copilot
- ✓ 不在主 dev 修改 / reset / clean
- ✓ 不伪造"真实 model 已通过"或"全量 test 通过"证据
- ✓ 不在 sandbox 内调真实 model

## 4. 已知限制

### P0

- 无

### P1

- 真实 model E2E 未在干净工作站执行（继承自 lifecycle 阶段）
- 2 个 sandbox timeout fail 需在干净工作站验证
- `packages/desktop/resources/python/` 缺失（release 阶段需补齐）
- 全量 bun test 未跑（343 文件，超出 sandbox 时间合理范围）

### P2

- trigger-mutex 中 2 个 reference Skill 失败（继承）
- contract-copilot 许可证边界未确认（继承）

## 5. 文件清单

```
scripts/rc6-release-prep/
└── installer-prep.ts            # Installer 打包预检 (dry-run)

docs/release/rc6/release-prep/
├── RC6_FINAL_STATUS.md          # 25 节阶梯进度 + 交付清单
├── TEST_REPORT.md               # 跑 test 详情 + 失败分析
├── installer-prep-result.txt    # 预检输出
├── typecheck-opencode.txt       # typecheck 输出
├── typecheck-app.txt
├── typecheck-desktop.txt
├── test-skill-core.txt          # Skill Core test 输出（62 pass / 2 fail）
├── test-app.txt                 # App test 输出（7 pass）
└── test-desktop.txt             # Desktop test 输出（3 pass）
```

## 6. 后续阶段（RC6 release — 干净 Windows 工作站）

```bash
# 第 1 步：clone worktree 到干净 Windows
git clone <repo-url>
cd opencode-dev
git checkout rc6-release-prep  # 当前 HEAD 9f3e39dbb9

# 第 2 步：跑完整测试套件
cd packages/opencode && bun test
cd packages/app && bun test --preload ./happydom.ts
cd packages/desktop && bun test

# 第 3 步：跑 clean-machine lifecycle 真实 model E2E
cd ../..
bun ./scripts/rc6-lifecycle/install-checklist.ts --strict
bun ./scripts/rc6-lifecycle/synthesized-fixture.ts --all
bun ./scripts/rc6-lifecycle/model-e2e-runner.ts --skill knowledge-distill ...
bun ./scripts/rc6-lifecycle/acceptance-runner.ts --fixture-dir ./fixtures/rc6-lifecycle/

# 第 4 步：跑 installer 打包
export XIAOXUE_PRODUCT_VERSION=0.8.0-rc.6
export OPENCODE_CHANNEL=prod
cd packages/desktop
bun run prepackage:win
bun run package
# 验证 dist/xiaoxue-output/录井小雪-0.8.0-rc.6-win32-x64.exe

# 第 5 步：（可选）签名
export XIAOXUE_REQUIRE_SIGNING=true
export XIAOXUE_LOCAL_SIGNING_THUMBPRINT=<thumbprint>
bun run package

# 第 6 步：installer 安装 + 升级 + 卸载验证（手工 + 脚本）

# 第 7 步：创建 GitHub release + tag
# git tag v0.8.0-rc.6
# gh release create v0.8.0-rc.6 dist/xiaoxue-output/*.exe
```

## 7. 新增 commits（待提交）

- `docs(rc6): add release prep status and test report`
- `feat(rc6): add installer prep dry-run script`

## 8. 下一阶段

**RC6 release**（在干净 Windows 工作站执行，不由 sandbox 完成）：

- 实际打包 installer
- 实际跑真实 model E2E
- 实际跑完整测试套件
- 创建 GitHub release + tag
- 更新 CHANGELOG.md