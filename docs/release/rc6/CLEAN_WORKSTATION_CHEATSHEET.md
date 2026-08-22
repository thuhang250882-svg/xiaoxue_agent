# RC6 Clean Workstation Release — Cheat Sheet

日期：2026-08-22
目标：在干净 Windows 工作站执行 RC6 release（[11-25] 节）
worktree：`E:\software programming\opencode-dev-rc6-skill-center`
base HEAD：`34abe6f8974c7cf9a31db884d9009c533a9ba845`（branch `rc6-release-prep`）

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
# 期望：34abe6f8974c7cf9a31db884d9009c533a9ba845
```

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
bun .\scripts\rc6-lifecycle\model-e2e-runner.ps1 `
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

**退出条件**：46 cases 全部 `pass` 或 `skipped`（无 hard threshold fail）

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

## 8. [18] 签名（可选）

```powershell
# 仅当 [16] 通过且需要签名
$env:XIAOXUE_REQUIRE_SIGNING = "true"
$env:XIAOXUE_LOCAL_SIGNING_THUMBPRINT = "<thumbprint>"

# 或使用 CSC_LINK
$env:CSC_LINK = "E:\path\to\cert.pfx"
$env:CSC_KEY_PASSWORD = "<password>"

# 重新打包（含签名）
bun run package 2>&1 | Tee-Object docs\release\rc6\release-prep\package-signed-result.txt

# 验证签名
Get-AuthenticodeSignature "artifacts\录井小雪-0.8.0-rc.6-win32-x64.exe"
```

**退出条件**：签名状态 `Valid`

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

**GUI 验收清单**：

- [ ] 安装后 desktop 启动正常
- [ ] chat 输入框可用
- [ ] Skill Center 列表显示 4 核心 Skill
- [ ] knowledge-distill 触发 + 事实卡输出
- [ ] 升级路径不丢失 Skill
- [ ] 卸载后无残留文件（`%AppData%\xiaoxue` 等）

**证据落地**：`docs/release/rc6/evidence/gui-validation-2026-08-22.json`

---

## 10. [20] GitHub Release

```powershell
cd E:\software programming\opencode-dev-rc6-release-20260822

# 创建 tag
git tag -a v0.8.0-rc.6 -m "录井小雪 0.8.0-rc.6"

# 推送 tag
git push origin v0.8.0-rc.6

# 创建 release（必须先生成产物）
gh release create v0.8.0-rc.6 `
  --title "录井小雪 v0.8.0-rc.6" `
  --notes-file docs/release/rc6/RELEASE_NOTES.md `
  --prerelease `
  artifacts/录井小雪-0.8.0-rc.6-win32-x64.exe
```

**退出条件**：GitHub release 页面可见

---

## 11. [21] 上传产物 + sha256

```powershell
# 计算 sha256
$hash = (Get-FileHash "artifacts\录井小雪-0.8.0-rc.6-win32-x64.exe" -Algorithm SHA256).Hash
Write-Host "sha256: $hash"

# 写入 sha256 文件
"$hash  录井小雪-0.8.0-rc.6-win32-x64.exe" | Out-File -Encoding utf8 `
  "artifacts\录井小雪-0.8.0-rc.6-win32-x64.exe.sha256"

# 上传
gh release upload v0.8.0-rc.6 `
  "artifacts\录井小雪-0.8.0-rc.6-win32-x64.exe.sha256"
```

---

## 12. [22-23] 更新文档

```powershell
# CHANGELOG.md
# 在头部添加 v0.8.0-rc.6 条目

# CONTRIBUTING.md
# 更新 release 流程链接到 RC6_PIPELINE_SUMMARY.md
```

---

## 13. [24] 合并到 dev

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
| 1 | worktree HEAD | `34abe6f897` | ☐ |
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
