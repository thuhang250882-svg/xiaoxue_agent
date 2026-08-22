# RC6 Release Documents — 索引

日期：2026-08-22
worktree：`E:\software programming\opencode-dev-rc6-skill-center`

> 本目录是 RC6 release 流程的所有文档汇总。工作站接手前**先读本文**。

---

## 0. 推荐阅读顺序

```
README.md（本文）                  ← 现在
  ↓
PREFLIGHT.md                       ← 工作站前置条件自检
  ↓
CLEAN_WORKSTATION_CHEATSHEET.md    ← 完整 15 节操作手册
  ↓
RC6_PIPELINE_SUMMARY.md            ← 25 节阶梯全流程视角
  ↓
release-doc-consistency-check-2026-08-22.md  ← HEAD 校验策略说明
```

---

## 1. 沙盒交付物（已完成）

| 阶段 | 分支 | 报告 |
| --- | --- | --- |
| `rc6-release-base` | rc6-release-base | （基线） |
| `rc6-model-base` | rc6-model-base | （业务报告见各 package） |
| `rc6-registry-recovery` | rc6-registry-recovery | （fix） |
| `rc6-skill-center` | rc6-skill-center | `rc6-skill-center-migration-2026-08-21.md` |
| `rc6-business-skills` | rc6-business-skills | `rc6-business-skills-migration-2026-08-22.md`<br>`business-skill-acceptance-matrix-2026-08-22.md`<br>`business-skills-migration-audit-2026-08-22.md` |
| `rc6-release-hardening` | rc6-release-hardening | `rc6-release-hardening-2026-08-22.md` |
| `rc6-packaged-resource-validation` | rc6-packaged-resource-validation | `rc6-packaged-resource-validation-2026-08-22.md` |
| `rc6-model-e2e` | rc6-model-e2e | `rc6-model-e2e-2026-08-22.md` |
| `rc6-clean-machine-lifecycle` | rc6-clean-machine-lifecycle | `rc6-clean-machine-lifecycle-2026-08-22.md` |
| `rc6-release-prep` | rc6-release-prep | `rc6-release-prep-2026-08-22.md` |

## 2. 工作站执行物（待执行）

### 2.1 主入口

- `CLEAN_WORKSTATION_CHEATSHEET.md` — **核心操作手册**（[11-25] 节）
- `PREFLIGHT.md` — 工作站开始前的环境自检清单
- `RC6_PIPELINE_SUMMARY.md` — 25 节阶梯全局视角

### 2.2 一致性保障

- `release-doc-consistency-check-2026-08-22.md` — 文档一致性 gate 报告 + HEAD 校验策略
- `RELEASE_NOTES.md` — 正式 release notes（含分支谱系、测试数字、严禁事项）

### 2.3 测试/验证工具

```
scripts/rc6-lifecycle/
├── install-checklist.ts          # 8 项环境自检
├── synthesized-fixture.ts        # 4 核心 Skill 脱敏 fixture
├── model-e2e-runner.ts           # 单 case 跑真实 model
└── acceptance-runner.ts          # 完整 46 case 矩阵

scripts/rc6-e2e/
├── static-analysis.ts            # SKILL.md frontmatter 静态验证
├── trigger-mutex.ts              # 触发互斥
└── prompt-injection-guard.ts     # 提示注入守卫

scripts/rc6-release-prep/
├── installer-prep.ts             # 8 项 installer 预检（dry-run / --strict）
└── write-test-summaries.ts       # test summary 写入
```

### 2.4 Fixture（合成脱敏版）

```
fixtures/rc6-lifecycle/
├── knowledge-distill/synthetic-standard-001.md
├── tender-document-review/synthetic-tender-001.md
├── tender-bid-generation/synthetic-requirement-matrix.json
└── 审查合同/synthetic-contract-001.md
```

---

## 3. 报告文档（按阶段）

### 3.1 沙盒阶段报告

- `rc6-skill-center-migration-2026-08-21.md`
- `rc6-business-skills-migration-2026-08-22.md`
- `business-skill-acceptance-matrix-2026-08-22.md`
- `business-skills-migration-audit-2026-08-22.md`
- `rc6-release-hardening-2026-08-22.md`
- `rc6-packaged-resource-validation-2026-08-22.md`
- `rc6-model-e2e-2026-08-22.md`
- `rc6-clean-machine-lifecycle-2026-08-22.md`
- `rc6-release-prep-2026-08-22.md`
- `RC6_PIPELINE_SUMMARY.md`
- `release-doc-consistency-check-2026-08-22.md`

### 3.2 子目录报告

- `release-prep/RC6_FINAL_STATUS.md` — 25 节阶梯当前进度表
- `release-prep/TEST_REPORT.md` — 测试详情 + 失败分析
- `release-prep/installer-prep-result.txt` — 8 项预检输出
- `release-prep/typecheck-{opencode,app,desktop}.txt` — 3 包 typecheck 结果
- `release-prep/test-{app,desktop,opencode}.txt` — 3 包 test summary
- `e2e/MANIFEST.md` + `e2e/RUN.md` — 静态 E2E harness 文档
- `lifecycle/MANIFEST.md` + `lifecycle/RUN.md` — 真实 model E2E 文档
- `evidence/MANIFEST.json` — GUI 验收证据 manifest

---

## 4. 严禁事项（继续）

- 不得创建 `rc6-candidate` tag / branch / release
- 不得打 installer / 签名 / 上传产物 / 发布
- 不得复制外部 `.skill` 文件 / `contract-copilot` 商业内容
- 不得在主 dev 修改 / reset / clean
- 不得伪造"真实 model 已通过" / "全量 test 通过" 证据

---

## 5. 工作站开箱流程

```powershell
# 1. 准备 worktree（详见 PREFLIGHT.md §1）
cd E:\software programming\opencode-dev
git fetch origin
git worktree add "E:\software programming\opencode-dev-rc6-release-20260822" rc6-release-prep

# 2. 进入 worktree
cd "E:\software programming\opencode-dev-rc6-release-20260822"

# 3. HEAD 校验（必须 ≥ gate commit）
git rev-parse HEAD
# 期望：领先或等于 974644565f12fed0f802d7b8b6af4418f2800f36

# 4. 跑 PREFLIGHT 自检
# 详见 PREFLIGHT.md

# 5. 严格按 CLEAN_WORKSTATION_CHEATSHEET.md 执行 [11-25]
```