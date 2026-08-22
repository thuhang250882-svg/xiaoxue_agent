# RC6 Clean Workstation — PREFLIGHT

日期：2026-08-22
目的：在干净 Windows 工作站开始执行 `[11-25]` 节之前，跑这份自检清单
worktree：`E:\software programming\opencode-dev-rc6-skill-center`

> 本文档**不引用 commit hash**，因此没有 HEAD 漂移问题。

---

## 1. Worktree 准备（10 分钟）

### 1.1 主仓库 fetch

```powershell
cd "E:\software programming\opencode-dev"
git fetch origin
git status
```

期望：`Your branch is up to date`（无 uncommitted changes）

### 1.2 新建 worktree

```powershell
git worktree add "E:\software programming\opencode-dev-rc6-release-20260822" rc6-release-prep

cd "E:\software programming\opencode-dev-rc6-release-20260822"
```

**严禁**：不要 checkout `rc6-release-prep` 后用 `git reset --hard` 到任意 hash — 会丢失历史。

### 1.3 HEAD 必须包含 gate commit

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

**期望**：ExitCode 0

---

## 2. 工具链检查（5 分钟）

```powershell
# Bun ≥ 1.3
bun --version

# Git
git --version

# GitHub CLI（用于 release）
gh --version

# Node（备用）
node --version

# PowerShell ≥ 5.1
$PSVersionTable.PSVersion
```

| 工具 | 期望 | 失败处理 |
| --- | --- | --- |
| bun | ≥ 1.3.0 | 重新安装 Bun |
| git | ≥ 2.40 | 升级 Git for Windows |
| gh | ≥ 2.40 | 安装 GitHub CLI + auth |
| node | ≥ 18 | nvm-windows |
| PowerShell | ≥ 5.1 | Win10/11 默认满足 |

---

## 3. 环境变量（10 分钟）

### 3.1 必设

```powershell
$env:XIAOXUE_PRODUCT_VERSION = "0.8.0-rc.6"
$env:OPENCODE_CHANNEL = "prod"
$env:XIAOXUE_API_KEY = "sk-..."          # 真实 model E2E 用

# 持久化（可选）
[SystemEnvironment]::SetEnvironmentVariable("XIAOXUE_PRODUCT_VERSION", "0.8.0-rc.6", "User")
[SystemEnvironment]::SetEnvironmentVariable("OPENCODE_CHANNEL", "prod", "User")
[SystemEnvironment]::SetEnvironmentVariable("XIAOXUE_API_KEY", "sk-...", "User")
```

### 3.2 签名（仅 distributable candidate）

```powershell
$env:XIAOXUE_REQUIRE_SIGNING = "true"
$env:XIAOXUE_LOCAL_SIGNING_THUMBPRINT = "<thumbprint>"
# 或
$env:CSC_LINK = "E:\path\to\cert.pfx"
$env:CSC_KEY_PASSWORD = "<password>"
```

**TEST installer 不需要签名** — 但文件名前缀必须含 `TEST-ONLY`。

---

## 4. 资源自检（5 分钟）

### 4.1 build resources

```powershell
Test-Path "packages\desktop\resources\icons\icon.ico"
Test-Path "packages\desktop\resources\icons\icon.icns"
Test-Path "packages\desktop\resources\entitlements.plist"
Test-Path "packages\desktop\resources\python"
```

期望：4/4 True。如果 `python/` 缺失，需要从 build cache 复制或重新构建。

### 4.2 Bundled skills

```powershell
Test-Path "packages\desktop\resources\skills\bundled"
ls "packages\desktop\resources\skills\" 2>&1 | Measure-Object | Select-Object -ExpandProperty Count
```

期望：≥ 4 个核心 Skill 目录（knowledge-distill / tender-document-review / tender-bid-generation / 审查合同）

### 4.3 integrity.json

```powershell
Test-Path "packages\desktop\resources\integrity.json"
(Get-Item "packages\desktop\resources\integrity.json").Length
```

期望：文件存在；size ≈ 48119 bytes（如差异较大，需重新生成）

### 4.4 Obsidian plugin

```powershell
Test-Path "packages\desktop\resources\obsidian-plugin"
```

期望：True（可选，但建议有）

---

## 5. Network 自检（2 分钟）

```powershell
# model provider 端点（按实际配置）
Test-NetConnection -ComputerName "<model-provider-host>" -Port 443

# GitHub（release 用）
Test-NetConnection -ComputerName "api.github.com" -Port 443

# WinGet / Chocolatey（如用）
Test-NetConnection -ComputerName "community.chocolatey.org" -Port 443
```

期望：3/3 TcpTestSucceeded

---

## 6. Disk space 自检（1 分钟）

```powershell
Get-PSDrive C | Select-Object Used, Free
```

期望：Free ≥ 10 GB（installer 打包 + 多份 build artifact）

---

## 7. PREFLIGHT 通过标志

| 节 | 项 | 期望 |
| --- | --- | --- |
| 1 | Worktree 已建 | ✓ |
| 1 | HEAD ≥ gate commit | ✓ |
| 2 | Bun / Git / gh / Node / PowerShell | 5/5 通过 |
| 3 | XIAOXUE_PRODUCT_VERSION / OPENCODE_CHANNEL / XIAOXUE_API_KEY | 3/3 设 |
| 3 | 签名 env vars（仅 distributable） | 设置或不设 |
| 4 | build resources（icon / python） | 4/4 存在 |
| 4 | bundled skills | ≥ 4 核心 Skill |
| 4 | integrity.json | 存在 + size ≈ 48119 |
| 5 | network（model + github + chocolatey） | 3/3 通 |
| 6 | disk space | ≥ 10 GB |

**全部通过才能进入 `[11] typecheck` 阶段。**

如任何一项不通过：

1. 记录失败项
2. **不要**继续后续步骤
3. 回到本节修复
4. 修复后重跑本节

---

## 8. 紧急回滚（如 PREFLIGHT 失败但已部分执行）

```powershell
# 1. 删除刚建的 worktree（不影响主仓库）
git worktree remove "E:\software programming\opencode-dev-rc6-release-20260822" --force

# 2. 主仓库回到原状
git checkout dev
git status  # 应干净

# 3. 重新跑 PREFLIGHT，修复问题后再建 worktree
```

---

## 9. PREFLIGHT 与 Cheat Sheet 关系

```
PREFLIGHT.md (本文)            ← 准备工作站
       ↓
CLEAN_WORKSTATION_CHEATSHEET.md §0  ← 克隆 + 校验
       ↓
CLEAN_WORKSTATION_CHEATSHEET.md §[11-25]  ← 执行 release
```

PREFLIGHT 不替代 Cheat Sheet §0 的 HEAD 校验 — 两份独立验证。

---

## 10. 严禁事项

- **不得**跳过 PREFLIGHT 直接进入 [11] — 任何环境差异都会在后面放大
- **不得**在 PREFLIGHT 未通过时执行 installer 打包 — 可能产物损坏
- **不得**在 PREFLIGHT 未通过时执行 GitHub release — 失败无法回滚