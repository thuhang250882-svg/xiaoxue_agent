# 交接文档：opencode-dev 项目 + Phase 4.0 Skill 移除收尾

> **交接时间**：2026-08-24
> **目标读者**：无任何上下文的 AI 编程工具（Cursor / Windsurf / Cline / Claude Code / Codex 等）
> **目标 Skill**：**giiisp-paper-search-apis**（单一 rehearsal 目标，本系列未处理任何其他 Skill）
> **一句话**：本项目叫「录井小雪」（基于 opencode 的企业定制 fork），Phase 4.0 是「把一个不再需要的 Skill 从平台永久移除」的完整闭环，刚刚做完了 release-safe 硬化。

---

## 第〇章：30 秒读懂全部

| 问题 | 答案 |
|---|---|
| 这是什么项目？ | opencode 0.8 RC3 的企业定制 fork，代号「录井小雪」，AI 智能体系统 |
| 这次做了什么？ | 把 `giiisp-paper-search-apis` 这个 Skill 从平台永久移除（被 `deep-research` 取代） |
| 做到哪一步了？ | 完成了 Phase 4.0 / 4.0A / 4.0B / 4.0C 全部四个子阶段，全部 PASS |
| 现在项目干净吗？ | 干净。运行时 `Skill.all()` 从 80 → 79，无 regression |
| 下一步是什么？ | Phase 4.1：移除第二个候选 Skill `sci-employee-deep-research` |
| 接手者下一步？ | 见「第七章：未提交的工作清单」（migration 代码改动待提交） |

---

## 第一章：项目背景（必读，否则后面看不懂）

### 1.1 opencode-dev 是什么

这是 [opencode](https://github.com/sst/opencode) 的 fork，由「录井小雪」团队维护。

- **上游**：opencode（开源 AI 编程 agent）
- **本仓库**：opencode-dev，是企业定制 fork
- **产品名**：录井小雪（XiaoxueAgent）
- **当前阶段**：0.8 RC3（即将发版）
- **默认分支**：`dev`（**不是 `main`**；本地可能没有 `main` ref）

### 1.2 五大核心组件

| 组件 | 路径 | 说明 |
|---|---|---|
| 地质录井报告审核专家 | `packages/opencode/src/agent/` | 审核地质录井报告，YAML 规则引擎 |
| 日常办公助手 | `configs/xiaoxue/` | 工作总结、会议纪要、整改清单 |
| 小雪桌面宠物 | `avatar/xiaoxue_pet/` | WebP 动画，UI 状态反馈 |
| 文档解析引擎 | `document_engine/` | 多格式文档解析、DOCX 导出 |
| 规则引擎系统 | `document_engine/rules/` | YAML 规则动态加载 + 异步执行 |

### 1.3 什么是 Skill（本次操作的对象）

Skill 是 opencode 的核心扩展机制——一个 Skill 就是一个目录，里面有 `SKILL.md`（含 YAML frontmatter 的 Markdown），opencode 启动时扫描所有 Skill 目录并加载。

```
.opencode/skills/<skill-name>/
└── SKILL.md        # frontmatter (name, description) + body
    ├── agents/
    ├── examples/
    ├── scripts/
    └── tests/
```

运行时通过 Effect 编程模型访问：
```typescript
const skills = yield* Skill.Service.all()       // Info[]
const list = yield* Skill.Service.available(agent)  // 按权限过滤
```

**Skill 的特点**：
- 加载时机：lazy（首次访问 Skill.Service 时扫描）
- 来源：`.opencode/skills/`、`.claude/skills/`、`.agents/skills/`、home 目录、cfg.skills.paths/urls
- 持久化：通过 git 跟踪 `SKILL.md`（但本仓库 `.opencode/skills/` 整体被 gitignore，详见第二章）

### 1.4 关键约束

- **测试不能在仓库根目录跑**（guard: `do-not-run-tests-from-root`）→ 必须进包目录（`cd packages/opencode`）
- **类型检查**：`bun typecheck`（从包目录内），禁止直接跑 `tsc`
- **Shell**：Windows PowerShell，用 `;` 作语句分隔符（**不支持 `&&`**）
- **`head` 命令不可用**（PowerShell 缺）
- **路径分隔符**：代码用 `/`（forward slash），PowerShell 用 `\`

---

## 第二章：`.opencode/skills/` 为何被 gitignore（理解 Phase 4.0 关键背景）

**这是 Phase 4.0 全部复杂性的根源，必须理解。**

### 2.1 gitignore 规则

文件 `.opencode/.gitignore` 第 8 行：
```
skills/
```

**意味着**：整个 `.opencode/skills/` 目录在 `dev` 分支上 **从未被 git 跟踪**。

### 2.2 历史背景

- Aug 4, 2026: commit `36257e22bb` 添加了这个 gitignore，消息为 "ignore user-installed .opencode/skills until licenses are reviewed"
- `rc6-*` 分支（如 `rc6-business-skills`）曾经 force-committed 了 `.opencode/skills/` 下的内容，用于 release 打包
- 但 **这些分支从未合并到 `dev`**

### 2.3 对 Phase 4.0 的影响

| 操作 | 在 tracked 目录 | 在 gitignored 目录（本案） |
|---|---|---|
| `git ls-files` | 列出 | **不列出** |
| `git checkout <branch> -- <path>` | 恢复 | **静默失败**（不报错但不创建） |
| `git rm` | 删除 tracked | 报错（not tracked） |
| `Remove-Item -Recurse` | 删 tracked 但 git 不感知 | **唯一可行方式** |
| `git revert <commit>` | 回滚 tracked change | **不恢复** gitignored 文件 |
| `git show <branch>:<path>` | 提取 raw content | **正常**（绕过 gitignore） |

**关键后果**：要让其他 workspace 也能清理掉这个目录，**不能依赖 Git**，必须用程序化机制（这就是 Phase 4.0C 的存在原因）。

---

## 第三章：Phase 4.0 是什么、为什么做

### 3.1 业务背景

`giiisp-paper-search-apis` 是一个早期开发的 Skill，封装 giiisp.com 的论文搜索 API。但：
- 上游 giiisp.com 服务质量不稳定
- 已有替代品 `deep-research`（功能 NEAR_COMPLETE 重叠）
- 没有任何 production consumer（Phase 4.0 P1 dependency audit 已验证 0 consumer）
- 占用 11 个文件 + 1 个 SKILL.md 槽位
- 决策：**REMOVE_WITH_APPROVAL**（Phase 3.5F decision pack）

### 3.2 Phase 4.0 的演进（四个子阶段）

```
Phase 4.0  ─→  4.0A  ─→  4.0B  ─→  4.0C
临时删除     持久删除   首次自动     release-safe
Remove-Item  双向回滚    删除机制     硬化
验证         验证        实现         框架
                                  ↑
                              当前状态
```

| 子阶段 | 解决什么 | 关键产物 |
|---|---|---|
| **4.0**（08-23） | 能否安全删除？ | Remove-Item + 测试套件验证 + integrity.json 重生成 |
| **4.0A**（08-23） | 删除后能否回滚？ | 双向 rollback 验证（removed → restored → removed） |
| **4.0B**（08-23） | 其他 workspace 怎么自动清理？ | `deprecated.ts` name-based list + `rmSync` |
| **4.0C**（08-24） | 删除安全性 + 可恢复性？ | fingerprint-verified migration framework |

### 3.3 每个子阶段的 Gate 通过条件

每个子阶段都有 P0-P9 或 P0-P10 个 gate，缺一不可。完整 gate 列表见 `docs/skill-center/phase4.0-single-skill-removal-rehearsal-2026-08-23.md`。

---

## 第四章：当前状态（接手者先看这里）

### 4.1 运行时计数（**三个指标独立，禁止混用**）

| 指标 | Pre | Post | 含义 |
|---|---|---|---|
| `Skill.all()`（Effect API） | 80 | **79** | 所有 configDirs + externalDirs + cfg.skills.paths |
| `Skill.available(explore)` | 80 | **79** | 经 explore agent 权限过滤 |
| `Skill.available(xiaoxue)` | 38 | 38 | 小雪白名单（giiisp 从未在白名单） |
| `reference-integrity discovered.size` | 77 | **76** | `.opencode/skills/*/SKILL.md` + 1 builtin |
| 物理 SKILL.md 数 | 87 | **86** | filesystem 直接计数 |
| `integrity.json` giiisp 条目 | 11 | **0** | 资源完整性 manifest |

差值解释：`Skill.all()` 79 - `discovered.size` 76 = 3 个 Skill 来自外部目录（`.claude/`、`.agents/`）或 cfg.skills.paths。

### 4.2 文件系统状态

| 路径 | 状态 |
|---|---|
| `.opencode/skills/giiisp-paper-search-apis/` | **不存在**（已迁移） |
| `.opencode/skills/.migration-backup/` | **不存在**（当前 workspace 未触发 migration，因为 target 已被先一步 Remove-Item） |
| `packages/desktop/resources/integrity.json` | 已更新（11 → 0 条目） |

### 4.3 Git 状态

- `dev` 分支：giiisp 目录从未 tracked，无删除 commit
- `integrity.json` 变更（tracked）：11 条目删除
- **Phase 4.0C 代码改动未提交**（见第七章）

### 4.4 验证命令（接手者跑这些就能复现）

```powershell
# 1. 确认目标目录不存在
Test-Path .opencode/skills/giiisp-paper-search-apis
# 应输出: False

# 2. 确认 migration framework 已创建
Test-Path packages/opencode/src/skill/migration/engine.ts
# 应输出: True

# 3. 跑全部 skill 测试
cd packages/opencode
bun test test/skill/
# 应输出: 18+7+4+16+7 pass, 0 fail

# 4. 跑 agent 测试
bun test test/agent/
# 应输出: 137 pass, 2 pre-existing timeout

# 5. 跑 resource integrity
cd ../desktop
bun test src/main/resource-integrity-sync.test.ts
# 应输出: 1 pass

# 6. 跑 typecheck
cd ../opencode
bun typecheck
# 应输出: 4 pre-existing TS2344 errors（审计脚本，无关）

# 7. 验证 runtime Skill count
bun -e "
import('./src/skill').then(m => {
  const skills = m.Skill
  console.log('Module loaded:', Object.keys(skills))
})
"
# 实际跑需 Effect runtime，正常通过 18 个测试即可验证
```

---

## 第五章：Phase 4.0C Migration Framework 架构

### 5.1 文件清单

```
packages/opencode/src/skill/migration/
├── index.ts        # barrel export
├── types.ts        # MigrationEntry, MigrationState, DirectoryClassification
├── registry.ts     # canonical registry（11 文件 SHA-256 manifest）
├── fingerprint.ts  # computeFingerprint, classifyTarget, fingerprintsMatch
├── state.ts        # .migration-state.json 持久化
└── engine.ts       # runPending, runOne, rollback, preview
```

### 5.2 执行时序

```
用户启动 opencode
  ↓
bootstrap.run()                          [packages/opencode/src/project/bootstrap.ts]
  ├─ config.get()                        加载 opencode.json 配置
  ├─ plugin.init()                       初始化插件
  ├─ SkillMigration.runPending()    ←── 显式 migration 边界（新）
  │    └─ 对每个 configDir, 对每个 registered migration:
  │       ├─ 跳过已 terminal state
  │       ├─ classifyTarget()  → 4 种分类
  │       └─ EXACT_KNOWN → renameSync 到 .migration-backup/
  │         MODIFIED/UNKNOWN → 跳过并警告
  └─ [lsp, shareNext, format, vcs, snapshot, project].init()

discoverSkills()                         [packages/opencode/src/skill/index.ts]
  └─ 纯 read/discovery，无 destructive side effect
     扫描 configDirs + externalDirs + cfg.skills.paths + cfg.skills.urls
```

### 5.3 Fingerprint 分类逻辑

```typescript
function classifyTarget(targetPath, expectedFingerprint): DirectoryClassification {
  if (!existsSync(targetPath)) return "ABSENT"
  if (fingerprintMatch(actual, expected)) return "EXACT_KNOWN_LEGACY_ASSET"
  if (hasOverlap(actual, expected))     return "MODIFIED_LEGACY_ASSET"
  return "UNKNOWN_SAME_NAME_ASSET"
}
```

| 分类 | 触发条件 | Migration 行为 |
|---|---|---|
| `ABSENT` | 目录不存在 | 标记 completed，no-op |
| `EXACT_KNOWN_LEGACY_ASSET` | SHA-256 完全匹配 | renameSync 到 `.migration-backup/` |
| `MODIFIED_LEGACY_ASSET` | 有重叠文件但 hash 不同 | **跳过，保留用户数据** |
| `UNKNOWN_SAME_NAME_ASSET` | 无文件重叠 | **跳过，保留用户数据** |

### 5.4 状态机

```
pending ─→ completed          (ABSENT 或 EXACT_KNOWN_LEGACY_ASSET)
pending ─→ skipped_modified   (MODIFIED_LEGACY_ASSET)
pending ─→ skipped_unknown    (UNKNOWN_SAME_NAME_ASSET)
completed ─→ rolled_back      (via rollback())
```

Terminal states（`completed`、`skipped_modified`、`skipped_unknown`）阻止重复执行。

状态文件位置：`<configDir>/.migration-state.json`

---

## 第六章：Release Rollback 操作手册

### 6.1 程序化回滚（推荐，用于 release）

```typescript
import { SkillMigration } from "@opencode-ai/skill/migration"

const result = SkillMigration.rollback(
  configDir,
  "rm-giiisp-paper-search-apis-2026-08-23"
)
// result.status === "rolled_back"
```

要求：
- State.status === `completed`
- backupPath 存在
- target path 不存在

执行后：
1. 从 `.migration-backup/<id>/<skill>/` 复制到 `.opencode/skills/<skill>/`
2. 重新计算 fingerprint 并对比 expected
3. State 更新为 `rolled_back`
4. 返回 `rolled_back`（或 `MODIFIED_LEGACY_ASSET` 如果 fingerprint 不匹配）

### 6.2 Git Disaster Recovery（仅限开发者手动）

当 framework 代码也被 revert 时，需要从 git 历史恢复资产。

```powershell
bun -e "
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const files = [
  'SKILL.md','ACCEPTANCE.md','agents/openai.yaml',
  'examples/end_to_end_example.json','examples/failure_response_examples.json',
  'examples/normalized_result_example.json','examples/request_matrix.json',
  'scripts/dry_run_paper_search.py','scripts/progressive_paper_search.py',
  'tests/test_dry_run_paper_search.py','tests/test_progressive_paper_search.py'
];
const base = '.opencode/skills/giiisp-paper-search-apis';
for (const f of files) {
  const dir = path.dirname(path.join(base, f));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(base, f), execSync('git show rc6-business-skills:' + base + '/' + f));
}
console.log('Restored', files.length, 'files');
"
```

然后重新生成完整性 manifest：
```powershell
bun packages/desktop/scripts/generate-resource-integrity.ts
```

**为什么不用 `git checkout`**：因为 `.opencode/skills/` 被 gitignore，`git checkout` 会静默失败不创建文件。必须用 `git show` + Buffer 提取绕过 gitignore。

### 6.3 完整 Code Rollback

```bash
git revert <commit-of-migration-module>
```

仅回退 `migration/*.ts` + `bootstrap.ts` 变更。**不**自动恢复 gitignored asset 文件——必须配合 6.1 或 6.2。

---

## 第七章：未提交的工作（接手者第一件事）

以下文件已修改但 **未提交**。接手者第一步：审查 → 提交。

### 7.1 文件清单

| 文件 | 操作 | 重要程度 |
|---|---|---|
| `packages/opencode/src/skill/migration/index.ts` | 新增 | Critical |
| `packages/opencode/src/skill/migration/types.ts` | 新增 | Critical |
| `packages/opencode/src/skill/migration/registry.ts` | 新增 | Critical（SHA-256 manifest） |
| `packages/opencode/src/skill/migration/fingerprint.ts` | 新增 | Critical |
| `packages/opencode/src/skill/migration/state.ts` | 新增 | Critical |
| `packages/opencode/src/skill/migration/engine.ts` | 新增 | Critical |
| `packages/opencode/src/skill/index.ts` | 修改（移除 deprecated.ts 引用） | Critical |
| `packages/opencode/src/project/bootstrap.ts` | 修改（添加 SkillMigration.runPending 调用） | Critical |
| `packages/opencode/src/skill/deprecated.ts` | **删除** | Critical |
| `packages/opencode/test/skill/skill-migration.test.ts` | 新增（18 tests） | Critical |
| `packages/opencode/test/skill/deprecated-skill-migration.test.ts` | **删除** | Critical |
| `docs/skill-center/phase4.0C-release-safe-skill-migration-2026-08-24.md` | 新增 | Important |
| `docs/skill-center/phase4.0-removal-registry-2026-08-23.tsv` | 修改（migration_id 更新） | Important |
| `docs/skill-center/phase4.0-single-skill-removal-rehearsal-2026-08-23.md` | 修改（添加 Phase 4.0C 状态） | Important |
| `docs/skill-center/phase4.0-handoff-2026-08-24.md` | 新增（本文档） | Important |

### 7.2 推荐 commit message

```
chore(skills): release-safe migration hardening for approved removals

Phase 4.0C — Replace deprecated.ts with fingerprint-verified
migration framework. Single rehearsal target: giiisp-paper-search-apis.
Backed by .migration-state.json run-once state machine, SHA-256
fingerprint classification, and programmatic rollback.
```

**提交策略建议**：
- 单个 commit 即可（所有文件强耦合）
- 分支名：`migration-hardening`（≤3 个词，连字符）
- 不要混进其他改动

---

## 第八章：Phase 4.1 起步要点

### 8.1 候选 Skill

`sci-employee-deep-research`（Phase 3.5F 第二个 REMOVE_WITH_APPROVAL 候选）。

### 8.2 起步步骤

1. **从历史分支提取 SHA-256 manifest**：
   ```powershell
   bun -e "
   const { execSync } = require('child_process');
   const crypto = require('crypto');
   // 找到含目标 skill 的 rc6 分支
   const files = execSync('git ls-tree -r rc6-XXX -- .opencode/skills/sci-employee-deep-research').toString().split('\n');
   for (const line of files) {
     const m = line.match(/^[^\\s]+\\s+blob\\s+([a-f0-9]+)\\s+(.+)$/);
     if (!m) continue;
     const content = execSync('git show ' + m[1]);
     console.log(m[2].split('/').slice(4).join('/'), crypto.createHash('sha256').update(content).digest('hex'));
   }
   "
   ```

2. **在 `registry.ts` 添加新条目**（参考 `rm-giiisp-paper-search-apis-2026-08-23` 结构）

3. **在 `phase4.0-removal-registry-*.tsv` 添加新行**

4. **写一篇独立的 `phase4.1-single-skill-removal-rehearsal-YYYY-MM-DD.md`**

### 8.3 不得做的事

- ❌ 不得修改 migration framework 核心代码（除非发现 framework 缺陷）
- ❌ 不得修改 Phase 4.0 的已注册条目
- ❌ 不得删除其他 Skill（除非 Phase 3.5F 明确批准）

---

## 第九章：Phase 4.0C Gate 结果

```
migration outside discovery    = YES (bootstrap.run → SkillMigration.runPending)
delete-by-name only            = NO (SHA-256 fingerprint-verified)
modified user asset protected  = YES
unknown same-name asset protected = YES
release rollback without Git   = YES (SkillMigration.rollback())
run-once state                 = YES
runtime diff exactly one target = YES (Skill.all: 80→79)
resource integrity             = PASS
reference missing              = 0
tests                          = PASS (190 pass, 2 pre-existing timeout)
Can Phase 4.1 start?           = YES
```

---

## 第十章：测试覆盖详情

### 10.1 测试统计

| Suite | Test Count | Status |
|---|---|---|
| `test/skill/skill-migration.test.ts`（新增） | 18 | 18 pass / 0 fail |
| `test/skill/reference-integrity.test.ts` | 7 | 7 pass / 0 fail |
| `test/skill/phase3.5C-runtime-api-direct.test.ts` | 4 | 4 pass / 0 fail |
| `test/skill/skill.test.ts` | 16 | 16 pass / 0 fail |
| `test/skill/discovery.test.ts` | 7 | 7 pass / 0 fail |
| `test/agent/` | 139 | 137 pass / 2 pre-existing timeout |
| `packages/desktop resource-integrity-sync` | 1 | 1 pass / 0 fail |
| `bun typecheck` | — | 4 pre-existing TS2344（audit script，无关） |

**Total**: 190 pass / 2 pre-existing timeout / 4 pre-existing TS2344

### 10.2 Migration tests 覆盖（18 个）

| # | 测试 | 验证什么 |
|---|---|---|
| 1 | fresh install / target absent → completed (no-op) | 不存在的目录被识别为 ABSENT |
| 2 | exact legacy asset → completed with backup | 完整 fingerprint 匹配才执行删除 |
| 3 | idempotent — run #1, #2, #3 all stable | 重复运行不破坏状态 |
| 4 | does not delete sibling skill | 同级 Skill 不受影响 |
| 5 | modified legacy asset → skipped_modified | 修改过的资产被保护 |
| 6 | unknown same-name directory → skipped_unknown | 同名但内容不同的目录被保护 |
| 7 | backup directory not discoverable by skill scan | 备份位置不在 skills/ 扫描范围 |
| 8 | rollback restores exact bytes | rollback 后字节级一致 |
| 9 | path safety — only processes target under configDir/skills | 路径安全 |
| 10 | registry non-empty contains expected migration | registry 校验 |
| 11 | preview does not modify state | preview 不影响状态 |
| 12-18 | fingerprint utility tests | 工具函数单元测试 |

### 10.3 已知 pre-existing 问题（与本阶段无关）

- `test/skill/skill.test.ts` Windows SQLite WAL EFAULT（named hook timeout）—— 已知，与本阶段无关
- `script/phase3.5C-1-identity-and-archive-gate.ts` 4× TS2344 —— 审计脚本中的泛型约束问题，与本阶段无关

---

## 第十一章：术语表

| 术语 | 含义 |
|---|---|
| **Skill** | opencode 扩展机制，一个目录含 SKILL.md |
| **`Skill.all()`** | 运行时 API，返回所有可发现 Skill |
| **`Skill.available(agent)`** | 按 agent 权限过滤后的 Skill 列表 |
| **fingerprint** | 目录所有文件的 SHA-256 哈希清单 |
| **ABSENT** | 目录不存在 |
| **EXACT_KNOWN_LEGACY_ASSET** | fingerprint 与 registry 完全匹配 |
| **MODIFIED_LEGACY_ASSET** | 有重叠文件但 hash 不同（用户改过） |
| **UNKNOWN_SAME_NAME_ASSET** | 同名但内容完全不同（可能是用户新建） |
| **migration_id** | 唯一标识一次迁移，如 `rm-xxx-2026-08-23` |
| **configDir** | `.opencode/` 目录，由 `config.directories()` 返回 |
| **rc6-business-skills** | 历史分支，曾 force-committed giiisp-paper-search-apis |
| **integrity.json** | `packages/desktop/resources/integrity.json`，资源完整性 manifest |
| **PLATFORM_REMOVED_WITH_APPROVAL** | Lifecycle 终态：经批准的平台级移除 |
| **bootstrap.run()** | 应用启动入口，在 config/plugin init 后、并行 service init 前 |

---

## 第十二章：常见坑（必须避免）

### 12.1 git 相关

- ❌ `git checkout <branch> -- .opencode/skills/xxx` → 静默失败（gitignore）
- ✅ 用 `git show <branch>:path` + `execSync` Buffer 提取
- ❌ `git revert` 期望恢复 gitignored asset → 不会恢复
- ✅ 配合 `SkillMigration.rollback()` 或 bun -e 提取

### 12.2 测试相关

- ❌ 在仓库根目录跑 `bun test` → 被 `do-not-run-tests-from-root` guard 阻止
- ✅ 必须 `cd packages/opencode` 或 `cd packages/desktop`
- ❌ 直接跑 `tsc` → 不被支持
- ✅ 用 `bun typecheck`（在包目录内）

### 12.3 Skill 删除相关

- ❌ 仅用目录名判断 → 可能误删用户改过的资产
- ✅ 必须用 SHA-256 manifest 校验
- ❌ 用 `rmSync` 直接删除 → 不可恢复
- ✅ 用 `renameSync` 到 `.migration-backup/`
- ❌ 删除整个 `skills/` 目录 → 灾难
- ✅ 只删除 fingerprint 完全匹配 registry 的目录

### 12.4 计数语义

- ❌ 把 `Skill.all()` 和 `reference-integrity discovered.size` 当成同一个东西
- ✅ 它们是不同口径，独立报告

### 12.5 PowerShell 兼容性

- ❌ `cmd1 && cmd2` → 语法错误
- ✅ `cmd1; cmd2`
- ❌ `head -n 5` → 命令不存在
- ✅ `Select-Object -First 5`
- ❌ 路径中含空格直接传 → 解析错误
- ✅ 用 `"path with spaces"` 或 `& {command} args`

---

## 第十三章：完整文档清单

### 13.1 Phase 4.0 主报告（含 4.0/4.0A/4.0B/4.0C 所有 gate）

- [docs/skill-center/phase4.0-single-skill-removal-rehearsal-2026-08-23.md](../skill-center/phase4.0-single-skill-removal-rehearsal-2026-08-23.md) — 完整 P0-P10 报告
- [docs/skill-center/phase4.0C-release-safe-skill-migration-2026-08-24.md](../skill-center/phase4.0C-release-safe-skill-migration-2026-08-24.md) — 4.0C 详细报告

### 13.2 运行时快照

- [docs/skill-center/phase4.0-runtime-snapshot-pre-migration2026-08-23.json](../skill-center/phase4.0-runtime-snapshot-pre-migration2026-08-23.json) — Pre-migration 运行时快照
- [docs/skill-center/phase4.0-runtime-snapshot-post-migration2026-08-23.json](../skill-center/phase4.0-runtime-snapshot-post-migration2026-08-23.json) — Post-migration 运行时快照

### 13.3 Registry & Decision Pack

- [docs/skill-center/phase4.0-removal-registry-2026-08-23.tsv](../skill-center/phase4.0-removal-registry-2026-08-23.tsv) — Canonical removal registry
- [docs/skill-center/phase3.5F-decision-pack.md](../skill-center/phase3.5F-decision-pack.md) — REMOVE_WITH_APPROVAL 决策依据

### 13.4 项目级上下文（接手时先读）

- [AGENTS.md](../../AGENTS.md) — Agent 工作规范
- [README.md](../../README.md) — 项目主说明
- [.codex/HANDOFF.md](../../.codex/HANDOFF.md) — 0.8 RC3 项目级 handoff（含整体上下文）
- [CONTEXT.md](../../CONTEXT.md) — 项目背景补充

---

## 第十四章：最终总结

### 14.1 现状

- ✅ **目标 Skill 已永久移除**：giiisp-paper-search-apis 不在 `Skill.all()` 中
- ✅ **Framework 已 release-safe**：fingerprint 校验 + 备份回滚 + 状态机 + run-once
- ✅ **测试全绿**：190 pass，2 pre-existing timeout（无关）
- ⚠️ **代码改动未提交**：13 个文件待提交（见第七章）

### 14.2 接手者第一步（按优先级）

1. **审查** 第七章的未提交改动
2. **验证** 第四章的验证命令全部通过
3. **提交** 第七章推荐 commit message
4. **下一步** 第八章 Phase 4.1（添加新 registry 条目，不改 framework）

### 14.3 一句话

**Phase 4.0 全系列 PASS**：giiisp-paper-search-apis 已 release-safe 移除，`Skill.all()` 80 → 79，无 regression；migration framework 已硬化（fingerprint 校验、备份回滚、状态机、run-once），13 个文件改动待提交。接手后从 Phase 4.1 开始，重点是扩展 registry 条目而非修改 framework 本身。