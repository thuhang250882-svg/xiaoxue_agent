# RC6 Clean Workstation Release — Cheat Sheet

日期：2026-08-22
目标：在干净 Windows 工作站执行 RC6 release（[11-25] 节）
worktree：`E:\software programming\opencode-dev-rc6-skill-center`
base HEAD：`71eadafb994e8aa7bb06775ddbab4c8e7abde3a7`（branch `rc6-release-prep`）

> **HEAD 必须严格等于 `71eadafb994e8aa7bb06775ddbab4c8e7abde3a7`**，否则说明 worktree 还未拉取最新文档，**立即停止并 fetch**。

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
# 期望：71eadafb994e8aa7bb06775ddbab4c8e7abde3a7
```

**如 HEAD 不匹配**：从主仓库 fetch 后重切 worktree（见 §0.2），**不要 checkout 当前 branch 然后用 reset 硬拉到指定 hash**。

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

## 4. [14] model E2E（4 核心 Skill）

```powershell
cd E:\software programming\opencode-dev-rc6-release-20260822

# Knowledge Distill
bun .\scripts\rc6-lifecycle\model-e2e-runner.ts `
  --skill knowledge-distill `
  --fixture .\fixtures\rc6-lifecycle\knowledge-distill\synthetic-standard-001.md `
  2>&1 | Tee-Object docs\release\rc6\lifecycle\results\<timestamp>\knowledge-distill.json

# Tender Document Review
bun .\scripts\rc6-lifecycle\model-e2e-runner.ts `
  --skill tender-document-review `
  --fixture .\fixtures\rc6-lifecycle\tender-document-review\synthetic-tender-001.md `
  2>&1 | Tee-Object docs\release\rc6\lifecycle\results\<timestamp>\tender-document-review.json

# Tender Bid Generation
bun .\scripts\rc6-lifecycle\model-e2e-runner.ts `
  --skill tender-bid-generation `
  --fixture .\fixtures\rc6-lifecycle\tender-bid-generation\synthetic-requirement-matrix.json `
  2>&1 | Tee-Object docs\release\rc6\lifecycle\results\<timestamp>\tender-bid-generation.json

# Petroleum Contract Review（审查合同）
bun .\scripts\rc6-lifecycle\model-e2e-runner.ts `
  --skill 审查合同 `
  --fixture .\fixtures\rc6-lifecycle\审查合同\synthetic-contract-001.md `
  2>&1 | Tee-Object docs\release\rc6\lifecycle\results\<timestamp>\审查合同.json
```

**退出条件**：4/4 产出 JSON 到 `docs/release/rc6/lifecycle/results/<timestamp>/`

---

## 5. [15] 完整 Acceptance Matrix（46 case）

```powershell
cd E:\software programming\opencode-dev-rc6-release-20260822

bun .\scripts\rc6-lifecycle\acceptance-runner.ts `
  --fixture-dir .\fixtures\rc6-lifecycle\ `
  2>&1 | Tee-Object docs\release\rc6\lifecycle\results\<timestamp>\acceptance-full.json
```

**退出条件**（分三类门禁，任一未过 = 阻断发布）：

**A. 硬门禁（13 case）—— 必须全部 `pass`**，任一 fail = 立即阻断发布，不接受 skipped：

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

**B. 软门槛（25 case）—— actualScore ≥ threshold 为 pass**：

- `KD-01..08`（8）、`TD-01..04`（4）、`TB-01..04`（4）、`PC-01..08`（8）、`PI-04`（1）
- 软门槛 case 不可被 `skipped` 绕过；model call 未跑计为 `pending`，但所有软门槛必须实际跑过模型才能 release。

**C. Trigger 验证（8 case）—— 必须实际触发对应 Skill**：

- `TR-01..08` 实际以中文 prompt 触发 Skill 且 Skill 输出有效响应 = `pass`；`pending`/`skipped` 一律不接受。

**总结门禁**：硬门禁 13/13 pass + 软门槛 25/25 actualScore ≥ threshold + Trigger 8/8 pass 全部成立，Acceptance Matrix 才计为通过。

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

## 10. [20] 固定最终 release HEAD + tag

发布顺序严格按以下步骤，**确保 tag、源码、文档、installer 和 sha256 对应同一状态**：

### 10.0 提交并确认 worktree clean（**必须在 tag 之前**）

```powershell
cd E:\software programming\opencode-dev-rc6-release-20260822

# 提交文档与脚本变更
$env:GIT_AUTHOR_NAME = "18699612389"
$env:GIT_AUTHOR_EMAIL = "327842294@qq.com"
$env:GIT_COMMITTER_NAME = "18699612389"
$env:GIT_COMMITTER_EMAIL = "327842294@qq.com"

git add -A
git status   # 期望：无修改 或仅预期内修改
git diff --check
# 仅在工作 tree clean 后才可继续
```

### 10.1 固定最终 release HEAD

```powershell
$FINAL_HEAD = git rev-parse HEAD
Write-Host "Final release HEAD: $FINAL_HEAD"
# 记录到本地，验证后续所有动作都基于此 HEAD
```

### 10.2 创建 tag（**仅在 HEAD 固定后**）

```powershell
git tag -a v0.8.0-rc.6 -m "录井小雪 0.8.0-rc.6"
git push origin v0.8.0-rc.6
```

### 10.3 计算 installer sha256（**从 tag 对应源码重新打**）

```powershell
# 如 installer 未打或需重新打（必须用 tag 对应源码）
$env:XIAOXUE_PRODUCT_VERSION = "0.8.0-rc.6"
$env:OPENCODE_CHANNEL = "prod"
bun run package 2>&1 | Tee-Object docs\release\rc6\release-prep\package-final-result.txt

# 计算 sha256
$hash = (Get-FileHash "artifacts\录井小雪-0.8.0-rc.6-win32-x64.exe" -Algorithm SHA256).Hash
Write-Host "sha256: $hash"
"$hash  录井小雪-0.8.0-rc.6-win32-x64.exe" | Out-File -Encoding utf8 `
  "artifacts\录井小雪-0.8.0-rc.6-win32-x64.exe.sha256"
```

### 10.4 创建 GitHub prerelease（**仅在 installer 产出后**）

```powershell
gh release create v0.8.0-rc.6 `
  --title "录井小雪 v0.8.0-rc.6" `
  --notes-file docs\release\rc6\RELEASE_NOTES.md `
  --prerelease `
  artifacts\录井小雪-0.8.0-rc.6-win32-x64.exe
```

### 10.5 上传 sha256

```powershell
gh release upload v0.8.0-rc.6 `
  "artifacts\录井小雪-0.8.0-rc.6-win32-x64.exe.sha256"
```

**退出条件**：GitHub release 页面可见 + sha256 附件已上传。

---

## 12. [22-23] 更新文档（在 §10.0 之前已完成；tag 后仅补充 release notes 链接）

```powershell
# CHANGELOG.md
# 在头部添加 v0.8.0-rc.6 条目

# CONTRIBUTING.md
# 更新 release 流程链接到 RC6_PIPELINE_SUMMARY.md
```

## 13. [24] 合并到 dev（**最后一步，release 全部完成后才合**）

```powershell
cd E:\software programming\opencode-dev

git checkout dev
git pull origin dev
git merge --no-ff rc6-release-prep -m "release(rc6): merge rc6-release-prep into dev"
git push origin dev
```

---

## 14. [25] 通知

- [ ] 邮件列表 / Slack / 钉钉
- [ ] 内部 Wiki 公告
- [ ] 客户邮件（beta 测试组）

---

## 15. 验证清单（最终确认）

| # | 项 | 期望 | 状态 |
| --- | --- | --- | --- |
| 1 | worktree HEAD | `71eadafb994e8aa7bb06775ddbab4c8e7abde3a7` | ☐ |
| 2 | 3 包 typecheck | 3/3 exit 0 | ☐ |
| 3 | 全量 bun test | 0 fail | ☐ |
| 4 | install-checklist | 8/8 通过 | ☐ |
| 5 | model E2E | 4/4 JSON 落地 | ☐ |
| 6 | Acceptance Matrix | 46 cases pass | ☐ |
| 7 | installer-prep --strict | 8/8 通过 | ☐ |
| 8 | installer 产物 | `录井小雪-0.8.0-rc.6-win32-x64.exe` 存在 | ☐ |
| 9 | 签名 | `Get-AuthenticodeSignature` = Valid | ☐ |
| 10 | GUI 验收 | 6/6 通过 | ☐ |
| 11 | GitHub release | 可见 | ☐ |
| 12 | sha256 上传 | 可见 | ☐ |
| 13 | CHANGELOG 更新 | 已提交 | ☐ |
| 14 | dev 合并 | 无冲突 | ☐ |
| 15 | 通知发送 | 已发送 | ☐ |

---

## 16. 回滚方案

如果 release 阶段发现严重问题：

```powershell
# 1. 删除 GitHub release（UI）
# 2. 删除 tag
git push origin :refs/tags/v0.8.0-rc.6
git tag -d v0.8.0-rc.6

# 3. 撤销 dev 合并（如果已推）
git -C "E:\software programming\opencode-dev" revert -m 1 <merge-commit-sha>
git -C "E:\software programming\opencode-dev" push origin dev

# 4. 通知用户 RC6 发布延后
```

如果 installer 打包失败但 release-prep 没问题：

```powershell
# 在 rc6-release-prep 上修复，重新 [17]-[21]
# 不需要 reset 到 rc6-clean-machine-lifecycle
```

---

## 17. 严禁事项（继续）

- 不得在 sandbox 内执行本 cheat-sheet
- 不得跳过 [13] install-checklist（沙盒内 7/8 不算通过）
- 不得伪造 model E2E 通过证据
- 不得省略 sha256 上传
- 不得在 main 分支操作（必须 rc6-release-prep → dev）
