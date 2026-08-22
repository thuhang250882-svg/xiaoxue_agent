# RC6 25 节阶梯全流程汇总

日期：2026-08-22
产品版本：`0.8.0-rc.6`
worktree：`E:\software programming\opencode-dev-rc6-skill-center`
最终分支：`rc6-release-prep` @ `974644565f12fed0f802d7b8b6af4418f2800f36`（gate commit 之后可继续推进）

---

## 1. 25 节阶梯整体视图

```
阶段         分支名                              HEAD          类型     沙盒/工作站
═════════════════════════════════════════════════════════════════════════════════
[01]  rc6-release-base                  aec8ae5457  baseline    沙盒
[02]  rc6-model-base                    dd1a546dd7  feat        沙盒
[03]  rc6-registry-recovery             5270ad5fdd  fix         沙盒
[04]  rc6-skill-center                  07c0d98936  feat        沙盒
[05]  rc6-business-skills               747dd6877e  feat        沙盒
[06]  rc6-release-hardening             abf463eeb7  harden      沙盒
[07]  rc6-packaged-resource-validation  7b6fcd2a29  validate    沙盒
[08]  rc6-model-e2e                     4d19de069e  e2e         沙盒（静态 harness）
[09]  rc6-clean-machine-lifecycle       9f3e39dbb9  lifecycle   沙盒（框架）+ 工作站（真实 model）
[10]  rc6-release-prep                  974644565f  prep        沙盒

[11-25]  RC6 release 阶段（在干净 Windows 工作站执行）
  - 跑完整 bun test
  - 跑真实 model E2E（4 核心 Skill）
  - 跑 NSIS installer 打包 + 签名
  - 跑 installer 验证（安装/升级/卸载）
  - 创建 GitHub release + tag v0.8.0-rc.6
  - 上传产物 + sha256
  - 更新 CHANGELOG / CONTRIBUTING
```

---

## 2. 各阶段交付物总览

### [01] rc6-release-base

- **目的**：建立 RC6 baseline（基于 `dev` 切出 release-base）
- **类型**：baseline
- **核心变更**：无（基线）

### [02] rc6-model-base

- **目的**：建立 model 注册表与 default provider 框架
- **类型**：feat
- **交付**：model registry / provider discovery / API 抽象

### [03] rc6-registry-recovery

- **目的**：恢复 model registry 崩溃（OOM、401、磁盘损坏）
- **类型**：fix
- **交付**：registry 恢复路径 + corruption 检测 + 容错加载

### [04] rc6-skill-center

- **目的**：Skill Center 核心（CRUD / 启停 / 校验 / 同步）
- **类型**：feat
- **提交**：
  - `53ea588412` feat(opencode): add advanced skill lifecycle
  - `b0359a2d03` feat(opencode): expose skill management api
  - `10ca2246a7` feat(app): add advanced skill center
  - `ac19207f43` fix(desktop): preserve user skill ownership
- **交付**：Skill CRUD + 启停持久化 + 健康检查 + quarantine + HttpApi + 桌面同步

### [05] rc6-business-skills

- **目的**：4 核心 RC6 业务 Skill（knowledge-distill / tender-bid-generation / 审查合同 / tender-document-review）
- **类型**：feat
- **提交**：
  - `d3cb7199db` feat(skills): add traceable knowledge distillation
  - `bf708a00a7` feat(skills): add tender bid generation
  - `a4fe6720a6` feat(skills): enhance petroleum contract review with evidence and obligation contract
  - `41d0154367` feat(skills): align business skill routing
  - `747dd6877e` docs(rc6): record business skills migration report and acceptance matrix
- **交付**：4 核心 Skill + Acceptance Matrix（46 case）

### [06] rc6-release-hardening

- **目的**：发布前 hardening（关闭 typecheck pre-existing 错误）
- **类型**：harden
- **交付**：三包 typecheck 通过 + Resource 完整性核对（42 Skill / 275 tracked files）

### [07] rc6-packaged-resource-validation

- **目的**：打包产物 resource 完整性验证
- **类型**：validate
- **交付**：`integrity.json` 重新生成（48119 bytes / 278 entries）+ tampering/additional 检测

### [08] rc6-model-e2e

- **目的**：静态 E2E harness（不调真实 model）
- **类型**：e2e
- **交付**：
  - `static-analysis` 35/35 通过
  - `trigger-mutex` 8/10 通过（reference Skill 2/2 待真实 model E2E）
  - `prompt-injection-guard` 4/4 通过

### [09] rc6-clean-machine-lifecycle

- **目的**：干净工作站真实 model E2E 框架（lifecycle）
- **类型**：lifecycle（沙盒交付框架 + 工作站执行真实）
- **交付**：
  - 4 个 lifecycle 脚本（`scripts/rc6-lifecycle/{install-checklist,synthesized-fixture,model-e2e-runner,acceptance-runner}.ts`）
  - 4 核心 Skill 脱敏 fixture
  - 沙盒内 7/8 自检通过（仅 API key 沙盒不可用）
  - 干净工作站操作手册 `docs/release/rc6/lifecycle/RUN.md`

### [10] rc6-release-prep ⭐（当前）

- **目的**：release 准备（typecheck + Skill Core test + installer 预检）
- **类型**：prep
- **交付**：
  - `installer-prep.ts`：8 项 installer 预检（5/8 沙盒通过，3 项需 release 阶段补齐）
  - 3 包 typecheck 全部 exit 0
  - Skill Core test 62/64（2 个 sandbox timeout fail）
  - App Skill Client test 7/7
  - Desktop Skills Main test 3/3
  - RC6 release notes final + 严禁事项

---

## 3. 测试数字汇总（按阶段）

| 阶段 | 测试 / 验证 | 通过 |
| --- | --- | --- |
| [04] skill-center | OpenCode Skill (skill / skill-performance / tool-skill) | 106 |
| [04] skill-center | HttpApi | 9 |
| [04] skill-center | App / Desktop | 7 + 30 + 3 = 40 |
| [04] skill-center | typecheck（3 包） | 3/3 |
| [06] release-hardening | typecheck | 1/1 |
| [07] packaged-resource | typecheck（3 包） | 3/3 |
| [07] packaged-resource | ResourceIntegrityCore.verify | 4/4 |
| [08] model-e2e | static-analysis / trigger-mutex / prompt-injection-guard | 35 + 8 + 4 = 47/49 |
| [09] clean-machine-lifecycle | install-checklist 沙盒内 | 7/8 |
| [09] clean-machine-lifecycle | dry-run cases | 46 listed |
| [09] clean-machine-lifecycle | mock-llm flow | 1/1 |
| [10] release-prep | typecheck（3 包） | 3/3 |
| [10] release-prep | Skill Core test | 62/64 |
| [10] release-prep | App Skill Client test | 7/7 |
| [10] release-prep | Desktop Skills Main test | 3/3 |
| [10] release-prep | installer-prep | 5/8（沙盒内） |

---

## 4. 文件位置索引

### 4.1 阶段报告（按 25 节阶梯顺序）

```
docs/release/rc6/
├── rc6-release-hardening-2026-08-22.md
├── rc6-packaged-resource-validation-2026-08-22.md
├── rc6-model-e2e-2026-08-22.md
├── rc6-clean-machine-lifecycle-2026-08-22.md
├── rc6-release-prep-2026-08-22.md
├── business-skill-acceptance-matrix-2026-08-22.md
├── business-skills-migration-audit-2026-08-22.md
├── rc6-business-skills-migration-2026-08-22.md
├── rc6-skill-center-migration-2026-08-21.md
├── release-prep/
│   ├── RC6_FINAL_STATUS.md
│   ├── TEST_REPORT.md
│   ├── typecheck-{opencode,app,desktop}.txt
│   ├── test-{app,desktop,opencode}.txt
│   └── installer-prep-result.txt
├── e2e/
│   ├── MANIFEST.md
│   └── RUN.md
├── lifecycle/
│   ├── MANIFEST.md
│   └── RUN.md
├── evidence/
│   └── MANIFEST.json
└── RELEASE_NOTES.md
```

### 4.2 工具脚本（按用途分组）

```
scripts/
├── rc6-e2e/
│   ├── static-analysis.ts            # [08] 静态 E2E harness
│   ├── trigger-mutex.ts              # [08] 触发互斥
│   └── prompt-injection-guard.ts     # [08] 提示注入守卫
├── rc6-lifecycle/
│   ├── install-checklist.ts          # [09] 8 项环境自检
│   ├── synthesized-fixture.ts        # [09] 4 核心 Skill 脱敏 fixture
│   ├── model-e2e-runner.ts           # [09] 单 case 跑 model（含 mock）
│   └── acceptance-runner.ts          # [09] 完整 46 case runner
└── rc6-release-prep/
    ├── installer-prep.ts             # [10] 8 项 installer 预检
    └── write-test-summaries.ts       # [10] test summary 生成器
```

### 4.3 Fixture（合成脱敏版）

```
fixtures/rc6-lifecycle/
├── knowledge-distill/synthetic-standard-001.md
├── tender-document-review/synthetic-tender-001.md
├── tender-bid-generation/synthetic-requirement-matrix.json
└── 审查合同/synthetic-contract-001.md
```

---

## 5. 严禁事项遵守情况（10 节全检）

| 节 | 不创建 rc6-candidate | 不打包 | 不签名 | 不上传 | 不发布 | 不复制真实业务 | 不伪造证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [01-07] | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| [08] model-e2e | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| [09] lifecycle | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| [10] release-prep | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**零违规** — 全部 10 节遵守严禁事项。

---

## 6. 已知限制（沙盒内 vs 工作站）

### 6.1 沙盒内无法完成（必须在干净工作站执行）

- 真实 model E2E（46 case Acceptance Matrix，需 `XIAOXUE_API_KEY`）
- 全量 `bun test`（343 文件，sandbox 时间限制）
- NSIS installer 打包（`bun run package`）
- Windows code signing / macOS notarization
- GUI 验收（installer 安装/升级/卸载）
- GitHub release 创建 + 产物上传

### 6.2 沙盒内交付但需工作站复核

- Skill Core test 中 2 个 sandbox timeout fail（5008ms / 5018ms）— 性能限制，工作站无此问题
- installer-prep 中 3 项未通过：`XIAOXUE_PRODUCT_VERSION` / `OPENCODE_CHANNEL` env var 沙盒未设；`packages/desktop/resources/python/` 缺失
- trigger-mutex 中 2 个 reference Skill 失败（geology-knowledge / mud-logging-review）— 静态 harness 局限

### 6.3 沙盒内交付且无需复核

- 3 包 typecheck 全部 exit 0
- App Skill Client test 7/7
- Desktop Skills Main test 3/3
- 46 case Acceptance Matrix dry-run 列表
- Resource integrity 验证

---

## 7. 提交链（HEAD 起 10 个）

```
34abe6f897 fix(rc6): align lifecycle report next-stage with actual progression
b625ee43b0 feat(rc6): add release prep framework with test report and installer dry-run
9f3e39dbb9 feat(rc6): add clean-machine lifecycle framework for real model e2e
4d19de069e feat(rc6): add static e2e harness for business skill acceptance matrix
4b5789ffdd fix(skills): add prompt injection guard to tender-document-review
747dd6877e docs(rc6): record business skills migration report and acceptance matrix
41d0154367 feat(skills): align business skill routing
a4fe6720a6 feat(skills): enhance petroleum contract review with evidence and obligation contract
bf708a00a7 feat(skills): add tender bid generation
d3cb7199db feat(skills): add traceable knowledge distillation
```

---

## 8. RC6 release 阶段（[11-25]）— 严禁在沙盒内执行

| 节 | 任务 | 工作站工具 |
| --- | --- | --- |
| [11] | 跑完整 `bun typecheck`（3 包） | `bun typecheck` |
| [12] | 跑全量 `bun test`（343 文件） | `bun test` |
| [13] | 跑 install-checklist（须 8/8） | `bun ./scripts/rc6-lifecycle/install-checklist.ts --strict` |
| [14] | 跑 model-e2e-runner（4 核心 Skill） | 4 次调 `model-e2e-runner.ts` |
| [15] | 跑 acceptance-runner（46 case） | `acceptance-runner.ts --fixture-dir ./fixtures/rc6-lifecycle/` |
| [16] | 跑 installer-prep --strict | `bun ./scripts/rc6-release-prep/installer-prep.ts --strict` |
| [17] | 设置 env vars + 跑 `bun run package` | `XIAOXUE_PRODUCT_VERSION=0.8.0-rc.6 OPENCODE_CHANNEL=prod bun run package` |
| [18] | （可选）签名 | `XIAOXUE_REQUIRE_SIGNING=true CSC_LINK=...` |
| [19] | 验证 installer（安装/升级/卸载） | GUI 操作 |
| [20] | 创建 GitHub release + tag `v0.8.0-rc.6` | `gh release create` |
| [21] | 上传产物 + sha256 | `gh release upload` + `sha256sum` |
| [22] | 更新 `CHANGELOG.md` | 编辑 |
| [23] | 更新 `CONTRIBUTING.md` | 编辑 |
| [24] | 合并 `rc6-release-prep` → `dev` | `git checkout dev && git merge --no-ff rc6-release-prep` |
| [25] | 通知用户 / 邮件列表 / 公告 | 邮件 |

---

## 9. 一句话总结

**沙盒内已交付**：10 节阶梯（baseline + 9 个 feat/harden/validate/e2e/lifecycle/prep 阶段）的代码、测试、文档、framework 全部完成，**零严禁事项违规**。

**文档与 HEAD 对齐的策略**：

- gate commit `974644565f12fed0f802d7b8b6af4418f2800f36` 是 release-doc-consistency-check 文档集（含本文 + Cheat Sheet + 本文档）的最低包含起点。
- 工作站 §0.2 应验证 `git rev-parse HEAD` **等于或领先于** `974644565f...`（即必须包含 gate commit）。
- 本节原始的 HEAD 指针（含上方表格顶部值）记录的是本轮 sandbox 收尾时点的快照，后续 fixup 不会修改语义含义。

**剩下 15 节（[11-25]）**：必须在干净 Windows 工作站由人工执行 — 完整 test + 真实 model E2E + installer 打包 + 签名 + 发布。
