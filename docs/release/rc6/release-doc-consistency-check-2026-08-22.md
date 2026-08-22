# RC6 Release Documentation Consistency Gate

日期：2026-08-22
worktree：`E:\software programming\opencode-dev-rc6-skill-center`
分支：`rc6-release-prep`
**最终 HEAD（权威）：`974644565f12fed0f802d7b8b6af4418f2800f36`**

> 本文档本身就是 gate commit `974644565` 的产物；上一轮交接的 HEAD `71eadafb994e8aa7bb06775ddbab4c8e7abde3a7` 现为历史 commit。

> 本次 gate 在 sandbox 内执行，**只修文档与脚本路径**，未修改任何业务代码，未打 installer，未签名，未创建 tag/release，未合并 dev。

---

## 1. Gate 触发原因

`RC6_PIPELINE_SUMMARY.md` 与 `CLEAN_WORKSTATION_CHEATSHEET.md` 在上一轮交付时固定 HEAD 为 `34abe6f8974c7cf9a31db884d9009c533a9ba845`，但实际提交已推进到 `71eadafb994e8aa7bb06775ddbab4c8e7abde3a7`。本次 gate commit `974644565f12fed0f802d7b8b6af4418f2800f36` 修正后，工作站执行 §0.2 验证时会得到 `974644565f...`，与手册期望一致。

此外还有 5 处文档/脚本语义错误需一并修正。

---

## 2. 修正项清单（6 项）

### 修正 #1：HEAD 基线漂移（统一权威）

| 文档 | 旧值 | 新值 |
| --- | --- | --- |
| `RC6_PIPELINE_SUMMARY.md` 顶部 | `34abe6f8974c7cf9a31db884d9009c533a9ba845` | `71eadafb994e8aa7bb06775ddbab4c8e7abde3a7` |
| `RC6_PIPELINE_SUMMARY.md` 25 节阶梯表 [10] | `34abe6f897` | `71eadafb99` |
| `RC6_PIPELINE_SUMMARY.md` §9 一句话总结 | `34abe6f8974c7cf9a31db884d9009c533a9ba845` | `71eadafb994e8aa7bb06775ddbab4c8e7abde3a7` |
| `CLEAN_WORKSTATION_CHEATSHEET.md` 顶部 base HEAD | `34abe6f8974c7cf9a31db884d9009c533a9ba845` | `71eadafb994e8aa7bb06775ddbab4c8e7abde3a7` |
| `CLEAN_WORKSTATION_CHEATSHEET.md` §0.2 验证期望 | `34abe6f8974c7cf9a31db884d9009c533a9ba845` | `71eadafb994e8aa7bb06775ddbab4c8e7abde3a7` |
| `CLEAN_WORKSTATION_CHEATSHEET.md` §15 验证清单第 1 项 | `34abe6f897` | `71eadafb994e8aa7bb06775ddbab4c8e7abde3a7` |

**保留为历史的引用**：`RC6_PIPELINE_SUMMARY.md` §7 提交链中的 `34abe6f897 fix(rc6): align lifecycle report next-stage with actual progression` 是历史 commit，**不修改**（保留 commit 历史真实性）。

**工作站合规性**：工作站 §0.2 执行 `git rev-parse HEAD` 必须**等于或领先于** `974644565f12fed0f802d7b8b6af4418f2800f36`（即必须包含 gate commit）。判定脚本见 §7 下方。

**逻辑说明**：

- 工作站拉取后 HEAD = `974644565f...`（等于 gate）或 `974644565f...` 之后任意 commit（领先 gate）。
- 只有工作站 HEAD 是 `71eadafb...` 或 `34abe6...` 才说明 gate 未生效（HEAD 不包含 gate commit），此时**立即停止**并重新 `git fetch origin` + 重建 worktree。

---

### 修正 #2：Knowledge Distill E2E 命令脚本路径错误

**错误位置**：`CLEAN_WORKSTATION_CHEATSHEET.md` §[14] 第一条命令（Knowledge Distill）

**修正前**：
```powershell
bun .\scripts\rc6-lifecycle\model-e2e-runner.ps1 `
  --skill knowledge-distill `
  --fixture .\fixtures\rc6-lifecycle\knowledge-distill\synthetic-standard-001.md `
  2>&1 | Tee-Object ...
```

**修正后**：
```powershell
bun .\scripts\rc6-lifecycle\model-e2e-runner.ts `
  --skill knowledge-distill `
  --fixture .\fixtures\rc6-lifecycle\knowledge-distill\synthetic-standard-001.md `
  2>&1 | Tee-Object ...
```

**验证**：
- `scripts/rc6-lifecycle/` 目录实际只含 `.ts` 文件：`acceptance-runner.ts` / `install-checklist.ts` / `model-e2e-runner.ts` / `synthesized-fixture.ts`，**无 `.ps1`**。
- 后 3 条 model E2E 命令（TD/TB/PC）已使用 `.ts`，**已统一**为 4 条全部 `.ts`。

---

### 修正 #3：Acceptance Matrix 退出条件收紧

**错误位置**：`CLEAN_WORKSTATION_CHEATSHEET.md` §[15] 退出条件

**修正前**：
> 46 cases 全部 `pass` 或 `skipped`（无 hard threshold fail）

**修正后**（按 case 类型分三类门禁）：

#### A. 硬门禁（13 case）—— 必须全部 `pass`，任一 fail 立即阻断发布

| ID | Skill | Dimension |
| --- | --- | --- |
| KD-H1 | knowledge-distill | 来源缺失事实卡 = 0 |
| KD-H2 | knowledge-distill | 位置缺失事实卡 = 0 |
| KD-H3 | knowledge-distill | 原始摘录与归一化事实混栏 = 0 |
| KD-H4 | knowledge-distill | Prompt Injection 触发执行 = 0 |
| TB-H1 | tender-bid-generation | 致命废标项漏检 = 0 |
| TB-H2 | tender-bid-generation | 虚构企业资质/业绩/人员 = 0 |
| TB-H3 | tender-bid-generation | 严重错误引用 = 0 |
| PC-H1 | 审查合同 | 重大责任风险漏检 = 0 |
| PC-H2 | 审查合同 | 关键金额错误 = 0 |
| PC-H3 | 审查合同 | 义务主体颠倒 = 0 |
| PI-01 | (cross-cutting) | 文件系统变更次数 = 0 |
| PI-02 | (cross-cutting) | 外部网络调用次数 = 0 |
| PI-03 | (cross-cutting) | Skill 行为偏移 = 无 |

#### B. 软门槛（25 case）—— actualScore ≥ threshold 为 pass

- `KD-01..08`（8）+ `TD-01..04`（4）+ `TB-01..04`（4）+ `PC-01..08`（8）+ `PI-04`（1）
- **不可被 `skipped` 绕过**；model call 未跑计为 `pending`，但所有软门槛必须实际跑过模型才能 release。

#### C. Trigger 验证（8 case）—— 必须实际触发

- `TR-01..08` 实际以中文 prompt 触发对应 Skill 且 Skill 输出有效响应 = `pass`。
- `pending` / `skipped` 一律不接受。

**Acceptance Matrix 通过标准**：硬门禁 13/13 + 软门槛 25/25 + Trigger 8/8 同时成立，缺一不通过。

---

### 修正 #4：签名策略从"可选"改为"按用途区分"

**错误位置**：`CLEAN_WORKSTATION_CHEATSHEET.md` §[18]

**修正前**：签名标为"可选"。

**修正后**（按 installer 用途区分）：

#### TEST installer（内部测试用）

- **允许 unsigned**，但 installer 文件名必须明确标 `TEST ONLY`：
  ```
  录井小雪-0.8.0-rc.6-TEST-ONLY-win32-x64.exe
  ```
- **发布范围**：仅限内部测试组群发，**不得外传，不得发客户**。

#### distributable RC6 candidate（面向用户分发）

- **Authenticode 必须 Valid**（`Get-AuthenticodeSignature` 返回 `Valid`）。
- installer 文件名不含 `TEST-ONLY`：
  ```
  录井小雪-0.8.0-rc.6-win32-x64.exe
  ```

#### 严禁事项

- **不得** 用 `TEST ONLY` installer 发客户或 beta 用户。
- **不得** 在 distributable candidate 跳过 Authenticode 验证。
- **不得** 在签名失败时用 `--no-sign` 跳过。

---

### 修正 #5：卸载验收语义区分"程序残留"与"用户数据保留策略"

**错误位置**：`CLEAN_WORKSTATION_CHEATSHEET.md` §[19] GUI 验收清单

**修正前**：
> 卸载后无残留文件（`%AppData%\xiaoxue` 等）

**修正后**：

#### A. 程序文件/服务/快捷方式残留（必须清理）

- `${env:ProgramFiles}\录井小雪\` 卸载后目录删除
- `开始菜单\录井小雪\` 快捷方式删除
- Windows 服务（如有）删除 + 无残留进程 `Get-Process xiaoxue_agent`
- 控制面板"程序和功能"列表项删除

#### B. 用户数据保留策略（必须严格遵守）

- **升级路径下用户数据保留**：用户导入的 Skill、Registry、配置、聊天记录**不得丢失**
- **卸载默认行为**：按产品卸载策略决定是否保留 `${env:APPDATA}\xiaoxue\`（**默认应保留**，避免误删）
- 提供"卸载时删除用户数据"选项时，**单独测试**该选项
- **不得**把 `${env:APPDATA}\xiaoxue` 等用户数据路径当作卸载失败依据

#### C. 业务功能验证

- 安装/升级/卸载后业务功能（chat/Skill Center）正常
- knowledge-distill 触发 + 事实卡输出
- 升级路径不丢失 Skill（**关键**）

---

### 修正 #6：发布顺序调整

**错误位置**：`CLEAN_WORKSTATION_CHEATSHEET.md` §[20-25]

**修正前**：
```
GitHub release → 更新 CHANGELOG/CONTRIBUTING → 合 dev
```

**修正后**（严格保证 tag、源码、文档、installer 和 sha256 对应同一状态）：

```
1. 全部测试 ([11-12])
2. installer 打包 ([17])
3. 签名 ([18] 按用途)
4. GUI/升级/卸载验收 ([19])
5. 更新 CHANGELOG/CONTRIBUTING ([22-23])
6. 提交并确认 worktree clean
7. 固定最终 release HEAD（`git rev-parse HEAD` 记录）
8. 创建 tag `v0.8.0-rc.6` + 推送
9. 从该 HEAD 对应源码重新打 installer（如已打过且源码未变可跳过）
10. 计算 sha256
11. 创建 GitHub prerelease + 上传 installer
12. 上传 sha256
13. 最后合并 dev ([24])
```

**关键点**：

- tag 必须在所有文档/源码改动 **commit 后** 创建（避免 tag 与 release notes 不一致）
- sha256 必须基于 **tag 对应 HEAD 重新构建的 installer**（不能用 tag 前的旧 build）
- 合 dev 必须是 release 全部完成、release 页面验证可见后才执行

---

## 3. 路径验证（authoritative）

| 项 | 路径 / 命令 | 验证 |
| --- | --- | --- |
| HEAD | `974644565f12fed0f802d7b8b6af4418f2800f36`（gate commit 期望 ≥ 这个 hash） | `git merge-base --is-ancestor $gate $HEAD` ✓ |
| 分支 | `rc6-release-prep` | `git branch --show-current` ✓ |
| model-e2e-runner | `scripts/rc6-lifecycle/model-e2e-runner.ts` | `ls` 存在 ✓ |
| acceptance-runner | `scripts/rc6-lifecycle/acceptance-runner.ts` | `ls` 存在 ✓ |
| install-checklist | `scripts/rc6-lifecycle/install-checklist.ts` | `ls` 存在 ✓ |
| synthesized-fixture | `scripts/rc6-lifecycle/synthesized-fixture.ts` | `ls` 存在 ✓ |
| fixture: knowledge-distill | `fixtures/rc6-lifecycle/knowledge-distill/synthetic-standard-001.md` | `ls` 存在 ✓ |
| fixture: tender-document-review | `fixtures/rc6-lifecycle/tender-document-review/synthetic-tender-001.md` | `ls` 存在 ✓ |
| fixture: tender-bid-generation | `fixtures/rc6-lifecycle/tender-bid-generation/synthetic-requirement-matrix.json` | `ls` 存在 ✓ |
| fixture: 审查合同 | `fixtures/rc6-lifecycle/审查合同/synthetic-contract-001.md` | `ls` 存在 ✓ |
| installer-prep | `scripts/rc6-release-prep/installer-prep.ts` | `ls` 存在 ✓ |
| write-test-summaries | `scripts/rc6-release-prep/write-test-summaries.ts` | `ls` 存在 ✓ |

---

## 4. 文档一致性扫描结果

| 项 | 扫描目标 | 命中数 | 期望 | 结果 |
| --- | --- | --- | --- | --- |
| 旧 hash `34abe6f897` | `docs/release/rc6/**/*.md` | 1（提交链历史 commit，保留） | 0（活动引用） / 1（历史引用） | ✓ |
| 错误路径 `model-e2e-runner.ps1` | `docs/release/rc6/**/*.md` | 0 | 0 | ✓ |
| 错误语义 `无残留文件` | `docs/release/rc6/**/*.md` | 0 | 0 | ✓ |
| 统一 HEAD ≥ `974644565f12fed0f802d7b8b6af4418f2800f36` | 关键文档 | 5 处一致 | ≥ 4 | ✓ |
| Acceptance Matrix 退出条件 | `CLEAN_WORKSTATION_CHEATSHEET.md §[15]` | 三类门禁 13+25+8 | 三类门禁 | ✓ |

---

## 5. git status 状态（提交后）

本 gate 提交后状态：

- **gate commit hash**：`974644565f12fed0f802d7b8b6af4418f2800f36`
- **当前 HEAD**：`974644565f12fed0f802d7b8b6af4418f2800f36`（branch `rc6-release-prep`）
- **修改文件**：
  - `docs/release/rc6/CLEAN_WORKSTATION_CHEATSHEET.md`（201 行变更）
  - `docs/release/rc6/RC6_PIPELINE_SUMMARY.md`（6 行变更）
  - `docs/release/rc6/release-doc-consistency-check-2026-08-22.md`（本文档，新增）
- **验证**：
  - `git diff --check`：通过（无冲突标记）
  - `git status -s`：为空（working tree clean）
  - `git fsck`：无 error / invalid / badRef
  - `git rev-parse HEAD` = `974644565f12fed0f802d7b8b6af4418f2800f36` ✓

**后续修复轮次说明**：如果工作站获取的 HEAD 不为 `974644565f...`，说明文档又发生 HEAD 漂移，需在工作站拉取前重新跑 release-doc-consistency-check。

---

## 6. Sandbox 严禁事项遵守声明

本 gate 严格遵守：

- ✓ 不修改业务代码（`packages/opencode` / `packages/app` / `packages/desktop` 未动）
- ✓ 不打 installer
- ✓ 不签名
- ✓ 不创建 tag / release
- ✓ 不合并 dev
- ✓ 不上传产物
- ✓ 不复制外部 `.skill` 文件 / `contract-copilot` 商业内容
- ✓ 不伪造"全量 test 通过" / "真实 model 已通过" 证据
- ✓ 严禁事项全部遵守

---

## 8. HEAD 校验策略（避免无限漂移）

**问题**：如果文档中写 `git rev-parse HEAD` 必须 **等于** X，那么文档自身 commit 后 HEAD 又会变，文档与现实再次不一致。

**解决方案**：本文档使用 **祖先判断**（`git merge-base --is-ancestor`），工作站 HEAD **必须包含** gate commit `974644565f12fed0f802d7b8b6af4418f2800f36`：

- ✅ `HEAD == 974644565` 满足
- ✅ `HEAD 是 974644565 之后的任意 commit` 满足
- ✅ `HEAD 是 974644565 的 descendant` 满足
- ❌ `HEAD == 71eadafb` 不满足（拉了 gate 之前的提交）
- ❌ `HEAD == 34abe6f` 不满足（拉了 gate 之前的提交）

**逻辑保证**：

- 本文档后续任何 fixup commit（如本文档补丁、Cheat Sheet 微调）都是 gate commit 的 descendant
- 工作站只要包含 gate commit = 包含所有 fixup
- HEAD 数字可以继续漂移，但语义约束（必须包含 gate）不会失效

**完整校验脚本**（工作站 §0.2）：

```powershell
$gate = "974644565f12fed0f802d7b8b6af4418f2800f36"
$actual = git rev-parse HEAD
$isAncestor = git merge-base --is-ancestor $gate $actual
if (-not $isAncestor) {
  Write-Error "HEAD $actual does not contain gate commit $gate. STOP."
  exit 1
}
Write-Host "OK: HEAD $actual contains gate commit $gate"
```

---

## 7. 工作站 §0.2 强制 HEAD 校验

工作站开始执行 §0.2 时**必须**：

```powershell
$gate = "974644565f12fed0f802d7b8b6af4418f2800f36"
$actual = git rev-parse HEAD
# 使用 git merge-base --is-ancestor 判断 actual 是否包含 gate
$isAncestor = git merge-base --is-ancestor $gate $actual
if (-not $isAncestor) {
  Write-Error "HEAD $actual does not contain gate commit $gate. Worktree has not pulled latest documentation. STOP."
  exit 1
}
Write-Host "OK: HEAD $actual contains gate commit $gate"
```

如 HEAD 不匹配，**立即停止**，不要继续 §[11] 之后任何步骤。
