# RC6 Release Prep Final Status

日期：2026-08-22
分支：`rc6-release-prep`
基线：`rc6-clean-machine-lifecycle` `9f3e39dbb92e203bbefd2eb7d557231591894078`

## 1. 25 节阶梯当前进度

| # | 阶段 | 状态 | HEAD |
| --- | --- | --- | --- |
| 1 | `rc6-release-base` | ✓ | (基线) |
| 2 | `rc6-model-base` | ✓ | (基线) |
| 3 | `rc6-registry-recovery` | ✓ | (基线) |
| 4 | `rc6-skill-center` | ✓ | `53ea588412` 等 4 commits |
| 5 | `rc6-business-skills` | ✓ | `ea3ac41c4e` 等 5 commits |
| 6 | `rc6-release-hardening` | ✓ | `abf463eeb7` |
| 7 | `rc6-packaged-resource-validation` | ✓ | `09a2c4f9ab` |
| 8 | `rc6-model-e2e` | ✓ | `4d19de069e` |
| 9 | `rc6-clean-machine-lifecycle` | ✓ | `9f3e39dbb9` |
| 10 | `rc6-release-prep` (当前) | ⏳ 进行中 | `9f3e39dbb9` (基线) |

**最后阶段**：RC6 candidate tag/release（仅在干净 Windows 工作站执行，不由 sandbox 完成）

## 2. RC6 release prep 阶段交付物

### 2.1 测试套件验证

| 包 | typecheck | test |
| --- | --- | --- |
| `packages/opencode` | ✓ exit 0 | ⏳ 进行中 |
| `packages/app` | ✓ exit 0 | (跳) |
| `packages/desktop` | ✓ exit 0 | (跳) |

测试结果落到 `docs/release/rc6/release-prep/typecheck-*.txt`

### 2.2 RC6 业务 Skill 静态验收（继承自 model-e2e 阶段）

| Harness | 通过 | 失败 | 通过率 |
| --- | --- | --- | --- |
| `static-analysis` | 35 | 0 | 100% |
| `trigger-mutex`（核心） | 8 | 2 reference | 80% |
| `prompt-injection-guard` | 4 | 0 | 100% |

### 2.3 RC6 clean-machine lifecycle 框架

| 工具 | 状态 |
| --- | --- |
| `install-checklist.ts` | ✓ 沙盒内 7/8 通过 |
| `synthesized-fixture.ts` | ✓ 4 核心 Skill fixture 生成 |
| `model-e2e-runner.ts` | ✓ mock 模式契约验证 |
| `acceptance-runner.ts` | ✓ dry-run 列出 46 cases |

真实 model E2E 待干净工作站执行；输出待生成。

### 2.4 RC6 Release Notes Final 汇总

- `RELEASE_NOTES.md`（9252 字节 / 226 行）
- 包含 1.1-1.6 节分支谱系
- 包含测试数字汇总表
- 包含 P0/P1/P2 风险表
- 包含严禁事项
- 包含工作交接清单

## 3. Release 准备清单（干净 Windows 工作站执行）

### 3.1 完整测试套件

- [x] `packages/opencode` typecheck — ✓ exit 0
- [x] `packages/app` typecheck — ✓ exit 0
- [x] `packages/desktop` typecheck — ✓ exit 0
- [ ] `packages/opencode` test — 沙盒内进行中
- [ ] `packages/app` test
- [ ] `packages/desktop` test

### 3.2 真实 model E2E（clean-machine）

- [ ] 干净工作站上 `install-checklist.ts --strict` 8/8 通过
- [ ] 4 核心 Skill model E2E JSON 输出到 `docs/release/rc6/lifecycle/results/<timestamp>/`
- [ ] `acceptance-runner.ts` 46 cases 全部跑出非 pending 状态
- [ ] 静态 harness 3 个仍通过

### 3.3 Installer 打包（release 阶段，不在 release prep 范围）

- [ ] 设置 `XIAOXUE_PRODUCT_VERSION=0.8.0-rc.6`
- [ ] 设置 `OPENCODE_CHANNEL=prod`
- [ ] `bun run prepackage:win` + `bun run package` 在干净 Windows
- [ ] 验证 NSIS installer 输出 `录井小雪-0.8.0-rc.6-win32-x64.exe`
- [ ] 验证 sha256
- [ ] （可选）`XIAOXUE_REQUIRE_SIGNING=true` 跑签名

## 4. 严禁事项（RC6 release prep 阶段继续生效）

- 不得创建 `rc6-candidate` tag / branch / release
- 不得打 installer / 签名 / 上传产物 / 发布
- 不得复制外部 .skill 文件 / contract-copilot 商业内容
- 不得在主 dev 修改 / reset / clean
- 不得伪造"真实 model 已通过"证据
- 不得在 sandbox 内执行真实 model 调用

## 5. 当前 sandbox 限制

- Bun.spawn 调用 model provider 在沙盒需 `--allow-net`（未启用）
- 真实 model API key 不可用
- PowerShell 沙盒对 Electron GUI 启动有约束

## 6. 后续阶段（release 阶段）

1. 在干净 Windows 工作站 clone 此 worktree 完整 HEAD
2. 切换到 `rc6-candidate` 分支（人工创建；不在 sandbox 内）
3. 设置 `XIAOXUE_PRODUCT_VERSION=0.8.0-rc.6` + `OPENCODE_CHANNEL=prod`
4. 跑 `bun run prepackage:win` + `bun run package`
5. 跑 installer 安装 + 升级 + 卸载验证
6. 跑 clean-machine lifecycle 真实 model E2E
7. 创建 GitHub release + tag `v0.8.0-rc.6` + 上传产物 + sha256
8. 更新 `CONTRIBUTING.md` 与 `CHANGELOG.md`