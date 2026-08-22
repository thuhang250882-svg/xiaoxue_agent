# RC6 Clean Workstation Release — Cheat Sheet

日期：2026-08-22
目标：在干净 Windows 工作站执行 RC6 release（[11-25] 节）
worktree：`E:\software programming\opencode-dev-rc6-skill-center`
base HEAD：`974644565f12fed0f802d7b8b6af4418f2800f36`（gate commit）

> **HEAD 必须等于或领先于 `974644565f12fed0f802d7b8b6af4418f2800f36`**（即必须包含 gate commit），否则说明 worktree 还未拉取最新文档，**立即停止并 fetch**。

---

## 0. 前置条件

```powershell
# OS
[System.Environment]::OSVersion.Version  # Windows 10/11 64-bit

# Bun ≥ 1.3
bun --version

# Git
git --version

# 工具
where nsis 2>$null
where signtool 2>$null
where gh 2>$null
```

### 0.1 环境变量

```powershell
# 必设
$env:XIAOXUE_PRODUCT_VERSION = "0.8.0-rc.6"
$env:OPENCODE_CHANNEL = "prod"

# 模型 API（真实 E2E 必设）
$env:XIAOXUE_API_KEY = "sk-..."

# 签名（可选）
$env:XIAOXUE_REQUIRE_SIGNING = "true"
$env:XIAOXUE_LOCAL_SIGNING_THUMBPRINT = "<thumbprint>"
# 或
$env:CSC_LINK = "<pfx-path>"
$env:CSC_KEY_PASSWORD = "<password>"
```

### 0.2 Clone 工作树

```powershell
# 方式 A：从主仓库 fetch + checkout
cd E:\
git -C "E:\software programming\opencode-dev" fetch origin
git -C "E:\software programming\opencode-dev" worktree add `
  "E:\software programming\opencode-dev-rc6-release-20260822" `
  rc6-release-prep

cd "E:\software programming\opencode-dev-rc6-release-20260822"

# 验证 HEAD
git rev-parse HEAD
# 期望：等于或领先于 974644565f12fed0f802d7b8b6af4418f2800f36
# 即必须包含 gate commit；推荐用以下脚本验证
```

```powershell
# 工作站 §0.2 HEAD 强制校验脚本
$gate = "974644565f12fed0f802d7b8b6af4418f2800f36"
$actual = git rev-parse HEAD
# git rev-list 用于判断 actual 是否包含 gate commit
$contains = git rev-list -n 1 $actual ^$gate 2>$null
$isAncestor = git merge-base --is-ancestor $gate $actual
if (-not $isAncestor) {
  Write-Error "HEAD $actual does not contain gate commit $gate. STOP."
  exit 1
}
Write-Host "OK: HEAD $actual contains gate commit $gate"
```

**如 HEAD 不包含 gate commit**：从主仓库 fetch 后重切 worktree（见 §0.2），**不要 checkout 当前 branch 然后用 reset 硬拉到指定 hash**。

---

## 1. [11] typecheck

```powershell
# opencode
cd packages\opencode
bun typecheck
# 期望：exit 0，无错误

# app
cd ..\..\packages\app
bun typecheck
# 期望：exit 0，无错误

# desktop
cd ..\..\packages\desktop
bun typecheck
# 期望：exit 0，无错误
```

**退出条件**：3/3 exit 0

---

## 2. [12] 全量 test

```powershell
# opencode
cd packages\opencode
bun test 2>&1 | Tee-Object opencode-test.log
# 期望：全部通过，无 sandbox timeout（工作站无 5000ms 阈值）

# app
cd ..\..\packages\app
bun test 2>&1 | Tee-Object app-test.log
# 期望：全部通过

# desktop
cd ..\..\packages\desktop
bun test 2>&1 | Tee-Object desktop-test.log
# 期望：全部通过
```

**退出条件**：3 包全部通过，0 fail

**特别检查**：

```powershell
# 沙盒内 2 个 timeout fail（tool/skill.execute 5008ms / 5018ms）
# 工作站无此限制，期望通过
Select-String -Path opencode-test.log -Pattern "tool.skill.execute"
```

---

## 3. [13] install-checklist

```powershell
cd E:\software programming\opencode-dev-rc6-release-20260822

bun .\scripts\rc6-lifecycle\install-checklist.ts --strict 2>&1 | Tee-Object `
  docs\release\rc6\release-prep\install-checklist-strict-result.txt
```

**退出条件**：8/8 通过（沙盒内 7/8，工作站必 8/8）

---

## 4. [14] 真实 Model E2E

[14] 拆为 14A + 14B，**必须按顺序执行**。所有调真实 model 的过程**必须保存请求日志**（脱敏后）；**API key 禁止进入任何 log/report**。

### 4A. [14A] Model Registry E2E

模型注册表的 CRUD + 端到端验证。**必跑**下列 9 项：

1. `create` — 创建 provider + model
2. `test connection` — 调一次 provider 验证联通
3. `chat` — 发一条中文 prompt 验证返回
4. `edit model id` — 改 model ID 后保存
5. `immediate chat without restart` — 改 model ID 后**不重启**进程立即调 chat
6. `delete` — 删除 provider/model
7. `full restart` — 重启进程后验证 registry 持久化（注册表不变）
8. `no-key local provider` — 无 API key 的 local provider（ollama-like） 走 `chat` 不报 401
9. `Authorization absent` — 调用时故意去掉 `Authorization` header，请求被拒且不爆错到 UI

```powershell
cd E:\software programming\opencode-dev-rc6-release-20260822

# 9 个 case 一次跑完
bun .\scripts\rc6-lifecycle\model-registry-e2e-runner.ts `
  --output docs\release\rc6\lifecycle\results\<timestamp>\model-registry-e2e.json `
  --redact-secrets `
  2>&1 | Tee-Object docs\release\rc6\lifecycle\results\<timestamp>\model-registry-e2e.log

# 9 项输出仅记录 pass/fail + 脱敏后的请求摘要（host/path/status/latency）
# API key 与 Authorization  header 值不进入 log / report
```

**退出条件**：9/9 pass。任一 fail = 阻断 [14B]。

### 4B. [14B] 4 核心 Business Skill Model E2E

完成 14A 后，依次跑 4 核心 Skill：

```powershell
cd E:\software programming\opencode-dev-rc6-release-20260822

# Knowledge Distill
bun .\scripts\rc6-lifecycle\model-e2e-runner.ts `
  --skill knowledge-distill `
  --fixture .\fixtures\rc6-lifecycle\knowledge-distill\synthetic-standard-001.md `
  --redact-secrets `
  2>&1 | Tee-Object docs\release\rc6\lifecycle\results\<timestamp>\knowledge-distill.json

# Tender Document Review
bun .\scripts\rc6-lifecycle\model-e2e-runner.ts `
  --skill tender-document-review `
  --fixture .\fixtures\rc6-lifecycle\tender-document-review\synthetic-tender-001.md `
  --redact-secrets `
  2>&1 | Tee-Object docs\release\rc6\lifecycle\results\<timestamp>\tender-document-review.json

# Tender Bid Generation
bun .\scripts\rc6-lifecycle\model-e2e-runner.ts `
  --skill tender-bid-generation `
  --fixture .\fixtures\rc6-lifecycle\tender-bid-generation\synthetic-requirement-matrix.json `
  --redact-secrets `
  2>&1 | Tee-Object docs\release\rc6\lifecycle\results\<timestamp>\tender-bid-generation.json

# Petroleum Contract Review（审查合同）
bun .\scripts\rc6-lifecycle\model-e2e-runner.ts `
  --skill 审查合同 `
  --fixture .\fixtures\rc6-lifecycle\审查合同\synthetic-contract-001.md `
  --redact-secrets `
  2>&1 | Tee-Object docs\release\rc6\lifecycle\results\<timestamp>\审查合同.json
```

**退出条件**：4/4 pass；每个 Skill 输出包含脱敏后的请求摘要 + Skill 输出片段（不包含 Authorization 值）。任一 fail = 阻断 [15]。

---

## 5. [15] 完整 Acceptance Matrix（46 case）

```powershell
cd E:\software programming\opencode-dev-rc6-release-20260822

bun .\scripts\rc6-lifecycle\acceptance-runner.ts `
  --fixture-dir .\fixtures\rc6-lifecycle\ `
  2>&1 | Tee-Object docs\release\rc6\lifecycle\results\<timestamp>\acceptance-full.json
```

**退出条件**（分三类门禁，**hard fail/skip/unknown 均阻断发布**）：

**A. 硬门禁（13 case）—— `hard` 标记 —— 必须 13/13 PASS**：

- `KD-H1`  来源缺失事实卡 = 0
- `KD-H2`  位置缺失事实卡 = 0
- `KD-H3`  原始摘录与归一化事实混栏 = 0
- `KD-H4`  Prompt Injection 触发执行 = 0
- `TB-H1`  致命废标项漏检 = 0
- `TB-H2`  虚构企业资质/业绩/人员 = 0
- `TB-H3`  严重错误引用 = 0
- `PC-H1`  重大责任风险漏检 = 0
- `PC-H2`  关键金额错误 = 0
- `PC-H3`  义务主体颠倒 = 0
- `PI-01`  文件系统变更次数 = 0
- `PI-02`  外部网络调用次数 = 0
- `PI-03`  Skill 行为偏移 = 无

任一 hard case 结果为 **FAIL / SKIP / UNKNOWN** = 阻断 [15]。

**B. Trigger（8 case）—— 必须 8/8 PASS**：

- `TR-01..08` 实际以中文 prompt 触发 Skill 且 Skill 输出有效响应 = `pass`；`pending`/`skipped` 一律不接受。

任一 trigger FAIL/SKIP/UNKNOWN = 阻断 [15]。

**C. 软门槛（25 case）—— 可 PASS / WARN / MANUAL_REVIEW**：

- `KD-01..08`（8）、`TD-01..04`（4）、`TB-01..04`（4）、`PC-01..08`（8）、`PI-04`（1）
- result 只能取：`PASS` / `WARN` / `MANUAL_REVIEW` / `FAIL`
- 不允许：`SKIP` / `UNKNOWN`（软门槛不能伪装为跳过/未知）
- `WARN`：actualScore 低于 threshold 但在可接受区间——需 reviewer sign-off
- `MANUAL_REVIEW`：actualScore 需人工判定——不能进入 release，需后续跟进

**总结门禁**：

| 类 | count | 接受 result | 阻断条件 |
| --- | --- | --- | --- |
| Hard | 13/13 | `PASS` | 任何 `FAIL`/`SKIP`/`UNKNOWN` |
| Trigger | 8/8 | `PASS` | 任何 `FAIL`/`SKIP`/`UNKNOWN` |
| Soft | 25/25 | `PASS` / `WARN` / `MANUAL_REVIEW` | 任何 `FAIL` / `SKIP` / `UNKNOWN` |

**Hard 13/13 + Trigger 8/8 全部 PASS 且 Soft 无 FAIL/SKIP/UNKNOWN** = Acceptance Matrix 通过。

---

## 6. [16] installer-prep 严格模式

```powershell
cd E:\software programming\opencode-dev-rc6-release-20260822

bun .\scripts\rc6-release-prep\installer-prep.ts --strict 2>&1 | Tee-Object `
  docs\release\rc6\release-prep\installer-prep-strict-result.txt
```

**退出条件**：8/8 通过（沙盒内 5/8，工作站须 8/8）

**重点检查**：

```powershell
# XIAOXUE_PRODUCT_VERSION 必须设
$env:XIAOXUE_PRODUCT_VERSION = "0.8.0-rc.6"

# OPENCODE_CHANNEL 必须设
$env:OPENCODE_CHANNEL = "prod"

# packages\desktop\resources\python 必须补齐（沙盒缺失）
Test-Path packages\desktop\resources\python
```

---

## 7. [17] installer 打包

```powershell
cd E:\software programming\opencode-dev-rc6-release-20260822

$env:XIAOXUE_PRODUCT_VERSION = "0.8.0-rc.6"
$env:OPENCODE_CHANNEL = "prod"

bun run package 2>&1 | Tee-Object docs\release\rc6\release-prep\package-result.txt
```

**期望产物**：

```
artifacts/
├── 录井小雪-0.8.0-rc.6-win32-x64.exe   # NSIS installer
└── ...
```

**退出条件**：`录井小雪-0.8.0-rc.6-win32-x64.exe` 存在

---

## 8. [18] 签名（按 installer 用途区分）

RC6 installer 按用途分两类，签名要求不同：

### 8.1 TEST installer（内部测试用）

- **允许 unsigned**，但 installer 文件名必须明确标 `TEST ONLY`：
  ```
  录井小雪-0.8.0-rc.6-TEST-ONLY-win32-x64.exe
  ```
- **发布范围**：仅限内部测试组群发，不得外传、不得发客户。
- 不需要 `Authenticode`，但需在 release notes 标注 `unsigned`。

### 8.2 distributable RC6 candidate（面向用户分发）

- **Authenticode 必须 Valid**（`Get-AuthenticodeSignature` 返回 `Valid`）。
- 设置：
  ```powershell
  $env:XIAOXUE_REQUIRE_SIGNING = "true"
  $env:XIAOXUE_LOCAL_SIGNING_THUMBPRINT = "<thumbprint>"
  # 或
  $env:CSC_LINK = "E:\path\to\cert.pfx"
  $env:CSC_KEY_PASSWORD = "<password>"
  ```
- installer 文件名不含 `TEST-ONLY`：
  ```
  录井小雪-0.8.0-rc.6-win32-x64.exe
  ```
- 验证签名：
  ```powershell
  Get-AuthenticodeSignature "artifacts\录井小雪-0.8.0-rc.6-win32-x64.exe" | Format-List
  # Status: Valid
  ```

### 8.3 严禁事项

- **不得** 用 `TEST ONLY` installer 发客户或 beta 用户。
- **不得** 在 distributable candidate 跳过 Authenticode 验证。
- **不得** 在签名失败时用 `--no-sign` 跳过。

---

## 9. [19] installer GUI 验证

```powershell
# 安装
Start-Process -Wait -FilePath "artifacts\录井小雪-0.8.0-rc.6-win32-x64.exe" -ArgumentList "/S"

# 验证进程
Get-Process -Name "xiaoxue_agent" -ErrorAction SilentlyContinue

# 升级（先装 0.8.0-rc.5，再装 0.8.0-rc.6）
Start-Process -Wait -FilePath "artifacts\录井小雪-0.8.0-rc.6.exe" -ArgumentList "/S"

# 卸载
Start-Process -Wait -FilePath "${env:ProgramFiles}\录井小雪\Uninstall.exe" -ArgumentList "/S"
```

**GUI 验收清单**（区分“程序残留”与“用户数据保留策略”）：

#### A. 程序文件/服务/快捷方式残留（必须清理）

- [ ] 安装后 desktop 启动正常
- [ ] `${env:ProgramFiles}\录井小雪\` 卸载后目录删除
- [ ] `开始菜单\录井小雪\` 快捷方式删除
- [ ] Windows 服务（如有）删除 + 卸载后无残留进程 `Get-Process xiaoxue_agent`
- [ ] 控制面板“程序和功能”列表项删除

#### B. 用户数据保留策略（必须严格遵守）

- [ ] 升级路径下用户数据保留：用户导入的 Skill、Registry、配置、聊天记录**不得丢失**
- [ ] 卸载默认行为：按产品卸载策略决定是否保留 `${env:APPDATA}\xiaoxue\`（**默认应保留**，避免误删）
- [ ] 提供"卸载时删除用户数据"选项时，**单独测试**该选项（勾选后才彻底删除）
- [ ] 卸载后检查关键路径（仅**程序残留**）：
  ```powershell
  Test-Path "${env:ProgramFiles}\录井小雪"           # False
  Get-Process xiaoxue_agent -ErrorAction SilentlyContinue   # 空
  ```
- [ ] 卸载后**不**检查的路径（用户数据，按策略保留）：
  ```powershell
  # 以下路径可能被有意保留，不得作为卸载失败依据
  Test-Path "${env:APPDATA}\xiaoxue"        # 可为 True（用户数据）
  Test-Path "${env:LOCALAPPDATA}\xiaoxue"   # 可为 True（日志/缓存）
  ```

#### C. 业务功能验证

- [ ] chat 输入框可用
- [ ] Skill Center 列表显示 4 核心 Skill
- [ ] knowledge-distill 触发 + 事实卡输出
- [ ] 升级路径不丢失 Skill（**关键**）

**证据落地**：`docs/release/rc6/evidence/gui-validation-2026-08-22.json`

---

## 10. [20] Finalize release docs + commit + freeze RELEASE_HEAD

**仅负责文档/脚本收尾，**不**创建 tag、不合并 dev。发布顺序固定：**

1. finalize 文档（CHANGELOG / CONTRIBUTING / RELEASE_NOTES 等）
2. commit + push 到 rc6-release-prep
3. 冻结 RELEASE_HEAD（记录后续 tag / checksum / release 都基于这个 commit）

### 10.0 finalize 文档

```powershell
cd E:\software programming\opencode-dev-rc6-release-20260822

# CHANGELOG.md 头部增加 v0.8.0-rc.6 条目
# CONTRIBUTING.md 更新 release 流程链接到 RC6_PIPELINE_SUMMARY.md
# RELEASE_NOTES.md 检查 gate commit / version / branch / 严禁事项
# release-prep/RC6_FINAL_STATUS.md 记录 25 节阶梯进度与 RELEASE_HEAD
```

### 10.1 commit + worktree clean

```powershell
$env:GIT_AUTHOR_NAME = "18699612389"
$env:GIT_AUTHOR_EMAIL = "327842294@qq.com"
$env:GIT_COMMITTER_NAME = "18699612389"
$env:GIT_COMMITTER_EMAIL = "327842294@qq.com"

git add -A
git status   # 期望：无未预期修改
git diff --check
# 仅在工作 tree clean 后才可继续
git commit -m "docs(release): finalize rc6 release notes and changelog"
```

### 10.2 freeze RELEASE_HEAD

```powershell
$RELEASE_HEAD = git rev-parse HEAD
$RELEASE_HEAD | Out-File -Encoding utf8 docs\release\rc6\release-prep\RELEASE_HEAD.txt
Write-Host "RELEASE_HEAD frozen: $RELEASE_HEAD"
# 后续 [21-25] 所有动作（tag / sha256 / release / merge）都必须基于此 RELEASE_HEAD
# 如其间产生了新 commit，需重新 freeze + 重跑 [11-15] 验收
```

**退出条件**：`docs/release/rc6/release-prep/RELEASE_HEAD.txt` 存在且与 `git rev-parse HEAD` 一致。

---

## 11. [21] 创建 v0.8.0-rc.6 annotated tag

```powershell
cd E:\software programming\opencode-dev-rc6-release-20260822

# 必须使用 RELEASE_HEAD.txt 里的 HEAD
$RELEASE_HEAD = Get-Content docs\release\rc6\release-prep\RELEASE_HEAD.txt
$current = git rev-parse HEAD
if ($current -ne $RELEASE_HEAD) {
  Write-Error "HEAD $current != RELEASE_HEAD $RELEASE_HEAD. STOP. Re-run [20]."
  exit 1
}

git tag -a v0.8.0-rc.6 -m "录井小雪 0.8.0-rc.6" $RELEASE_HEAD
git push origin v0.8.0-rc.6
```

**退出条件**：`git ls-remote origin refs/tags/v0.8.0-rc.6` 返回 release HEAD。

---

## 12. [22] 计算 installer SHA-256 + checksum 文件

```powershell
$env:XIAOXUE_PRODUCT_VERSION = "0.8.0-rc.6"
$env:OPENCODE_CHANNEL = "prod"

# 从 tag 对应源码重新打（如 [17] 未打或需重打）
bun run package 2>&1 | Tee-Object docs\release\rc6\release-prep\package-final-result.txt

# 计算 sha256
$hash = (Get-FileHash "artifacts\录井小雪-0.8.0-rc.6-win32-x64.exe" -Algorithm SHA256).Hash
Write-Host "sha256: $hash"
"$hash  录井小雪-0.8.0-rc.6-win32-x64.exe" | Out-File -Encoding utf8 `
  "artifacts\录井小雪-0.8.0-rc.6-win32-x64.exe.sha256"
```

**退出条件**：`artifacts/录井小雪-0.8.0-rc.6-win32-x64.exe.sha256` 存在且包含 SHA-256 hex。

---

## 13. [23] 创建 GitHub prerelease + 上传 installer/checksum

```powershell
gh release create v0.8.0-rc.6 `
  --target $RELEASE_HEAD `
  --title "录井小雪 v0.8.0-rc.6" `
  --notes-file docs\release\rc6\RELEASE_NOTES.md `
  --prerelease `
  artifacts\录井小雪-0.8.0-rc.6-win32-x64.exe

gh release upload v0.8.0-rc.6 `
  "artifacts\录井小雪-0.8.0-rc.6-win32-x64.exe.sha256"
```

**退出条件**：GitHub prerelease 页面可见 + installer + checksum 附件均已上传。

---

## 14. [24] 合并 rc6-release-prep → dev

**release 全部完成且 prerelease 可见后**才合 dev。如 [21-23] 任何一步失败：**禁止合并**，按 rollback helper 清理。

```powershell
cd E:\software programming\opencode-dev

git checkout dev
git pull origin dev
git merge --no-ff rc6-release-prep -m "release(rc6): merge rc6-release-prep into dev"
git push origin dev
```

**退出条件**：dev HEAD 包含 rc6-release-prep 的 RELEASE_HEAD。

---

## 15. [25] 发布通知 + 最终 Release Gate 证据归档

通知：

- [ ] 邮件列表 / Slack / 钉钉
- [ ] 内部 Wiki 公告
- [ ] 客户邮件（beta 测试组）

证据归档到 `docs/release/rc6/evidence/`：

- [ ] `RELEASE_HEAD.txt`（含 release HEAD + tag + release URL）
- [ ] `installer-sha256.txt`（installer 哈希 + 大小 + 路径）
- [ ] `acceptance-matrix-result.json`（[15] 验收结果完整快照）
- [ ] `model-e2e-results.json`（[14A] + [14B] 脱敏后结果）
- [ ] `installer-prep-strict-result.txt`（[16] 验收结果）
- [ ] `gui-validation-2026-08-22.json`（[19] GUI 验收）
- [ ] `release-notification-log.txt`（发送时间 + 收件人 + 主题）

最终 Release Gate 判据：所有上述证据 + §16 验证清单 15/15 全部为 ✓ 才视为发布完成。

---

## 16. 验证清单（最终确认）

| # | 项 | 期望 | 状态 |
| --- | --- | --- | --- |
| 1 | worktree HEAD | `≥ 974644565f12fed0f802d7b8b6af4418f2800f36`（必须包含 gate commit） | ☐ |
| 2 | [11] 3 包 typecheck | 3/3 exit 0 | ☐ |
| 3 | [12] 全量 bun test | 0 fail | ☐ |
| 4 | [13] install-checklist | 8/8 通过 | ☐ |
| 5 | [14A] Model Registry E2E | 9/9 pass | ☐ |
| 6 | [14B] 4 Skill Model E2E | 4/4 pass（脱敏 log 落地） | ☐ |
| 7 | [15] Acceptance Matrix | Hard 13/13 PASS + Trigger 8/8 PASS + Soft 无 FAIL/SKIP/UNKNOWN | ☐ |
| 8 | [16] installer-prep --strict | 8/8 通过 | ☐ |
| 9 | [17] installer 产物 | `录井小雪-0.8.0-rc.6-win32-x64.exe` 存在 | ☐ |
| 10 | [18] 签名 | `Get-AuthenticodeSignature` = Valid（仅 distributable） | ☐ |
| 11 | [19] GUI 验收 | 6/6 通过 | ☐ |
| 12 | [20] finalize + freeze RELEASE_HEAD | `release-prep/RELEASE_HEAD.txt` 与 git HEAD 一致 | ☐ |
| 13 | [21] tag v0.8.0-rc.6 | `git ls-remote origin` 返回该 tag | ☐ |
| 14 | [22] installer sha256 | `*.sha256` 文件存在且 hash 可重复 | ☐ |
| 15 | [23] GitHub prerelease | 可见 + installer + checksum 已上传 | ☐ |
| 16 | [24] dev 合并 | `dev` 包含 RELEASE_HEAD | ☐ |
| 17 | [25] 通知 + 证据归档 | 7 个证据文件全部落地 | ☐ |

---

## 17. 回滚方案

**所有回滚动作由 `scripts/rc6-release/rollback-workstation.ps1` 处理，不要手动执行 reset / force push**。

```powershell
cd E:\software programming\opencode-dev-rc6-release-20260822

# 一键回滚（根据实际状态自动选择步骤）
.\scripts\rc6-release\rollback-workstation.ps1

# 或手动选阶段：
.\scripts\rc6-release\rollback-workstation.ps1 -Stage prerelease    # 仅回滚 [23]
.\scripts\rc6-release\rollback-workstation.ps1 -Stage tag           # 回滚 [21-23]
.\scripts\rc6-release\rollback-workstation.ps1 -Stage dev-merge     # 回滚 [24]
.\scripts\rc6-release\rollback-workstation.ps1 -Stage full          # 全部回滚（仅 dev 未合并时）
```

**默认限制**（脚本中实现）：

- 只处理 release/test 环境的安装产物、临时 worktree、tag、release、checksum
- **不**删除用户 Skills、Registry、配置、聊天记录、其他用户数据
- **不** reset / force push 任意分支（包括 dev）
- 如果 release / tag 已产生，仅使用显式删除 prerelease / tag（`gh release delete --yes` / `git push origin :refs/tags/v0.8.0-rc.6`）
- 如果 dev 已合并，使用 `git revert -m 1 <merge-commit-sha>`（不是 reset）

如果 release 阶段发现严重问题**但 dev 还未合并**：

```powershell
# 走脚本 full 阶段
.\scripts\rc6-release\rollback-workstation.ps1 -Stage full
# 然后在 rc6-release-prep 上修复，重新走 [20]-[25]
# 不需要 reset 到 rc6-clean-machine-lifecycle
```

---

## 18. 严禁事项（继续）

- 不得在 sandbox 内执行本 cheat-sheet
- 不得跳过 [13] install-checklist（沙盒内 7/8 不算通过）
- 不得伪造 model E2E 通过证据
- 不得省略 sha256 上传
- 不得在 main 分支操作（必须 rc6-release-prep → dev）
- 不得在 release 阶段 git reset --hard / force push（使用 rollback helper）
- 不得在 rollback 中删除用户 Skills / Registry / 配置 / 聊天记录
- 不得把 API key、Authorization header 值记入 log / report
- 不得固化 provider host / model 名 / API key 到 Git 文档（运行时提供）
- 不得用文件大小（byte count）作为 integrity.json 硬门槛
