# 小雪 / OpenCode 主线融合与 RC 最终交付 Handoff

**日期**：2026-08-25  
**用途**：交给 Codex 作为后续唯一执行依据  
**目标**：审计当前工程中多个分支 / worktree / task 文件，把有效改动融合到唯一主线，并完成 RC 安装包交付  
**当前结论**：`RC_DELIVERY_READY = NO`  
**当前候选融合基线**：`7501b99b15220c9c5e180802338864411e0d2a88`

---

# 0. 从现在开始只有一个目标

不要再继续扩大 Skill 治理范围。

后续唯一目标：

```text
多分支 / 多 worktree / 多 Phase 文档
                ↓
        精确审计与去重
                ↓
        唯一 mainline RC
                ↓
       11-Skill RC release set
                ↓
          installer build
                ↓
        clean install + smoke
                ↓
 upgrade / rollback / uninstall
                ↓
      SHA-256 + signing status
                ↓
        RC_DELIVERY_READY
```

**禁止再开：**

- Phase 4.3
- 新 Archive batch
- 新 Skill 删除目标
- 43 个许可证全量治理
- 78/69 Skill 理论完美化
- migration framework 重构
- 无关 release blocker 的大规模重构

---

# 1. 当前产品状态综合

## 1.1 Skill Consolidation 已完成并冻结

当前最新已完成安全收敛：

```text
effective top-level Skill:
75 → 69

physical Skill directories:
78 → 72
```

### 已安全移除 / 可回滚

- `effect`
- `minimax-pdf`
- `sci-employee-deep-research`

### 已融合进 `office-assistant`

- `long-document-writing`
- `meeting-minutes-manager`
- `humanizer`

融合原则：

- 原独立入口不再作为顶层 Skill。
- 专业知识和能力不能丢失。
- 已有 6 份专业知识文件逐一 SHA-256 校验。
- 6 份参考资料必须继续被 Git / release asset pipeline 正确跟踪。

### 明确保留

以下三个 Skill 不再继续做删除 / Archive 判断：

- `autoresearch`
- `image-well`
- `nano-banana-pro`

当前策略：

```text
KEEP_FOR_PLATFORM
POST_RC_OPTIONAL
AUTOMATED_ARCHIVE_INELIGIBLE
```

不得为了降低 Skill 数量删除。

---

## 1.2 当前已通过的测试

最近一次 consolidation 已报告：

```text
Skill tests:
69 passed
0 failed

Agent / Xiaoxue:
174 passed
0 failed

Desktop resource integrity:
PASS

Production migration fixture:
4 passed
0 failed

New TypeScript errors introduced:
0
```

历史残留：

```text
4 × TS2344
```

仅位于 Qoder 旧未跟踪脚本。

后续只需用 clean baseline A/B 证明：

```text
BASELINE_TOOLING_DEBT = YES
NEW_RC_TYPE_ERRORS = 0
```

不要再为这 4 个历史错误阻塞产品交付。

---

# 2. 历史 Phase / 分支文件处理政策

当前工程存在大量：

- Phase 4.1
- Phase 4.2 / A / B / C / D / E / F
- F-A / F-B
- RC closeout
- worktree evidence
- `.db-rehearsal`
- 临时 script
- task report

这些文件不能继续彼此覆盖。

## 2.1 唯一当前事实源

从本次融合后，当前状态只允许来自：

1. 最终主线 Git HEAD
2. 当前 RC release manifest
3. 当前 RC release profile
4. 当前 installer artifact
5. `docs/release/MAINLINE_RC_DELIVERY_HANDOFF_2026-08-25.md`
6. 最终 `docs/release/RC_DELIVERY_CLOSEOUT_2026-08-25.md`

其他历史 Phase 文件仅作为审计证据。

---

## 2.2 历史文件分类

每一个历史 task / branch / report 只能进入：

### `CURRENT_MAINLINE`

仍属于当前产品事实。

### `SUPERSEDED_EVIDENCE`

历史上有价值，但结论已被后续修正。

### `TEMPORARY_EVIDENCE`

`.db-rehearsal`、临时快照、一次性 debug 等。

### `POST_RC_BACKLOG`

不影响当前 RC 的治理和技术债。

禁止删除历史证据，但禁止继续把 `SUPERSEDED_EVIDENCE` 当 release truth。

---

# 3. 当前 RC 状态

## 3.1 RC 判定

```text
RC_DELIVERY_READY = NO
```

## 3.2 当前仅剩 5 类 P0/P1 blocker

### BLOCKER 1 — installer 未构建

尚未从当前主线候选构建最终 RC installer。

当前已知候选基线：

```text
7501b99b15220c9c5e180802338864411e0d2a88
```

**重要：**

如果本次分支融合产生新 commit：

```text
FINAL_RC_SOURCE_SHA != 7501b99...
```

最终安装包必须从新的 `FINAL_RC_SOURCE_SHA` 构建。

不能一边融合新代码，一边继续声称 installer 来源是 7501。

---

### BLOCKER 2 — installer 内 11 个 RC Skill 未真实验证

当前目标：

```text
RC_SKILL_COUNT = 11
```

禁止人工从历史 Phase 文档手填 11 个名字。

必须从当前：

```text
rc-skill-assets.lock.json
```

或等价 RC manifest 中程序化读取。

最终必须证明：

```text
manifest_expected = 11
package_materialized = 11
runtime_discovered = 11

missing = []
unexpected = []
```

---

### BLOCKER 3 — clean install / first launch 未验证

必须在干净安装位置验证：

- installer 安装成功
- 首次启动成功
- 主界面打开
- chat 输入正常
- Provider 初始化正常
- 11 个 RC Skill 被 runtime 正确发现
- 核心 smoke 可以执行

---

### BLOCKER 4 — 生命周期未验证

必须完成：

- upgrade
- rollback
- uninstall

特别检查：

- 用户配置不丢
- Session / SQLite 不异常
- Skill assets 不被 migration 误删
- rollback 能恢复到合法版本
- uninstall 无严重残留

---

### BLOCKER 5 — SHA-256 / signing 未冻结

最终 installer 必须记录：

```text
artifact filename
artifact absolute path
file size
source SHA
SHA-256
Authenticode status
signing certificate subject（若已签）
build timestamp
```

---

# 4. Codex 第一阶段：多分支 / worktree 审计

## P0 — 不改代码，只做 inventory

工程根目录：

```text
E:\software programming\opencode-dev
```

执行：

```powershell
$repo = "E:\software programming\opencode-dev"

git -C $repo status --short
git -C $repo worktree list --porcelain
git -C $repo branch -vv --all
git -C $repo log --all --decorate --oneline --graph -n 200
git -C $repo show --stat --oneline 7501b99b15220c9c5e180802338864411e0d2a88
```

扫描：

```text
docs/skill-center/**
docs/release/**
scripts/**
packages/opencode/src/skill/migration/**
packages/desktop/**
.opencode/skills/**
```

输出：

```text
docs/release/BRANCH_WORKTREE_AUDIT_2026-08-25.tsv
```

字段必须包括：

```text
branch_or_worktree
head_sha
clean_dirty
purpose
unique_commits
already_in_7501
product_files
test_files
docs_files
temp_files
conflict_risk
recommended_action
```

`recommended_action` 只能是：

```text
MERGE_MAINLINE
CHERRY_PICK_SELECTED
DOCS_ARCHIVE_ONLY
POST_RC_BACKLOG
DISCARD_TEMP_ONLY
NEEDS_REVIEW
```

---

# 5. Codex 第二阶段：建立唯一 clean mainline

## P1 — 创建独立 clean worktree

不要在当前脏工作树直接融合。

创建：

```powershell
git -C "E:\software programming\opencode-dev" worktree add --detach `
  "E:\software programming\opencode-dev-mainline-rc" `
  7501b99b15220c9c5e180802338864411e0d2a88
```

验证：

```powershell
git -C "E:\software programming\opencode-dev-mainline-rc" status --short
```

必须为空。

---

## P2 — 只融合基线之后真正需要的修改

对于每个分支：

```powershell
git -C "<repo>" diff --name-status 7501b99b15220c9c5e180802338864411e0d2a88..<branch>
```

不要整分支盲 merge。

按文件和 commit 审计：

### 优先进入主线

1. 最新 consolidation 产品改动
2. `office-assistant` 合并后的正式 references
3. 必要 migration / removal registry 修正
4. RC 11-Skill release profile
5. RC manifest
6. installer / lifecycle 必要脚本
7. resource / reference integrity 必要更新
8. consolidation / RC 必要测试
9. 最终主线文档

### 默认不进入主线

- `.db-rehearsal/**`
- staging/**
- placeholder clean-room JSON
- superseded Phase verdict
- 历史错误 archive decision
- 一次性 debug script
- 临时 audit dump
- 旧 task completion marker
- 与最终 RC 不相关的实验脚本

---

# 6. Consolidation 主线验收

融合后必须重新验证：

```text
effective Skill count = 69
physical Skill dirs = 72
```

至少验证：

```text
effect                         absent
minimax-pdf                    absent
sci-employee-deep-research     absent

long-document-writing          no longer top-level active
meeting-minutes-manager        no longer top-level active
humanizer                      no longer top-level active

office-assistant               active

autoresearch                   retained
image-well                     retained
nano-banana-pro                retained
```

并验证 `office-assistant` 内 6 份新增知识资产：

```text
file exists
SHA-256 matches consolidation record
loadable
reachable
```

---

# 7. 主线 Git 提交策略

严禁：

```text
git add .
git add -A
```

必须显式 stage。

目标最多 3 个正式 commit。

## Commit A — 如果 7501 尚未包含 consolidation

```text
feat(skills): consolidate safe skill set for rc delivery
```

## Commit B — RC profile / release pipeline

```text
chore(release): finalize xiaoxue rc skill profile and lifecycle gates
```

## Commit C — 主线状态

```text
docs(release): consolidate rc delivery mainline status
```

如果某类改动已经在 `7501b99...` 中：

**不得重复提交。**

最终记录：

```text
CONSOLIDATION_BASE_SHA =
7501b99b15220c9c5e180802338864411e0d2a88

FINAL_RC_SOURCE_SHA =
<最终 40-char SHA>
```

---

# 8. 最终 RC Release Set

不要再讨论平台 69 个 Skill 是否继续减少。

建立双层模型：

```text
PLATFORM_EFFECTIVE_SKILLS = 69

XIAOXUE_RC_SKILLS = 11
```

69 个是平台能力。

11 个是当前安装包核心 release profile。

二者不得混淆。

## RC exact-set Gate

Codex 必须从 manifest 自动输出：

```text
RC_SKILL_NAMES = [
  ...
]
```

然后验证三份集合：

```text
manifest_expected_names
materialized_package_names
runtime_discovered_names
```

要求：

```text
manifest_expected - package = []
package - manifest_expected = []

manifest_expected - runtime = []
runtime - manifest_expected = []
```

只看 count 不算 PASS。

---

# 9. Installer Build

旧 RC6 已经有成熟发布流程，直接复用。

## 9.1 Build env

例如：

```powershell
$env:XIAOXUE_PRODUCT_VERSION = "<final-rc-version>"
$env:OPENCODE_CHANNEL = "prod"
```

先运行严格 installer prep：

```powershell
bun .\scripts\rc6-release-prep\installer-prep.ts --strict
```

退出条件：

```text
strict gate PASS
```

再：

```powershell
bun run package
```

必须生成真实 installer。

记录：

```text
INSTALLER_PATH =
INSTALLER_SIZE =
FINAL_RC_SOURCE_SHA =
```

---

# 10. 安装包 Skill 验证

不能只检查源码目录。

必须检查**最终 package / install 后真实资源**。

验证：

```text
expected RC skills = 11
installer RC skills = 11
runtime RC skills = 11
```

每个 Skill 至少检查：

```text
directory exists
SKILL.md exists
frontmatter valid
load succeeds
runtime discovered
```

然后运行：

```text
reference missing = 0
broken router = 0
broken agent = 0
broken config = 0
resource integrity = PASS
```

---

# 11. 核心 Smoke

不要重新扩大成大规模 E2E。

只验证当前交付核心链路。

至少：

```text
1. desktop launch
2. new conversation
3. normal chat
4. provider request
5. office basic task
6. geology / mud-logging core review
7. report generation / export
8. knowledge retrieval
9. tender core path
10. contract core path
11. restart and state recovery
```

输出：

```text
CORE_SMOKE_PASS = X / 11
```

要求：

```text
11 / 11
```

若某项不是当前 release profile 功能，必须提前从验收矩阵移除，不能运行后临时解释为 optional。

---

# 12. Clean Install / First Launch

在独立 clean install 位置执行。

最少验证：

```text
installer exit success
application executable exists
first launch success
renderer loaded
chat input available
provider configuration readable
RC skill discovery = 11
no startup migration destruction
```

证据写入：

```text
docs/release/evidence/clean-install-2026-08-25.json
```

---

# 13. Upgrade / Rollback / Uninstall

旧 RC6 流程可以直接复用。

## Upgrade

从最近合法可升级版本 → 当前 RC。

验证：

```text
user settings preserved
conversation/session DB preserved
RC skills present
startup successful
migration safe
```

## Rollback

当前 RC → 前一个合法版本。

验证：

```text
app launches
data readable
no corrupted migration state
```

## Uninstall

验证：

```text
uninstaller succeeds
program files cleaned
critical temp installer files cleaned
```

对于 AppData / 用户数据：

不要无条件删除用户数据。

必须按产品 uninstall policy 检查。

输出：

```text
docs/release/evidence/lifecycle-2026-08-25.json
```

---

# 14. SHA-256 与签名

构建结束后：

```powershell
$installer = "<actual-installer-path>"

Get-FileHash $installer -Algorithm SHA256
Get-AuthenticodeSignature $installer
```

输出：

```text
INSTALLER_SHA256 =
SIGNATURE_STATUS =
SIGNER_SUBJECT =
```

## 判定规则

如果项目当前 RC 要求强制签名：

```text
SIGNATURE_STATUS must be Valid
```

如果当前构建策略允许未签名内部 RC：

必须明确写：

```text
SIGNATURE_STATUS = UNSIGNED_INTERNAL_RC
PUBLIC_DISTRIBUTION_ALLOWED = NO
```

禁止把“没签名”写成 PASS 而不说明发布边界。

---

# 15. 最终 Regression Gate

只卡 release blocker。

必须：

```text
Skill tests                 PASS
Agent/Xiaoxue tests         PASS
RC reference missing        0
Resource integrity          PASS
New regression              0
New timeout                 0
New type errors             0
```

历史 baseline debt：

可以记录，但不得继续扩审。

---

# 16. 最终主线文件清理

融合完成后：

## 必须保留

```text
docs/release/MAINLINE_RC_DELIVERY_HANDOFF_2026-08-25.md
docs/release/RC_DELIVERY_CLOSEOUT_2026-08-25.md
docs/release/BRANCH_WORKTREE_AUDIT_2026-08-25.tsv
current RC manifest
current release profile
current lifecycle evidence
removal registry
migration registry
```

## 历史 Phase 文件

不要求删除。

在关键历史文档头部增加：

```text
STATUS: SUPERSEDED_EVIDENCE
CURRENT_SOURCE_OF_TRUTH:
docs/release/MAINLINE_RC_DELIVERY_HANDOFF_2026-08-25.md
```

仅需要对最容易被误认为“当前结论”的历史 closeout 文件做标记。

不要花时间修改所有历史文件。

---

# 17. 最终交付报告固定格式

Codex 最终必须只按下面格式回复：

```text
MAINLINE_INTEGRATION = PASS / BLOCKED

CONSOLIDATION_BASE_SHA =
FINAL_RC_SOURCE_SHA =

Branches/worktrees audited =
Merged =
Cherry-picked =
Docs-only =
Temp ignored =

Platform effective skills = 69

RC:
  expected skills = 11
  manifest names = [...]
  packaged names = [...]
  runtime names = [...]
  missing = []
  unexpected = []

Tests:
  skill =
  agent/xiaoxue =
  reference missing =
  resource integrity =
  new regression =
  new timeout =
  new type errors =

Installer:
  built = YES / NO
  path =
  size =
  source SHA =

Clean install =
First launch =
Core smoke = X/11

Lifecycle:
  upgrade =
  rollback =
  uninstall =

Artifact:
  SHA-256 =
  signature status =
  signer =

RC_DELIVERY_READY = YES / NO

TOP_BLOCKERS =
最多 5 项
```

---

# 18. 最终硬门

只有以下全部成立：

```text
MAINLINE_INTEGRATION = PASS

FINAL_RC_SOURCE_SHA known

RC expected = 11
RC package = 11
RC runtime = 11

RC missing = 0
RC unexpected = 0

reference missing = 0
resource integrity = PASS

new regression = 0
new type errors = 0

installer built = YES
clean install = PASS
first launch = PASS
core smoke = PASS

upgrade = PASS
rollback = PASS
uninstall = PASS

SHA-256 known

signing status explicitly known
```

才允许：

```text
RC_DELIVERY_READY = YES
```

---

# 19. 如果失败怎么处理

如果最终仍然：

```text
RC_DELIVERY_READY = NO
```

只允许返回：

```text
TOP_BLOCKERS ≤ 5
```

只修真正 P0/P1。

禁止：

- 再开新治理 Phase
- 再做 Skill 数量压缩
- 再审 43 个 license
- 再重新设计 release 架构
- 再扩大 acceptance matrix

---

# 20. STOP RULE

当：

```text
RC_DELIVERY_READY = YES
```

立即停止当前治理工作。

后续 Skill Portfolio / license / provenance / platform capability cleanup：

统一进入：

```text
POST_RC_BACKLOG
```

不要阻塞当前产品交付。

---

# 当前给 Codex 的一句话

**先把所有分支 / worktree / task 产物对账并融合到唯一 clean mainline，再从最终 SHA 构建真实 installer；之后只完成 11-Skill 包内验证、clean install、核心 smoke、upgrade/rollback/uninstall、SHA-256/签名这 5 类交付门。除此之外不要再扩大修改范围。**
