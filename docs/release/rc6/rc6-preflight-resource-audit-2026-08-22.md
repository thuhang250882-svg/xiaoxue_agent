# RC6 Preflight P0 Fix & Resource Reproducibility Audit

- **Date**: 2026-08-22
- **HEAD**: `fc92416b00ae3e2dc9ca8a95ae58b423dd8292f3`
- **Branch**: detached HEAD at `fc92416b00` (worktree `E:\software programming\opencode-dev-rc6-release-20260822`)
- **Verdict**: ❌ **P0 NON_DETERMINISTIC_RUNTIME + P1 STALE_DOCS_GATE** — release 不通过

---

## 1. Canonical Skill source/package path (P0 fix)

### 1.1 修正后的 canonical 模型

```
canonical source       : .opencode/skills/         (git tracked, 仓库根)
package-time root      : extraResources in electron-builder.config.ts:
                           from: "../../.opencode/skills/"
                           to:   "skills/"
runtime lookup         : process.resourcesPath/skills
integrity hash prefix  : "skills/<name>/SKILL.md"  (from generate-resource-integrity.ts)
```

**禁止的旧路径（类型 D — RC6 已修复）**：

- `packages/desktop/resources/skills/bundled/` — **错误假设**
- `packages/desktop/resources/skills/` — **不存在且不应存在**
- 从 sandbox / RC5 installer 手工复制 skills — **禁止**

### 1.2 全仓搜索结果

| 文件 | 出现次数 | 处理 |
| --- | --- | --- |
| `docs/release/rc6/PREFLIGHT.md` | 0（修订前）/ 1（修订后作为严禁警告） | 已修订 → 加 §4.2 严禁说明 |
| `scripts/rc6-release/release-doc-consistency-test.ts` | 4（自身代码引用 + warning） | 已扩展 §8 检查 |
| `docs/release/rc6/evidence/SANDBOX_DIAGNOSTIC/20260822-rc6-gatea-run01/GATE_A_REPORT.md` | 4（诊断 evidence） | 已移至 SANDBOX_DIAGNOSTIC/（不计入正式 evidence） |
| `docs/release/rc6/rc6-packaged-resource-validation-2026-08-22.md` | 1（"bundled" 词，runtime 分类，非路径） | 不需改（语义不同） |
| `packages/desktop/scripts/generate-resource-integrity.ts` | 0 | 早就用 `.opencode/skills/` 正确路径 |
| `packages/desktop/electron-builder.config.ts` | 0（用 `from: "../../.opencode/skills/"`） | 正确 |
| `scripts/rc6-release-prep/installer-prep.ts` | 0（用 `.opencode/skills/`） | 正确 |
| `scripts/rc6-lifecycle/install-checklist.ts` | 0（用 `.opencode/skills/`） | 正确 |

### 1.3 修复文件

- **`docs/release/rc6/PREFLIGHT.md`** §4.2：完全重写，明确 canonical source = `.opencode/skills/`，列出打包链路 + SHA-256 生成链路，添加严禁说明，引用 consistency test §8
- **`scripts/rc6-release/release-doc-consistency-test.ts`** §8：新增 stale-path 检查，扫描 release docs/scripts，跳过 `SANDBOX_DIAGNOSTIC/` 与 test 自身文件，识别 prohibition context
- **`scripts/rc6-release/release-doc-consistency-test.ts`** §9：新增 `install-checklist.ts` size > N hard gate 检查（与 PREFLIGHT §4.3 修订一致）

---

## 2. integrity.json reproducibility audit

### 2.1 Baseline (committed, HEAD = fc92416b00)

```
SHA256 : 235d77111f80c1e383a5510946e68dc3fed146025076992be1f02e515504fb32
size   : 49438 bytes
entries: 278 (275 skills + 3 obsidian-plugin)
```

### 2.2 Generator run #1

```
command : bun ./scripts/generate-resource-integrity.ts (after copy-icons.ts prod + prepare-python-runtime.ts)
SHA256  : 63f8fad5a45433019996a62d5cde1cca0ee77b0385cecb32711fe6dda49d77b7
size    : 48321 bytes
entries : 278 (275 skills + 3 obsidian-plugin)
```

### 2.3 Generator run #2 (determinism check)

```
SHA256 : 63f8fad5a45433019996a62d5cde1cca0ee77b0385cecb32711fe6dda49d77b7  ✓ DETERMINISTIC
size   : 48321 bytes
entries: 278
```

**Conclusion**: `gen-1 SHA256 == gen-2 SHA256` → integrity generator **是 deterministic**。

### 2.4 Semantic diff (committed vs generated)

| 类别 | 数量 | 说明 |
| --- | --- | --- |
| added paths   | 0 | 无新增 |
| removed paths | 0 | 无删除 |
| changed hashes| **1** | `skills/tender-document-review/SKILL.md` |
| unchanged     | 277 | 全部一致 |
| size delta    | -1117 bytes | committed 更大（可能 trailing newline/JSON indent 风格） |

**唯一 changed entry**：

```
path     : skills/tender-document-review/SKILL.md
committed sha256 : cfee689e0a75fecd2a2ec5e18fe684db...
generated sha256 : a1781d93feca81e674b0db049f58669b...
```

### 2.5 committed 是 stale — 但不擅自 commit

- generator 是 deterministic ✓
- 1 个 SKILL.md 文件 hash 在 commit 之间变化
- `rc6-packaged-resource-validation-2026-08-22.md` §3.1 已记录："审查合同 SKILL.md modify 导致 sha256 变化" 类似 stale 情况
- 但本次 audit 发现的是 `tender-document-review/SKILL.md`（不同文件）

按用户规则：
> "若相等但不同于 committed：解释具体差异来源，不得直接把新 manifest 当正确答案提交。"

**Operator 不擅自 commit integrity.json 更新**。让 release operator 在工作站确认 1 个 hash 变化来源（可能是文档修订被遗忘 rebuild）后再决定。

**Working tree 状态**：

```
M packages/desktop/resources/integrity.json   ← generator 重写后未 commit（待用户决策）
```

---

## 3. Python runtime provenance audit

### 3.1 `prepare-python-runtime.ts` 行为分析

| 行 | 代码 | 问题 |
| --- | --- | --- |
| 7 | `const source = Bun.env.XIAOXUE_PYTHON_SOURCE ?? "python"` | ❌ 不 pin Python 来源，默认用系统 PATH |
| 12 | `const base = (await run([source, "-c", "import sys; print(sys.base_prefix)"])).trim()` | ❌ 不 pin 安装位置 |
| 48-58 | `pip install --requirement packages/desktop/python/requirements-windows.lock` | ⚠️ pip 默认从 PyPI 下载 |
| 60-62 | `if (Bun.env.XIAOXUE_PYTHON_WHEELHOUSE) { pip.push("--no-index", "--find-links", ...) }` | ⚠️ wheelhouse 仅在设置时才用 |
| 73-83 | 写 `xiaoxue-runtime.json` 含 `createdAt: new Date().toISOString()` | ❌ 时间戳每次跑不同 |

### 3.2 5 个问题回答

| # | 问题 | 答案 |
| --- | --- | --- |
| 1 | Python runtime 是否 pin 到具体版本？ | ❌ **不 pin**（只 lock requirements 文件，不锁 Python 解释器） |
| 2 | Python 3.14.4 是仓库要求，还是当前机器偶然？ | ❌ **偶然**（机器有 `C:\Python314\python.exe`，PATH 上即可用） |
| 3 | 13 个依赖是否有锁定来源/版本？ | ⚠️ **半锁定**（requirements-windows.lock 有版本，但 pip 默认从 PyPI 下载；除非设置 XIAOXUE_PYTHON_WHEELHOUSE 才走本地 wheelhouse） |
| 4 | 不同干净工作站是否得到相同 runtime？ | ❌ **不保证**（Python 版本随机 + pip 字节码可能不同 + 时间戳不同 + 跨机器 Python lib 可能不同） |
| 5 | Python runtime 是否进入 integrity hash？ | ❌ **没有**（generate-resource-integrity.ts 只 hash `.opencode/skills/` 和 `resources/obsidian-plugin/`，完全忽略 `resources/python/`） |

### 3.3 P0 结论

**Python runtime 是 NON_DETERMINISTIC_RUNTIME**：

- 不同工作站产出**可能**不同的 `resources/python/` 内容
- 无 SHA-256 校验保护
- `integrity.json` 不覆盖 python 路径
- 即使 generator deterministic，python runtime 本身不 deterministic

**这意味着**：

- 同一 commit hash 在不同工作站 build，installer 内嵌的 `resources/python/` 可能 byte-level 不同
- 用户实测"Python 是否能跑 office 解析"在工作站 A 和工作站 B 可能结论不同
- 没有 SHA-256 校验可以验证 packaged runtime 与 committed 一致

### 3.4 修复路径（**不擅自执行**，标记 P0 阻塞项）

需要发布 release 前修复（任选其一或组合）：

1. **pin Python 来源**：要求设置 `XIAOXUE_PYTHON_SOURCE=C:\Python314\python.exe` 或类似
2. **包含 Python wheelhouse**：让 `XIAOXUE_PYTHON_WHEELHOUSE` 必设，从本地 wheelhouse 安装（避免 PyPI 网络依赖）
3. **去除 `createdAt`**：让 `xiaoxue-runtime.json` 只含静态内容（python 版本 + packages）
4. **加入 integrity hash**：扩展 `generate-resource-integrity.ts` 也 hash `resources/python/` 内容（至少 hash `xiaoxue-runtime.json` + `python.exe` 等关键文件）
5. **输出 manifest**：在 `resources/python/` 下生成 `manifest.json` 记录 Python 版本 + 所有 wheel 哈希

**Operator 不擅自选择方案**。这是 **P0 阻塞 release 项**。

---

## 4. SANDBOX_DIAGNOSTIC marking

### 4.1 移动 Gate A evidence

```
原路径: docs/release/rc6/evidence/20260822-rc6-gatea-run01/
新路径: docs/release/rc6/evidence/SANDBOX_DIAGNOSTIC/20260822-rc6-gatea-run01/
```

**标记**：本次 run 是 sandbox 内诊断（非真实工作站 Gate A），不作为正式 release evidence。

正式工作站必须新建 `docs/release/rc6/evidence/<run-id>/` 并执行完整 Gate A（sandbox blocker 解决后）。

### 4.2 验证

- `docs/release/rc6/evidence/SANDBOX_DIAGNOSTIC/20260822-rc6-gatea-run01/GATE_A_REPORT.md` 仍然存在（作为历史诊断）
- consistency test §8 跳过 `SANDBOX_DIAGNOSTIC/` 子目录
- 工作站成功 Gate A 后，本 SANDBOX_DIAGNOSTIC evidence 不参与 GO/NO-GO 判定

---

## 5. Remaining P0 / P1

### P0 (阻塞 release)

| # | 项 | 来源 | 修复路径 |
| --- | --- | --- | --- |
| P0-1 | **NON_DETERMINISTIC_RUNTIME** | Python runtime 不 pin | §3.4 5 选 1 或组合 |
| P0-2 | **STALE_INTEGRITY** (1 hash) | committed ≠ generated 1 hash | release operator 在工作站确认 hash 差异来源，决定是否 commit |

### P1 (一致性 / 文档缺陷，不阻塞)

| # | 项 | 来源 | 状态 |
| --- | --- | --- | --- |
| P1-1 | `install-checklist.ts:62` `stat.size > 40000` hard gate | 与 PREFLIGHT §4.3 修订冲突 | consistency test §9 已检测；**未修改**（用户规则"禁止测试阈值"） |
| P1-2 | CHEATSHEET `[15]` 出现 6 次 | step duplication warn | 不修改（结构合理） |
| P1-3 | PIPELINE_SUMMARY 多个 `[NN]` 出现多次 | step duplication warn | 不修改（结构合理） |
| P1-4 | CHEATSHEET 提 `0.8.0-rc.5` | version conflict warn | 不修改（历史对比） |

### 全部 consistency test 结果（exit 1 — 已知 P1 hard-fail）

```
main docs scanned : 5
errors            : 1
warnings          : 27

[ERROR] install-checklist-size-gate: scripts\rc6-lifecycle\install-checklist.ts:
         literal size > N hard gate -> 'stat.size > 40000' (PREFLIGHT §4.3 修订)

（warnings 全是 step-duplication / version-conflict，不阻塞）
```

---

## 6. 改动文件清单（uncommitted in working tree）

| 文件 | 状态 | 修改内容 |
| --- | --- | --- |
| `docs/release/rc6/PREFLIGHT.md` | M | §4.2 重写为 canonical `.opencode/skills/` 路径 |
| `scripts/rc6-release/release-doc-consistency-test.ts` | M | §8 stale-path check + §9 install-checklist size gate check |
| `packages/desktop/resources/integrity.json` | M | generator 重写后未 commit（待用户决策） |
| `docs/release/rc6/evidence/20260822-rc6-resource-audit/` | untracked | 本次 audit evidence |
| `docs/release/rc6/evidence/SANDBOX_DIAGNOSTIC/` | untracked | Gate A diagnostic 移动 |

**Working tree 不是 clean**（按用户规则，未 commit integrity.json；其他 4 项是 audit 产物）。

---

## 7. 最终 release-prep HEAD

```
HEAD : fc92416b00ae3e2dc9ca8a95ae58b423dd8292f3
      (detached, no commits added during this audit)
```

**未 commit 任何 commit**。所有改动在 working tree。

---

## 8. git diff --check

```
exit code : 0 (no whitespace errors)
warnings  : 1 (LF/CRLF on integrity.json — generator output LF, Windows worktree CRLF)
```

---

## 9. Operator 最终判定

```
RELEASE : ❌ NO-GO
P0 blockers : 2 (NON_DETERMINISTIC_RUNTIME + STALE_INTEGRITY)
P1 documented : 4 (install-checklist size gate + 3 step/version warnings)
consistency test : 1 hard fail (install-checklist-size-gate)
```

**不进入 [11]-[25]**。

### 阻塞路径

工作站 release operator 必须解决 P0-1（Python runtime provenance）后才能开始真实 Gate A 执行。修复方案在 §3.4，可由用户决定。

P0-2（STALE_INTEGRITY 1 hash）需在工作站确认 hash 差异来源后决定是否 commit。

---

## 10. Evidence

```
docs/release/rc6/evidence/20260822-rc6-resource-audit/
├── prepare/
│   ├── copy-icons.log
│   └── prepare-python.log
├── diff/
│   ├── committed-integrity.json
│   ├── gen-1-integrity.json
│   ├── gen-2-integrity.json
│   ├── gen-1.log
│   ├── gen-2.log
│   ├── integrity-diff.py
│   └── integrity-diff.log
├── consistency-test.log
├── consistency-test-2.log
├── final-git-status.log
└── git-diff-check.log

docs/release/rc6/evidence/SANDBOX_DIAGNOSTIC/20260822-rc6-gatea-run01/
└── GATE_A_REPORT.md   (历史诊断，不参与正式 release evidence)
```

---

**Audit 完成。停止。** 不进入 [11]-[25]。