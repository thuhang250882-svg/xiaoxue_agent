# RC6 Dependency Install P0 Audit — tree-sitter-powershell

**日期**: 2026-08-22（审计执行延续至 2026-08-23）
**基线 commit**: `d893a768749d7961418c77b7a6b87e8121a0eaae`
**修复分支**: `rc6-install-fix`（独立于 Gate A detached worktree）
**最终 HEAD**: `d0de51d655`
**结论**: 方案 A（从 trustedDependencies 移除 tree-sitter-powershell）已验证有效，fresh install 通过。

---

## 1. 背景

Gate A Run02 在 fresh dependency install 阶段真实失败：

```
'node-gyp.cmd' is not recognized as an internal or external command
error: install script from "tree-sitter-powershell" exited with 1
```

当前 Gate A = NO-GO。本审计查清依赖配置、runtime 使用、对照 upstream issue，评估三方案并实施最小修复。

---

## 2. Exact package version 与依赖配置

| 项 | 值 |
|---|---|
| 包名 | `tree-sitter-powershell` |
| Exact version | **0.25.10** |
| 直接依赖者 | `packages/opencode/package.json`（`"tree-sitter-powershell": "0.25.10"`） |
| 根 package.json 直接依赖 | 否（仅出现在 `trustedDependencies`） |
| 基线 trustedDependencies | **包含** `tree-sitter-powershell` |
| bun.lock trustedDependencies | 基线**包含**，修复后**移除** |
| npm tarball install script | `"install": "node-gyp-build"` |
| npm tarball main | `bindings/node`（native binding 入口，runtime 不使用） |
| npm tarball prebuilds | **无**（tarball 18 个文件，无 `prebuilds/` 目录） |
| 依赖 | `node-addon-api ^7.1.0`, `node-gyp-build ^4.8.0`, peer `tree-sitter ^0.25.0`（optional） |

**为什么 install script 被 Bun 执行**：Bun 默认不执行任意 lifecycle scripts；只有列入根 `package.json` 的 `trustedDependencies` 的包才会执行其 install/postinstall。基线把 `tree-sitter-powershell` 列入该列表，因此 Bun 执行 `node-gyp-build`。

**node-gyp / node-gyp-build 来源**：`node-gyp-build` 是 `tree-sitter-powershell` 自身的 dependency。它先查找 `prebuilds/<platform>/`；由于 0.25.10 无 prebuilds，fallback 到调用 `node-gyp` 源码编译，Windows 上需要 Visual Studio Build Tools。release workstation 无 VS Build Tools / node-gyp，故失败。

---

## 3. Runtime import evidence（仅 WASM）

全仓搜索 `tree-sitter-powershell` 仅有一处 runtime consumer：

**`packages/opencode/src/tool/shell.ts`**（基线第 325 行）：

```ts
const { default: psWasm } = await import("tree-sitter-powershell/tree-sitter-powershell.wasm" as string, {
  with: { type: "wasm" },
})
```

加载链路（shell.ts `parser` lazy initializer）：

1. `web-tree-sitter` 提供 `Parser` / `Language`（WASM 运行时）。
2. `tree-sitter-powershell/tree-sitter-powershell.wasm` 以 `{ with: { type: "wasm" } }` 静态资源方式导入。
3. `resolveWasm()` 将导入结果解析为文件系统路径。
4. `Language.load(psPath)` 加载 WASM，`new Parser().setLanguage(psLanguage)` 使用。

**分类**：B（仅 import tree-sitter-powershell.wasm）。**不** import native Node binding（`bindings/node`）。

**结论**：native node-gyp build 不属于运行时需求。

### WASM 存在性与可加载性验证（fresh install 后）

在 fresh worktree（`opencode-dev-rc6-install-verify`，HEAD=207d69352e）中：

```
ps wasm exists: true
ps wasm size: 983236 bytes
web-tree-sitter wasm exists: true
[1] root: program sexp: (program (statement_list (pipeline (pipeline_chain (command command_name: (comma
[2] root: program sexp: (program (statement_list (pipeline (pipeline_chain (command command_name: (comma
PASS: tree-sitter-powershell WASM loads and parses PowerShell without native binding.
```

验证脚本用 `web-tree-sitter` 加载 `tree-sitter-powershell.wasm` 并成功解析两条真实 PowerShell 语句（`Get-Process | Where-Object { $_.CPU -gt 10 }`、`Write-Host "Hello, World!"`），root 节点均为 `program`。证明 WASM-only 路径完全可用。

---

## 4. Upstream Windows issue 对照

Upstream issue [anomalyco/opencode#25563](https://github.com/anomalyco/opencode/issues/25563) 报告完全相同错误：

- `'node-gyp.cmd' is not recognized` + `install script from tree-sitter-powershell exited with 1`
- 原因：0.25.10 无 prebuilds；`node-gyp-build` fallback 到 `node-gyp build`，需要 VS Build Tools
- 对比：`tree-sitter-bash@0.25.0` 带 `prebuilds/{darwin-arm64,darwin-x64,linux-arm64,linux-x64,win32-arm64,win32-x64}`，Windows 安装成功
- 提议修复：从 trustedDependencies 移除（与方案 A 一致）

**本 fork 实际 runtime usage 与该情况一致**：本 fork 同样仅通过 WASM 加载（shell.ts:325），不 import native binding。fresh install 后 `packages/opencode/node_modules/tree-sitter-bash/` 含 `prebuilds/`，而 `tree-sitter-powershell/` 无 `prebuilds/`、无 build 产物，与 upstream 描述完全吻合。

---

## 5. 三方案比较

| 维度 | A. 移除 trustedDependencies | B. 安装 node-gyp + VS Build Tools | C. 升级到带 prebuild 版本 |
|---|---|---|---|
| Fresh install reproducibility | ✅ 高（Bun 跳过 install script，全平台） | ❌ 低（需 ~2GB VS Build Tools + node-gyp） | ✅ 高（若有 prebuild 版本） |
| 对现有 WASM runtime 影响 | ✅ 零（.wasm 仍在 tarball，已验证可加载） | ➖ 中性（native binding 无人 import） | ⚠️ 需验证 WASM 内容/兼容性变化 |
| Lockfile 变化 | ✅ 仅 trustedDependencies 段（2 行删除） | ✅ 零 | ⚠️ 包版本变化 |
| Windows release 风险 | ✅ 极低 | ⚠️ 中高（工具链安装失败会再次失败） | ⚠️ 中（prebuild 可用性不可控） |
| 是否扩大 RC6 范围 | ✅ 否（install 阶段问题） | ⚠️ 是（修改 workstation 要求） | ⚠️ 是（升级 dependency） |
| 额外收益 | 省去 Mac/Linux 无谓 native build | 无 | 无 |

**选择理由（方案 A）**：最小、可证明、不扩大范围、不升级 dependency、不依赖环境补丁。与 upstream 提议一致。方案 B 违反"最小可复现"且扩大范围；方案 C 违反"不要为了 RC6 无必要升级 dependency major/minor"。

---

## 6. package.json / bun.lock diff

```diff
diff --git a/bun.lock b/bun.lock
@@ -1070,7 +1070,6 @@
   },
   "trustedDependencies": [
     "esbuild",
-    "tree-sitter-powershell",
     "protobufjs",
     "electron",
     "web-tree-sitter",
diff --git a/package.json b/package.json
@@ -138,7 +138,6 @@
     "protobufjs",
     "tree-sitter",
     "tree-sitter-bash",
-    "tree-sitter-powershell",
     "web-tree-sitter",
     "electron"
   ],
```

**仅 2 行删除**，无其他 lockfile 变化（frozen install 后 `git status` 干净）。

---

## 7. Fresh bun install 真实结果

在完全 fresh 的独立 worktree（`opencode-dev-rc6-install-verify`，HEAD=207d69352e，0 node_modules）执行：

```
bun install --frozen-lockfile
```

结果：

```
Resolved, downloaded and extracted [35]
$ bun run --cwd packages/core fix-node-pty
$ bun run script/fix-node-pty.ts
$ husky
...
4758 packages installed [48.24s]
```

- ✅ exit 0（无 `node-gyp.cmd` 错误，无 `install script ... exited with 1`）
- ✅ lockfile 无意外变化（install 后 `git status` = clean）
- ✅ `tree-sitter-powershell.wasm` 存在：`packages/opencode/node_modules/tree-sitter-powershell/tree-sitter-powershell.wasm`（983236 bytes）
- ✅ `tree-sitter-powershell` 无 build 产物（未执行 native build）
- ✅ `tree-sitter-bash` 用 prebuilds（对比正常）

注：PowerShell 把 bun 的 stderr 进度行误报为 `NativeCommandError`，属 shell 解析伪错误，不影响 bun 实际成功。

---

## 8. Targeted tests / typecheck

- **WASM 加载验证**：通过（见第 3 节）。
- **shell tool 测试**（`packages/opencode/test/tool/shell.test.ts`）：受 pre-existing 问题阻塞（见下），**与 tree-sitter-powershell 修复无关**。
- **typecheck**（`packages/opencode`）：受 pre-existing 问题阻塞（见下），**与 tree-sitter-powershell 修复无关**。

### Pre-existing 问题（独立于本修复，已在基线存在）

1. `domains/geology_report/rules/loader.ts` import `yaml`、`domains/shared/validators.ts` import `zod`，但根 catalog 无 `yaml`，导致 typecheck 报 `TS2307 Cannot find module 'yaml'/'zod'`，shell.test.ts 同样因 `Cannot find package 'yaml'/'zod'` 无法加载。
2. 全仓 `bun typecheck`（turbo）在 Windows 上并行 tsgo 触发 `fatal error: runtime: cannot allocate memory`（OOM），属环境/并行度问题。

这两项均为 RC6 release base 的预存在问题（RC6 文档已记录 `packages/app` typecheck pre-existing 等），不在本 P0 审计范围内，未做修改（遵守"不扩大 RC6 范围"）。

---

## 9. Regression 检查

在现有 `scripts/rc6-lifecycle/install-checklist.ts` 框架中新增最小 check：

- `NATIVE_BUILD_BLOCKLIST = new Set(["tree-sitter-powershell"])`
- `checkTrustedDependenciesNativeBuild()`：读取根 `package.json`，若 blocklist 中任何包出现在 `trustedDependencies` 则 fail（`--strict` 时退出码 1）。

运行结果（修复后）：

```
✓ no native-postinstall blocklist in trustedDependencies: 1 blocklisted package(s) absent from trustedDependencies
```

未建立大型 dependency framework，仅复用现有 checklist 框架。

---

## 10. Final HEAD 与 worktree status

**rc6-install-fix 分支**（worktree: `opencode-dev-rc6-release-20260822`）：

```
d0de51d655 test(rc6): add trustedDependencies native-postinstall regression
207d69352e fix(install): drop tree-sitter-powershell from trustedDependencies
d893a76874 docs(rc6): add preflight-fix audit report 2026-08-22   ← 基线
```

- `git status` = clean
- stash@{0} = 审计前预备的方案 A 编辑（保留为证据）

**验证 worktree**（`opencode-dev-rc6-install-verify`，分支 `rc6-install-fix-verify`，HEAD=207d69352e）：fresh install + WASM 验证完成，含临时日志（`_install.log`、`_wasm-verify.ts` 等，沙箱限制未清理，不影响主分支）。

**Gate A detached worktree**（`opencode-dev-rc6-gatea-run02`，d893a76874）：未修改（遵守"不在 Gate A detached worktree 直接修代码"）。

---

## 11. 结论与后续

- 方案 A 已实施并验证：fresh `bun install --frozen-lockfile` 通过，WASM runtime 不受影响。
- 修复 commit：`207d69352e`；regression commit：`d0de51d655`。
- 建议将 `rc6-install-fix` 合并回 RC6 release 基线后重跑 Gate A。
- 本审计**不**继续正式 Gate A（遵守指令）。
