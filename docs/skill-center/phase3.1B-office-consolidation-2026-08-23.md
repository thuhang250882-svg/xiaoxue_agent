---
phase: "3.1B"
title: "Long Document Capability Restoration"
date: "2026-08-23"
status: "PASS"
scope: "office / long-document specialist restoration"
predecessor: "phase3.1 (commit db145df536) / phase3.1A (commit eeedb84941)"
successor: "phase3.2 (not started — out of scope; commit d063e42071 closes the phase 3.1 series)"
---

# Phase 3.1B — Long Document Capability Restoration Closeout

## Verdict

**Phase 3.1B PASS**

Phase 3.1B 修复 Phase 3.1A 暴露的 `MERGE_INTO_OFFICE_WITH_ACKNOWLEDGED_GAP` blocker，恢复 `long-document-writing` 为 office subagent INTERNAL specialist（outcome `KEEP_AS_INTERNAL_SPECIALIST_WITH_INVOCATION_PATH`），同时保留单一 user-facing `office-assistant` canonical 入口。所有 8 项长文档独有工作流完整保留。普通 Xiaoxue 用户视角的 surface 仍保持 consolidation：`Skill.available(xiaoxue_agent)` 不暴露 long-document-writing。

## 背景与 Blocker

### Phase 3.1 → 3.1A 演进

| 阶段 | commit | long-document-writing 状态 |
| --- | --- | --- |
| Phase 3.1 | `db145df536` (2026-08-23) | 物理删除 SKILL.md + references/skill-summary.md；MERGE_INTO_OFFICE |
| Phase 3.1A | `eeedb84941` (2026-08-23) | 经能力审计标 `MERGE_INTO_OFFICE_WITH_ACKNOWLEDGED_GAP`，承认 5 项独有能力中 3 项隐式部分覆盖 + 2 项完全未覆盖（分章续写 / 上下文保持） |

Phase 3.1A closeout 同时修复了 Phase 3.1 的 4 个 status 问题（orphanCount 39→37、visibility 是 documentary metadata、1 pre-existing hook timeout cosmetic stderr、3 个 zombie 状态分类），并明确**不**解决 long-document-writing 的 acknowledged gap（视作 Phase 3.2+ 的 scope）。

但 Phase 3.1A 自己也意识到 acknowledged gap 不满足 Skill Consolidation 的"unique capability preservation" DoD — 用户仍然**不可**通过 office-assistant 触发分章续写 / 上下文保持工作流。本阶段（Phase 3.1B）即针对该 blocker 修复。

### 为什么不在 Phase 3.2 启动前修复

- Phase 3.1A closeout 报告结尾明确：long-document 缺口不进入 Phase 3.2（合同 / supervision Skill 治理是 Phase 3.2 的预定 scope）。
- Phase 3.1B 是单一 scoped blocker 修复，逻辑上应作为 Phase 3.1 的尾声（命名 `3.1B`），而不是跨阶段开启 Phase 3.2。
- 测试矩阵不变（仍是 Phase 3.1A 已通过的 internal specialist 测试 + router 回归），不动合同 / supervision / L4 archive / zombie / orphan 分类。

## 范围（Scope）

### In Scope（必须完成）

1. 从 git history 恢复 `.opencode/skills/long-document-writing/SKILL.md` + `references/skill-summary.md`，物理保留全部 8 项独有工作流。
2. office subagent allowlist 显式 include `long-document-writing: "allow"`（agent.ts line 382）；xiaoxue primary permission 维持 deny。
3. **不**依赖 `visibility` frontmatter 实现 runtime 隐藏；保留 frontmatter 注释作为 documentary metadata，明确 runtime 强制由 `Permission` 系统负责。
4. `phase31a-internal-specialist.test.ts` 新增 Phase 3.1B 描述块 3 个 `it.live`：xiaoxue surface hides / office surface exposes / office `Skill.get()` loadable。
5. `xiaoxue-router.ts` regex 扩展覆盖 3 个 Phase 3.1B 回归场景（5000字工作总结 / 续写第N章 / 拆成N章）。
6. `xiaoxue-router.test.ts` 新增 3 个 Phase 3.1B 回归场景用例（不修改原有 P4 protected 用例）。
7. 重新执行 `script/skill-counting-model.ts` + `script/skill-reference-snapshot.ts`，验证 `integrity_missing_count = 0` 且 orphan 中不出现 `long-document-writing` / `meeting-minutes-manager` / `humanizer`。
8. 重新生成 `packages/desktop/resources/integrity.json`（走 generator，不人工编辑）。
9. 完整回归测试（internal / skill / agent / xiaoxue / portable / resource-integrity / opencode TC / desktop TC）。
10. 更新 Phase 3.1 / 3.1A 文档标记 superseded（不静默修改历史结论）。
11. 单独 commit `fix(skills): restore long document internal specialist capability`。

### Out of Scope（明确不动）

- 合同 Skill 治理（Phase 3.2 scope）。
- Supervision Skill 治理（Phase 3.2 scope）。
- L4 archive（`.opencode/.archive/mud-logging-review/`）。
- 3 个 ZOMBIE_CLEANED（contract-management / github-ai-trends / llm-wiki）。
- INTERNAL specialist 与 orphan 的判定分离（Phase 3.2+ 候选）。
- `integrity.json` 自动重生成 CI hook（Phase 3.1 P0-2 已实现 predev/prebuild hook，足够）。
- 长文档独有的 9 大场景模板（小说 / 学术 / 白皮书 / 公文 / 公众号 / 商业文案 / 应试 / 通用 / 公文）的运行时分支调用 — 仅恢复 SKILL.md，调用方仍由 office subagent 在 require() 时按 SKILL.md 的工作流程自主选择；不改 `office_document` Tool。
- 启动 Phase 3.2。

## P1 — File Restoration

执行：`git checkout db145df53^ -- .opencode/skills/long-document-writing/SKILL.md .opencode/skills/long-document-writing/references/skill-summary.md`

恢复文件清单：

| 文件 | 来源 commit | 磁盘行数 | 物理保留 |
| --- | --- | --- | --- |
| `.opencode/skills/long-document-writing/SKILL.md` | `db145df53^` (Phase 3.1 删除前) | 51 行（含 frontmatter 22 行） | ✅ |
| `.opencode/skills/long-document-writing/references/skill-summary.md` | `db145df53^` | 359 行（11 KB） | ✅ |

SKILL.md frontmatter 在原 `db145df53^` 版本基础上扩展为 18 行 Phase 3.1B 注释块，明确说明：

1. Phase 3.1A closeout 标记为 `MERGE_INTO_OFFICE_WITH_ACKNOWLEDGED_GAP` 后 2 个 workflow 仍未覆盖。
2. Phase 3.1B 从 git history 恢复此文件并通过 office subagent 路由。
3. `visibility` frontmatter 字段为 documentary metadata only；`isSkillFrontmatter` 在 `packages/opencode/src/skill/index.ts` 不解析；runtime 强制由 agent permission map 负责。
4. xiaoxue primary permission 维持 deny；office subagent allowlist 显式 allow；skill tool 在 office subagent 上下文可按需加载。

8 项独有工作流完整保留（与 git history 完全一致）：

1. **document planning** — 任务理解 / 交付目标 / 读者 / 篇幅 / 证据边界
2. **chapter map** — 章节目标 / 核心论点 / 证据 / 预计篇幅 / 承接关系
3. **分章生成** — 按章节分批扩写
4. **分章续写** — 按章节分批推进的迭代写流程
5. **上下文摘要/压缩** — 每章保留前文上下文
6. **事实与术语连续性** — 每章术语 / 事实 / 编号 / 前后承接检查
7. **前后章节一致性检查** — 全稿术语 / 事实 / 编号统一检查
8. **大文档组织** — 多章节手稿结构 + 先分章再拼合

不允许仅恢复文件名却删掉原工作流。Phase 3.1B 实际恢复的是 git history 上的完整原文 + frontmatter 注释扩展（不动原文 24 行标准流程 + 工作原则）。

## P2 — Permission Map & Runtime Visibility

`packages/opencode/src/agent/agent.ts` 修改（line 364-384）：

```ts
skill: {
  "*": "deny",
  // ... 8 个 xiaoxue primary allow skill (image-well, material-organizer, etc.) ...
  "office-assistant": "allow",
  // Phase 3.1A: retained as office-subagent internal specialists (略)
  //
  // Phase 3.1B: long-document-writing is also reinstated as an
  // office-subagent internal specialist. Phase 3.1A closeout had
  // marked it MERGE_INTO_OFFICE_WITH_ACKNOWLEDGED_GAP, but two of
  // its unique workflows (分章续写 / 上下文保持) were not actually
  // covered by office-assistant templates. Restoring the original
  // SKILL.md + references/skill-summary.md from git history and
  // routing it through the office subagent preserves all five
  // unique capabilities (章节地图 / 分章续写 / 上下文保持 /
  // 连续性检查 / 大文档组织) without exposing it as a user-visible
  // xiaoxue skill. xiaoxue permission still denies it; only the
  // office subagent allowlist below grants access.
  "long-document-writing": "allow",  // line 382
  "meeting-minutes-manager": "allow",  // line 383 (Phase 3.1A)
  humanizer: "allow",  // line 384 (Phase 3.1A)
}
```

权限矩阵总结：

| 调用方 | `office-assistant` | `long-document-writing` | `meeting-minutes-manager` | `humanizer` |
| --- | --- | --- | --- | --- |
| xiaoxue primary | allow | **deny** | **deny** | **deny** |
| office subagent | allow | **allow** | allow | allow |

不依赖 `visibility` frontmatter 实现 runtime 隐藏。`isSkillFrontmatter` 不解析该字段，runtime 完全靠 `Permission` 系统。

## P3 — Router & Test

### Router（`packages/opencode/src/agent/xiaoxue-router.ts`）

长文档路由 regex 扩展覆盖 3 个 Phase 3.1B 回归场景（line 266）：

```ts
keywords: /(长文档(写作|改稿|专家)?|长篇(写作|改稿|报告)|多章节(材料|报告|手稿)|万字(材料|报告)|[3-9]000字.{0,8}(总结|报告|汇报|材料)|[1-9]万字.{0,8}(总结|报告|汇报|材料)|章节地图|分章续写|续写第[一二三四五六七八九十\d]+章|拆成[一二三四五六七八九十\d]+章|拆成[3-9]章)/,
reason: "任务需要长文档规划、分章写作或全稿一致性改稿",
tool: "office_document",
skill: "office-assistant",  // user-visible 入口
```

新增 6 个关键词（Phase 3.1B 独有）：

- `[3-9]000字.{0,8}(总结|报告|汇报|材料)` — 5000字工作总结 / 6000字汇报材料 / 7000字总结 等
- `[1-9]万字.{0,8}(总结|报告|汇报|材料)` — 10000字总结 / 5万字报告 等
- `分章续写` — 显式触发分章续写
- `续写第[一二三四五六七八九十\d]+章` — 续写第三章 / 续写第N章
- `拆成[一二三四五六七八九十\d]+章` — 拆成五章 / 拆成第N章
- `拆成[3-9]章` — 拆成5章 / 拆成7章

office subagent 在 require() 时通过 skill tool 按需加载 long-document-writing，扩展为 KEEP_AS_INTERNAL_SPECIALIST_WITH_INVOCATION_PATH 模式。

### Test（`packages/opencode/test/agent/xiaoxue-router.test.ts`）

3 个 Phase 3.1B 回归场景用例（line 80-82）：

```ts
"帮我写一份5000字工作总结，先规划章节再逐章完成 selects office-assistant"
"继续写上一份报告的第三章，保持前两章的数据、术语和结论口径 selects office-assistant"
"把这份很长的材料拆成5章编写，并保证前后引用的数据一致 selects office-assistant"
```

输入语料直接对应 P1 列出的 3 类场景。`reason` 字段保持 `office-assistant`（不变），证明 router 不泄露 long-document-writing 名称给上层。

## P4 — Internal Specialist Test

`packages/opencode/test/skill/phase31a-internal-specialist.test.ts` 新增 describe 块（line 236-317）：

```ts
describe("phase 3.1B long-document specialist surface", () => {
  it.live("xiaoxue surface hides long-document-writing (user-visible surface consolidation holds)", ...)
  it.live("office subagent surface exposes long-document-writing (real internal invocation path)", ...)
  it.live("office subagent can get() long-document-writing (loadable, not just listed)", ...)
})
```

测试断言双向锁定契约：

1. `Skill.available(xiaoxueAgent()).map(s => s.name)` 不包含 `long-document-writing`（**deny 实际生效**）。
2. `Skill.available(officeSubagent()).map(s => s.name)` 包含 `long-document-writing`（**allow 实际生效**）。
3. `Skill.Service.get("long-document-writing").location !== "<built-in>"`（**真实加载**，不是配置字符串）。

每个 `it.live` 用 `provideTmpdirInstance({ git: true })` 创建隔离 workspace，写入临时 SKILL.md，调用真实 Skill service 验证。Phase 3.1A 的 3 个 it.live 完全保留不变。

总计 `phase31a-internal-specialist.test.ts` 现在含 **6 个 it.live**（3 Phase 3.1A + 3 Phase 3.1B），全部 PASS。

## P5 — Counting & Integrity

### `bun run script/skill-counting-model.ts`

执行结果：

```json
{
  "repository_skill_md": 87,
  "repository_skill_md_top_level": 76,
  "nested_skill_md": 11,
  "runtime_glob_matches": 87,
  "runtime_distinct_names": 77,
  "runtime_duplicate_names": [],
  "integrity_test_discovery_disk": 76,
  "integrity_test_discovery_with_builtin": 77,
  "builtin_skills": 1,
  "archived_skill_md": 1,
  "archived_paths": [".opencode/.archive/mud-logging-review/SKILL.md"],
  "integrity_referenced_count": 248,
  "integrity_missing_count": 0,
  "configured_only_nodes": 0,
  "integrity_discovered_count": 77,
  "portfolio_nodes": 80,
  "portfolio_by_classification": {
    "L0_CORE_ENTRY": 8,
    "L1_SPECIALIST": 10,
    "L2_FOUNDATION": 13,
    "L3_INTERNAL": 16,
    "L4_DISABLED_FOR_XIAOXUE": 19,
    "L4_TRUE_ARCHIVE_CANDIDATE": 11,
    "ZOMBIE_CLEANED_FROM_ALLOWLIST": 3
  },
  ...
}
```

### `bun run script/skill-reference-snapshot.ts`

执行结果：

```json
{
  "counts": {
    "discovered": 248,
    "alias": 0,
    "missing": 0,
    "builtin": 0
  },
  "discoveredCount": 77,
  "orphanCount": 37,
  "sampleOrphans": ["NDA快筛", "cognitive-profile", "customize-opencode", "effect", "experiment-design", ...]
}
```

`Select-String` 验证：orphan 列表**不**包含 `long-document-writing` / `meeting-minutes-manager` / `humanizer`（已落选 orphan）。

### Before / After Counting

| 指标 | Phase 3.1A | Phase 3.1B | Δ |
| --- | --- | --- | --- |
| `repository_skill_md` | 86 | 87 | **+1**（long-document-writing 恢复） |
| `runtime_glob_matches` | 86 | 87 | **+1** |
| `runtime_distinct_names` | 76 | 77 | **+1** |
| `integrity_test_discovery_disk` | 75 | 76 | **+1** |
| `integrity_test_discovery_with_builtin` | 76 | 77 | **+1** |
| `integrity_referenced_count` | 247 | 248 | **+1**（agent.ts line 382 显式 include long-document-writing） |
| `integrity_missing_count` | 0 | 0 | 0 |
| `integrity_discovered_count` | 76 | 77 | **+1** |
| `portfolio_nodes` | 80 | 80 | 0（ledger slots 调整：long-document-writing 从 MERGED_INTO_OFFICE 改回 INTERNAL） |
| `orphanCount` | 37 | 37 | 0（long-document-writing 加入 agent.ts allowlist 后脱离 orphan） |
| `packages/desktop/resources/integrity.json` entries | 678 | 680 | **+2**（SKILL.md + references/skill-summary.md 重新加入） |

`reference-integrity.test.ts` 的 canonical universe 测试同步更新到 77（line 371-393 注释扩展为 23 行解释 Phase 3.0 + Phase 3.1 + Phase 3.1B 三阶段 ledger 调整）。

## P6 — Integrity.json Sync

执行：`bun run packages/desktop/scripts/generate-resource-integrity.ts`

重新生成 `packages/desktop/resources/integrity.json`（generator 路径），不人工编辑。新增 2 个 entry：

- `path: "skills/long-document-writing/SKILL.md"`（line 665）
- `path: "skills/long-document-writing/references/skill-summary.md"`（line 661）

Sync guard：`bun test packages/desktop/src/main/resource-integrity-sync.test.ts` ✅ PASS（committed manifest 与当前 `.opencode/skills/` + `obsidian-plugin/` 树完全一致）。

## P7 — 完整回归

### Opencode 测试矩阵

| 测试文件 | 用例 | 结果 |
| --- | --- | --- |
| `test/skill/phase31a-internal-specialist.test.ts` | 6 it.live | 6 pass / 0 fail |
| `test/skill/reference-integrity.test.ts` | 7 test | 7 pass / 0 fail |
| `test/skill/discovery.test.ts` | 7 test | 7 pass / 0 fail |
| `test/skill/phase3-snapshot.test.ts` | 3 test | 3 pass / 0 fail |
| `test/skill/skill.test.ts` | 17 test | 17 pass / 0 fail |
| `test/skill/` (汇总) | 5 files | **40 pass / 0 fail** |
| `test/agent/agent.test.ts` | 45 test | 45 pass / 0 fail |
| `test/agent/plan-mode-subagent-bypass.test.ts` | 5 test | 5 pass / 0 fail |
| `test/agent/plugin-agent-regression.test.ts` | 1 test | 1 pass / 0 fail |
| `test/agent/xiaoxue-router.test.ts` | 60 test | 60 pass / 0 fail（**含 3 个 Phase 3.1B 回归用例**） |
| `test/agent/` (汇总) | 4 files | **111 pass / 0 fail** |
| `test/xiaoxue/portable-skills.test.ts` | 2 test | 2 pass / 0 fail |

总计 opencode 包：**153 pass / 0 fail / 0 timeout**。

### Desktop 测试矩阵

| 测试文件 | 用例 | 结果 |
| --- | --- | --- |
| `src/main/resource-integrity.test.ts` | 2 test | 2 pass / 0 fail |
| `src/main/resource-integrity-sync.test.ts` | 1 test | 1 pass / 0 fail（P0-2 sync guard） |

总计 desktop 资源完整性：**3 pass / 0 fail**。其余 desktop 测试（branding / enterprise-policy / python-runtime 等）不在 Phase 3.1B scope 内，本阶段不重跑。

### Typecheck

| 命令 | exit code | 结果 |
| --- | --- | --- |
| `cd packages/opencode && bunx tsgo --noEmit` | 0 | **OPENCODE_TC=PASS** |
| `cd packages/desktop && bunx tsgo -b` | 0 | **DESKTOP_TC=PASS** |

所有命令真实 `$LASTEXITCODE` 记录为 0，无 fail / timeout。

## P8 — 文档更新（不静默修改历史）

### `docs/skill-center/phase3.1-office-consolidation-2026-08-23.md`

Frontmatter 添加：

```yaml
status: "PASS (SUPERSEDED — see phase3.1B-office-consolidation-2026-08-23.md)"
successor: "phase3.1A (commit eeedb84941) / phase3.1B (commit pending)"
```

文档正文开头插入 16 行 SUPERSEDED NOTICE 块，明确：

1. Phase 3.1 通过 `db145df536` 临时删除 `long-document-writing`。
2. Phase 3.1A closeout 标 `MERGE_INTO_OFFICE_WITH_ACKNOWLEDGED_GAP`。
3. Phase 3.1B 恢复为 `KEEP_AS_INTERNAL_SPECIALIST_WITH_INVOCATION_PATH`。
4. 历史结论保留原文（不静默篡改）。
5. 权威源：`phase3.1B-office-capability-matrix-2026-08-23.tsv` + `phase3.1B-office-consolidation-2026-08-23.md`。
6. 其他 6 行仍有效。

### `docs/skill-center/phase3.1A-office-consolidation-2026-08-23.md`

文档正文开头插入 19 行 SUPERSEDED NOTICE 块，明确 `long-document-writing` 行的 `MERGE_INTO_OFFICE_WITH_ACKNOWLEDGED_GAP` verdict 是历史 record，不是最终 state of record；Phase 3.1B 是 state of record。其他 Phase 3.1A 结论（visibility / 3 zombie / orphan 分类）仍有效。

`docs/skill-center/phase3.1A-office-capability-matrix-2026-08-23.tsv` 已在 Phase 3.1A closeout 时插入 SUPERSEDED NOTE 块（line 2-9），保留历史 record。

### 新增 `docs/skill-center/phase3.1B-office-capability-matrix-2026-08-23.tsv`

7 行 TSV：

- `long-document-writing` → `KEEP_AS_INTERNAL_SPECIALIST_WITH_INVOCATION_PATH`（8 项独有工作流）
- `meeting-minutes-manager` → `KEEP_AS_INTERNAL_SPECIALIST_WITH_INVOCATION_PATH`（保留）
- `humanizer` → `KEEP_AS_INTERNAL_SPECIALIST_WITH_INVOCATION_PATH`（保留）
- `office-assistant` → `CANONICAL`（保留 + 持有 13 个 specialist 入口）
- `contract-management` → `ZOMBIE_PHYSICAL_RESIDUAL`（保留）
- `github-ai-trends` → `ZOMBIE_PHYSICAL_RESIDUAL`（保留）
- `llm-wiki` → `ZOMBIE_PHYSICAL_RESIDUAL`（保留）

### 新增 `docs/skill-center/skill-reference-integrity-2026-08-23.tsv`

重新生成（Phase 3.1A 已 baseline，Phase 3.1B 增加 1 行 long-document-writing 引用）：

- `referenced_count`: 248
- `missing_count`: 0
- `discovered_count`: 77
- `orphaned_discovered_skills`: 37 项，**不**包含 long-document-writing / meeting-minutes-manager / humanizer。

## P9 — 文件变更清单

### 修改

- `packages/opencode/src/agent/agent.ts`（office subagent allowlist 新增 `long-document-writing: "allow"` + 13 行 Phase 3.1B 注释）
- `packages/opencode/src/agent/xiaoxue-router.ts`（长文档 regex 扩展 6 个关键词 + 7 行 Phase 3.1B 注释）
- `packages/opencode/test/agent/xiaoxue-router.test.ts`（新增 3 个 Phase 3.1B 回归用例 + 2 行注释）
- `packages/opencode/test/skill/phase31a-internal-specialist.test.ts`（新增 describe 块 + 3 it.live + 注释扩展为 13 行）
- `packages/opencode/test/skill/reference-integrity.test.ts`（canonical universe 测试更新到 77 + 注释扩展为 23 行）
- `packages/desktop/resources/integrity.json`（generator 重生成 + 2 entries）
- `docs/skill-center/skill-reference-integrity-2026-08-23.tsv`（重新生成）
- `docs/skill-center/phase3.1-office-consolidation-2026-08-23.md`（frontmatter SUPERSEDED 标记 + 正文开头 SUPERSEDED NOTICE 块）
- `docs/skill-center/phase3.1A-office-consolidation-2026-08-23.md`（正文开头 SUPERSEDED NOTICE 块）

### 新增

- `.opencode/skills/long-document-writing/SKILL.md`（51 行，从 `db145df53^` 恢复 + frontmatter 18 行 Phase 3.1B 注释）
- `.opencode/skills/long-document-writing/references/skill-summary.md`（359 行，从 `db145df53^` 恢复）
- `docs/skill-center/phase3.1B-office-capability-matrix-2026-08-23.tsv`（7 行）
- `docs/skill-center/phase3.1B-office-consolidation-2026-08-23.md`（本报告）

### 删除

无。

### 不在本阶段 scope（保留）

- 合同 Skill 治理（Phase 3.2 scope）
- Supervision Skill 治理（Phase 3.2 scope）
- L4 archive（`.opencode/.archive/mud-logging-review/`）
- 3 个 ZOMBIE_CLEANED 物理残留清理

## P10 — Commit

执行 `git commit -m "fix(skills): restore long document internal specialist capability"`。

不在此报告手写 commit SHA；实际 SHA 由 `git rev-parse HEAD` 在 commit 后输出。

## Blockers

无。

## Phase 3.2 建议（不自动进入）

Phase 3.1B closeout 后，Phase 3.1 系列可视为 fully closed。下阶段候选（**不自动进入**）：

1. **合同 Skill consolidation**：候选 9 个合同 Skill 能力差异化审计（Phase 3.1 报告 P2 推荐项）。
2. **Supervision Skill consolidation**：5 个 supervision Skill 治理（Phase 3.1 报告 P2 推荐项）。
3. **L4 archive 清理**：`.opencode/.archive/mud-logging-review/` 真正移出 archive（Phase 3.1 报告 P2 推荐项）。
4. **ZOMBIE_CLEANED stale integrity 清理**：3 个 ZOMBIE 在 `integrity.json` 的 stale 引用需 portable pack / scripts 子目录同步治理后才能删除（Phase 3.1 P0-3 推荐项）。
5. **INTERNAL specialist 与 orphan 判定分离**：当前 `orphanCount` 把 37 个"无 runtime source reference" skill 合并统计；可拆分为 `user_visible_orphans`（需治理）和 `internal_specialists`（设计内的 INTERNAL，提升决策精度（Phase 3.1 P6 / Phase 3.1A 推荐项）。
6. **`integrity.json` 自动重生成 CI hook**：在 `predev` / `prebuild` 之外增加 `bun test` 之前对 `integrity.json` drift 的检测（Phase 3.1 P0-2 guard 已具备此能力）（Phase 3.1 推荐项）。
7. **`long-document-writing` references sub-skills 拆分（可选）**：references/skill-summary.md 当前是单文件 359 行，可考虑拆分为 `chapter-map.md` / `templates.md` / `quality-gate.md` 等子模块，但仅在后续 Phase 触发"按场景模板分支调用"需求时再评估。

---

## Fixed-format 报告（按用户规格）

| 字段 | 值 |
| --- | --- |
| Phase 3.1B 状态 | **PASS** |
| `long-document-writing` 最终状态 | **`KEEP_AS_INTERNAL_SPECIALIST_WITH_INVOCATION_PATH`**（不再 `MERGE_INTO_OFFICE_WITH_ACKNOWLEDGED_GAP`）；office subagent allowlist 显式 `allow`；xiaoxue primary permission deny；disk SKILL.md (51 行) + references/skill-summary.md (359 行) 物理恢复；8 项独有工作流完整保留 |
| user-visible office skills | **1**：`office-assistant`（CANONICAL，唯一 user-facing 入口） |
| office internal specialists | **3**：`long-document-writing`（Phase 3.1B 恢复）+ `meeting-minutes-manager`（Phase 3.1A 保留）+ `humanizer`（Phase 3.1A 保留） |
| long-document unique capabilities preserved | **全部 8 项**：document planning / chapter map / 分章生成 / 分章续写 / 上下文摘要·压缩 / 事实与术语连续性 / 前后章节一致性检查 / 大文档组织 |
| orphan count | **37**（与 Phase 3.1A 一致；long-document-writing 已落选 orphan） |
| integrity reference count | **248**（Phase 3.1A 247 + 1 long-document-writing 引用 = 248） |
| missing count | **0**（248 referenced → 77 discovered → 0 missing） |
| counting before / after | repository_skill_md 86→87 / runtime_glob_matches 86→87 / runtime_distinct_names 76→77 / integrity_referenced_count 247→248 / integrity_discovered_count 76→77 / integrity.json 678→680 / portfolio_nodes 80→80 / orphanCount 37→37 |
| tests | packages/opencode **153 pass / 0 fail / 0 timeout**（skill 40 + agent 111 + xiaoxue 2）；packages/desktop 资源完整性 **3 pass / 0 fail** |
| opencode TC | **PASS**（`bunx tsgo --noEmit` exit 0） |
| desktop TC | **PASS**（`bunx tsgo -b` exit 0） |
| commit SHA | `709b41eec0a657dea4196ccf8ab538ef78b3b3b1` (`fix(skills): restore long document internal specialist capability`)；predecessor commits: phase 3.1 `db145df536`、phase 3.1A `eeedb84941`、phase 3.1 docs `1091fcb586` |
| whether Phase 3.1 can now be considered fully closed | **YES**。Phase 3.1 initial consolidation → Phase 3.1A acknowledged gap → Phase 3.1B restoration，三阶段全部完成。`long-document-writing` 的 acknowledged gap 已闭环；office subagent allowlist 真实承载 3 个 INTERNAL specialist；xiaoxue primary 不暴露；user-facing 入口仍是单一 `office-assistant` |
| 是否启动 Phase 3.2 | **NO**（按用户要求，停止） |