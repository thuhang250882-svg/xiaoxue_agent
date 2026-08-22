# RC6 Preflight Fix — 2026-08-22

针对 `rc6-preflight-resource-audit-2026-08-22.md` 报告中的 P0 / P1 阻断项，
在独立分支 `rc6-preflight-fix` 上完成修复并通过 3 个独立 commits 提交。
本报告记录决策依据、改动清单、确定性证据与剩余 blocker。

---

## 1. 分支拓扑

| 分支 | HEAD | 状态 |
| --- | --- | --- |
| `rc6-release-prep` | `fc92416b00` | 不动 |
| `rc6-preflight-fix` | `106ad4a8a5` | 本次修复的独立分支, 基于 `fc92416b00` 创建 |
| `dev` | (未触碰) | 不动 |

`rc6-preflight-fix` 当前 3 个新增 commit:

```
106ad4a8a5 fix(desktop): refresh rc6 resource integrity
8e137e8d1a fix(release): validate packaged resources semantically
24dcfecb95 fix(release): pin desktop python runtime
fc92416b00 docs(release): finalize rc6 workstation runbook  <-- 基线
```

工作树 `git status` clean, `git diff --check` exit 0。

---

## 2. Python exact version 决策来源

不在 PATH 上假设版本, 而是审计仓库已批准的 evidence 决策:

| 来源 | 记录值 | 状态 |
| --- | --- | --- |
| `docs/xiaoxue-0.8-rc4-delivery-audit.md` 第 112 行 | `Python 3.14.4` | RC4 历史记录 |
| `docs/xiaoxue-0.8-rc5-release-readiness.md` 第 51 行 | `Python 3.14.4` | RC5 打包验证 |
| `docs/xiaoxue-0.8-rc5-release-readiness.md` 第 132 行 | `Python 3.12.10` | RC5 早期发现, 已被 3.14.4 替换 |
| `docs/xiaoxue-0.8-rc3-final-optimization-report.md` 第 306 行 | `Python 3.14.4` | RC3 |
| `packages/desktop/resources/python/Lib/*.py` 文件时间戳 | `2026-04-07` | 与 CPython 3.14.x 时间线一致 |
| `packages/desktop/resources/python/xiaoxue-runtime.json` (上次 prepare 输出) | `python: "3.14.4"` | 最新可重现 evidence |

**决策**: pinned = **`3.14.4`**, 写入新建文件
`packages/desktop/python/PYTHON_VERSION` (单一字节源)。

`3.12.10` 仅在 RC5 早期记录中出现一次, 之后已被替换为 3.14.4,
不作为 pinned 候选。

---

## 3. Runtime Provenance

`PYTHON_VERSION` 由脚本和验证共同引用, 形成 fail closed 闭环:

```
                ┌──────────────────────────────────────────┐
                │ packages/desktop/python/PYTHON_VERSION   │  pinned = 3.14.4
                │     (git tracked, X.Y.Z, 严格格式)        │
                └────────────────┬─────────────────────────┘
                                 │
                  ┌──────────────┼──────────────┐
                  ▼              ▼              ▼
        prepare-python-    verify-python-  python-runtime-spec
        runtime.ts         runtime.ts      (shared module)
                  │              │              │
                  ▼              ▼              ▼
        XIAOXUE_PYTHON_   smoke.py result  loadPinnedVersion()
        SOURCE --version   actualVersion   assertPythonVersion()
                  │              │
                  └──────┬───────┘
                         ▼
                  版本不一致 → throw
                  actualVersion !== pinned
```

`prepare-python-runtime.ts` 第 16-37 行:

- 读取 `PYTHON_VERSION`, 缺失或格式非 `X.Y.Z` 直接抛错。
- 通过 `python -c "import sys; print('%d.%d.%d' % sys.version_info[:3])"` 取 actual 版本。
- `actualVersion !== pinnedVersion` → 抛错, 不会把不一致的内容写到 `resources/python/`。

`verify-python-runtime.ts` 第 8-23 行 (refactor 后):

- 同样读 `PYTHON_VERSION`。
- smoke 脚本返回 `python` 字段后, 比对 pinned, 不一致抛错。

所有 Python runtime provenance 决策现在通过单一 `python-runtime-spec.ts`
module 暴露 (`loadPinnedPythonVersion` + `assertPythonVersion`), 防止 prepare / verify
出现规则不一致。

---

## 4. Dependency Lock 状态

`packages/desktop/python/requirements-windows.lock` (git tracked, 14 行):

```
python-docx==1.2.0
openpyxl==3.1.5
pandas==3.0.2
pdfplumber==0.11.9
PyMuPDF==1.27.2.2
Pillow==12.2.0
rapidocr==3.9.2
onnxruntime==1.27.0
reportlab==4.5.1
pypdf==6.15.0
statsmodels==0.14.6
PyYAML==6.0.3
xlrd==2.0.2
```

13 个依赖, **全部 `==` 严格 pinned**。

smoke.py 的 MODULES 表与 lock 一一对应 (别名映射 python-docx ↔ docx 等),
没有未固定的依赖。

RC6 不重写 Python dependency manager, 只通过 `PYTHON_VERSION` + lock 文件保证
prepare 可重现。

---

## 5. Integrity 覆盖范围

`generate-resource-integrity.ts` 当前覆盖三个 prefix:

| prefix | 来源 | 排除项 |
| --- | --- | --- |
| `skills` | `.opencode/skills/` (git tracked) | `.DS_Store` / `Thumbs.db` / `desktop.ini` |
| `obsidian-plugin` | `packages/desktop/resources/obsidian-plugin/` | 同上 |
| `python` | `packages/desktop/resources/python/` | `.pyc` / `.pyo` / `__pycache__/` / `xiaoxue-runtime.json` |

`xiaoxue-runtime.json` 整文件排除原因: `createdAt` 字段每次 prepare 用
`new Date().toISOString()` 写入, 必然导致 manifest hash 不稳定。
其他 python 文件 (DLL, site-packages, python.exe, vcruntime140*.dll, pdf_extract.py,
xiaoxue_runtime_check.py) 全部纳入 hash。

manifest 当前统计:

```
total entries: 9629
  skills:           275
  obsidian-plugin:     3
  python:          9351
```

---

## 6. Before / After Manifest

| 维度 | before (`fc92416b00`) | after (`106ad4a8a5`) |
| --- | --- | --- |
| skills entries | 275 | 275 (相同) |
| obsidian-plugin entries | 3 | 3 (相同) |
| python entries | 0 (未覆盖) | 9351 |
| total entries | 278 | 9629 |
| xiaoxue-runtime.json | 不在 manifest | 不在 manifest (排除) |
| `__pycache__/` | 不在 manifest | 不在 manifest (排除) |
| `.pyc` | 不在 manifest | 不在 manifest (排除) |
| stale `skills/tender-document-review/SKILL.md` | hash 不一致 | 已对齐 (SKILL.md 当前内容就是 RC6 approved) |

stale Skill hash 验证:
- committed hash (`fc92416b00`): `cfee689e0a75fecd2a2ec5e18fe684db015a910da3714e5647e9f0bd17e95e06`
- current on-disk SHA256: `a1781d93feca81e674b0db049f58669bb565570fc2f1a444f4ebb6ac5a7e0dd8`
- SKILL.md 最后修改 commit `4b5789ffdd fix(skills): add prompt injection guard to tender-document-review`,
  通过 `git merge-base --is-ancestor 4b5789ffdd fc92416b00` 确认已在 RC6 release prep 内。
- 因此当前 SKILL.md 是 RC6 approved 内容, generated manifest 是正确值。

---

## 7. 两次 generation hash (determinism 验证)

连续两次运行 `bun ./scripts/generate-resource-integrity.ts`:

```
gen-1 SHA256: c3d80ef71d4d26f68c3ac138808e1d61fbe2692aecc3048a90ca69a4646ce7d0
gen-2 SHA256: c3d80ef71d4d26f68c3ac138808e1d61fbe2692aecc3048a90ca69a4646ce7d0
MATCH (deterministic)
```

第三次运行同样输出 `c3d80ef71d4d26f68c3ac138808e1d61fbe2692aecc3048a90ca69a4646ce7d0`。
generator 在显式排除 `xiaoxue-runtime.json` 与 `__pycache__` 后达到 deterministic。

---

## 8. Semantic diff (committed vs generated at fc92416b00)

详见 `docs/release/rc6/evidence/20260822-rc6-resource-audit/diff/integrity-diff.log`,
committed manifest (278 entries) 与第一次 generate (9629 entries) 的语义差异:

- `skills/**`: 1 entry hash stale — `skills/tender-document-review/SKILL.md`
  (原因: RC5 → RC6 之间 git history 已 merge prompt-injection-guard fix, 但
  manifest 没有刷新)
- `skills/**`: 0 entry missing
- `obsidian-plugin/**`: 0 hash change
- `python/**`: 9351 entry missing — generator 之前未覆盖

stale entry 已 commit 进 `106ad4a8a5` 的 integrity.json,
不是 generator 误报。

---

## 9. Tests

### 9.1 `packages/desktop/scripts/python-runtime-spec.test.ts` (新增, 6 tests)

| test | 期望 | 状态 |
| --- | --- | --- |
| `loadPinnedPythonVersion > returns trimmed semver from PYTHON_VERSION` | `"3.14.4"` | pass |
| `loadPinnedPythonVersion > throws when PYTHON_VERSION is missing` | throws "runtime spec missing" | pass |
| `loadPinnedPythonVersion > throws when PYTHON_VERSION is malformed` | throws "malformed" | pass |
| `loadPinnedPythonVersion > throws when PYTHON_VERSION is not strict X.Y.Z` | throws "malformed" | pass |
| `assertPythonVersion > accepts identical version` | no throw | pass |
| `assertPythonVersion > rejects mismatched version` | throws 含实际 / pinned 值 | pass |

### 9.2 `packages/desktop/scripts/integrity-manifest.test.ts` (新增, 6 tests)

| test | 覆盖项 | 状态 |
| --- | --- | --- |
| `passes when every manifest entry matches on-disk bytes` | 多 prefix 验证, skills + python 各自 source root | pass |
| `fails when a Python runtime file is tampered` | python tamper detection | pass |
| `fails when a Python runtime file is missing` | missing runtime file detection | pass |
| `fails when a Skill hash is stale relative to the manifest` | stale hash detection | pass |
| `fails when on-disk file count differs from manifest` | count mismatch detection | pass |
| `rejects malformed manifest` | `isManifest` 拒绝 null / 错版本 / 缺 sha256 | pass |

### 9.3 Existing tests 无 regression

| file | count | 状态 |
| --- | --- | --- |
| `src/main/resource-integrity.test.ts` | 2 | pass |
| `src/main/python-runtime.test.ts` | 2 | pass |

合计新增 12 / 12 pass, 既有 4 / 4 pass。

### 9.4 `release-doc-consistency-test` (上阶段 §8 §9 已加入)

```
PASS: all hard consistency checks satisfied.
```

§9 检查 `install-checklist.ts` 不再包含 `size > N` hard gate, 自然 pass。
§8 stale-path 检查仍然只把"严禁"上下文识别为合法 mention。

---

## 10. install-checklist semantic verification

`scripts/rc6-lifecycle/install-checklist.ts` 中 `checkIntegrity` 完全重写:

```
删除:
  if (stat.size > 40000) { ... }   // size heuristic, 与 integrity 无关

替换为:
  read integrity.json
  JSON.parse
  isManifest(manifest)             // schema: version=1 + files[{path, sha256}]
  for each entry:
    resolve source root by prefix:
      skills           -> .opencode/skills
      obsidian-plugin  -> packages/desktop/resources/obsidian-plugin
      python           -> packages/desktop/resources/python
    existsSync + SHA-256 重新计算 + 比对
```

pre-package 阶段用 source root 验证 (与 generator 同源),
packaged 阶段用 `ResourceIntegrityCore.verify()` 在 `verify-packaged-windows.ts` 中
走 `resources/skills` / `resources/obsidian-plugin` / `resources/python` 路径
(已在 commit 1 一起加 verify("python"))。

运行结果:

```
=== RC6 Lifecycle Install Checklist ===
  ✓ Bun ≥ 1.3: version=1.3.14
  ✗ Git HEAD on rc6-clean-machine-lifecycle: current=rc6-preflight-fix
  ✓ integrity.json semantic match: version=1, 9629 entries, all SHA-256 match
  ✓ 4 核心 RC6 业务 Skill present: all 4 skills OK
  ✓ static-analysis harness present
  ✓ 无 installer 产物
  ✗ xiaoxue_default API key configured
  ✓ Acceptance Matrix document present
Summary: 6 passed / 2 failed
```

- `Git HEAD` 失败: 当前在 `rc6-preflight-fix`, 不是 `rc6-clean-machine-lifecycle`,
  这是 lifecycle 阶段的硬要求, 不是 preflight-fix 的目标。
- `api-key` 失败: API key 由工作站运行时配置, 与 preflight-fix 无关。
- **integrity semantic match 已 PASS, 不再依赖 size heuristic。**

---

## 11. 三个 commits 详细

### 11.1 `24dcfecb95 fix(release): pin desktop python runtime`

```
packages/desktop/python/PYTHON_VERSION                       |   1 +
packages/desktop/scripts/prepare-python-runtime.ts           |  20 +++--
packages/desktop/scripts/python-runtime-spec.ts              |  31 +++++
packages/desktop/scripts/python-runtime-spec.test.ts         |  53 ++++++++
packages/desktop/scripts/verify-python-runtime.ts            |  25 +++--
5 files changed, 113 insertions(+), 2 deletions(-)
```

### 11.2 `8e137e8d1a fix(release): validate packaged resources semantically`

```
docs/release/rc6/PREFLIGHT.md                                            |  ...
docs/release/rc6/evidence/20260822-rc6-resource-audit/...                |  ...
docs/release/rc6/evidence/SANDBOX_DIAGNOSTIC/20260822-rc6-gatea-run01/...|  ...
docs/release/rc6/rc6-preflight-resource-audit-2026-08-22.md              | 301 ++
packages/desktop/scripts/integrity-manifest.test.ts                     |  87 ++
packages/desktop/scripts/verify-packaged-windows.ts                     |   1 +
scripts/rc6-lifecycle/install-checklist.ts                              |  59 +-
scripts/rc6-release/release-doc-consistency-test.ts                     |  ...
11 files changed, 4221 insertions(+), 6 deletions(-)
```

### 11.3 `106ad4a8a5 fix(desktop): refresh rc6 resource integrity`

```
packages/desktop/resources/integrity.json                       | +37413
packages/desktop/scripts/generate-resource-integrity.ts         |  +27/-6
2 files changed, 37432 insertions(+), 7 deletions(-)
```

---

## 12. Final HEAD / git status / remaining blockers

### 12.1 Final HEAD

```
106ad4a8a598a3b31f52f44e89b4dc0a546d88cd  rc6-preflight-fix
fc92416b00ae3e2dc9ca8a95ae58b423dd8292f3  rc6-release-prep (基线)
```

### 12.2 `git status`

`git status -s` 输出为空 — working tree clean。

### 12.3 Remaining blockers (不属本任务)

| blocker | 描述 | 决策来源 |
| --- | --- | --- |
| `[11]` 三包 typecheck | 需要在干净 Windows 工作站跑 `bun typecheck` × 3 | Operator 行为边界, 本任务不进入 |
| `[12]` 三包 `bun test` 全量 | 同上 | Operator 行为边界 |
| `[13]` `install-checklist --strict` | 当前非 8/8, Git HEAD + API key fail | lifecycle 阶段配置, 与 preflight-fix 无关 |
| Gate A 整体判定 | 上述 `[11]-[13]` 必须实际跑 | Operator 范围 |

### 12.4 本次修复完成的 P0 / P1 项

| 旧报告项 | 修复 | commit |
| --- | --- | --- |
| P0 NON_DETERMINISTIC_RUNTIME (Python pin) | `PYTHON_VERSION` + `assertPythonVersion` | commit 1 |
| P0 STALE_INTEGRITY (1 entry stale) | refreshed in commit 3 | commit 3 |
| P1 install-checklist size gate | 删除 + 替换为 semantic verification | commit 2 |
| Skill source canonical root 误指 `packages/desktop/resources/skills/bundled` | 已在 audit 阶段修复 PREFLIGHT §4.2 | commit 2 |

---

## 13. 停止

不进入 `[11]-[25]`, 不调用 Model API, 不 package / sign / tag / merge dev。
等待 Operator 在干净 Windows 工作站上确认 Gate A 的 `[11] [12] [13]` 实际跑通,
再做 GO / NO-GO 决策。

