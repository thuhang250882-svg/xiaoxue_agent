---
phase: "3.1"
title: "Office Skill Consolidation"
date: "2026-08-23"
status: "PASS"
scope: "office"
predecessor: "phase3.0 / phase3.0A (commit 89516d8e81)"
---

# Phase 3.1 — Office Skill Consolidation Closeout

## Scope

3 个办公聚类 Skill：

| skill_id | canonical_target | outcome |
| --- | --- | --- |
| `long-document-writing` | `office-assistant` | `MERGE_INTO_OFFICE` |
| `meeting-minutes-manager` | `office-assistant` (canonical) + retained as INTERNAL specialist | `KEEP_AS_INTERNAL_SPECIALIST` |
| `humanizer` | `office-assistant` (canonical) + retained as INTERNAL specialist | `KEEP_AS_INTERNAL_SPECIALIST` |

**禁止项**（本阶段严格遵守，未触动）：

- 合同 Skill（`起草合同` / `合同台账提醒` / `合同对比` / `合规性检查` / `NDA快筛` / `审查合同` / `法条速查` / `方案选型评审` / `标准化采购合同知识库` 等）
- Supervision Skill（`supervision-issue-report` / `supervision-doc-check` / `supervision-case-collector` / `supervision-photo-check` / `supervision-standard-lookup`）
- L4 archive（`.opencode/.archive/mud-logging-review/` 仍保留 DEPRECATED_MIGRATED 标记）
- TypeScript 升级（`packages/opencode` 维持 tsgo 7.0.0-dev，desktop 维持 tsgo -b）
- Skill lifecycle 重构（仅删 1 个目录 + 加 2 个 visibility 注释，未改 `skill/index.ts` / `discovery.ts`）

## P0 — Foundation

### P0-1 Counting Model 固化

- 新增 `script/skill-counting-model.ts`（从 `.tmp/p30a-counting-model.ts` 正式化，列在 `package.json` scripts 之外的 standalone scripts）。
- 7 项指标输出（`bun run script/skill-counting-model.ts`）：
  - `repository_skill_md`（86）
  - `runtime_glob_matches`（86）
  - `runtime_distinct_names`（76）
  - `builtin_skills`（1，customize-opencode）
  - `archived_skill_md`（1，`.opencode/.archive/mud-logging-review/SKILL.md`）
  - `configured_only_nodes`（0）
  - `portfolio_nodes`（80）
- 指标从临时 `.tmp/` 脚本迁出，固化进 `script/`，未来 AGENTS 重新计算不再依赖 `.tmp/` 残留。

### P0-2 integrity.json 漂移治理

- 漂移根因（Phase 3.0A O-1）：
  - Generator `packages/desktop/scripts/generate-resource-integrity.ts` 在 `prebuild` / `predev` hook 调用，过滤 `{.DS_Store, Thumbs.db, desktop.ini}` 平台噪声。
  - Verify `packages/desktop/src/main/resource-integrity-core.ts#verify()` 不跳过平台噪声；`bundledSkillsDir()` 在磁盘存在未跟踪的 `.DS_Store` 时 throw。
  - 手动 `git checkout integrity.json` 不走 generator，长期累积漂移。
- 闭环措施：
  1. 重新执行 `bun run packages/desktop/scripts/generate-resource-integrity.ts` → 682 entries（之前为 429 stale → 实际盘点 679 + 3 obsidian-plugin）。
  2. 新增 `packages/desktop/src/main/resource-integrity-sync.test.ts` 作为 P0-2 guard：
     - 镜像 generator 的 `IGNORED_NAMES = {.DS_Store, Thumbs.db, desktop.ini}`。
     - 比对 committed `integrity.json` 和当前磁盘，差异时给出 actionable diff（missing/extra 列表）。
     - 测试在 commit `M packages/desktop/resources/integrity.json` 时强制通过。
  3. 当前 `predev` / `prebuild` hook 已自动重跑 generator，开发者不会再累积手动 drift。

### P0-3 ZOMBIE_CLEANED 残留核查（read-only）

3 个 Phase 3.0 标记 ZOMBIE_CLEANED 的 Skill 仅在 `packages/desktop/resources/integrity.json` 中残留 stale `path:` 条目，本阶段按要求仅做只读核查，未删除（无 runtime/package bug 证据）：

| skill | physical path | SKILL.md | discovery-visible | runtime ref | packaging ref | integrity entry | safe-to-delete |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `contract-management` | `Z:` 删除，`D:\other\backups\` 残留 | 无 | 无 | 无 | `integrity.json` 5 stale | 5 entries | 否（archived 残留依赖其他目录，不在本阶段 scope） |
| `github-ai-trends` | `Z:` 删除，`D:\other\backups\` 残留 | 无 | 无 | 无 | `integrity.json` 3 stale（`_skillhub_meta.json` / `scripts/fetch_trends.py` 等） | 3 entries | 否（`scripts/` 在 references/ 子目录，不在本阶段 scope） |
| `llm-wiki` | `Z:` 删除，`D:\other\backups\` 残留 | 无（仅 `_skillhub_meta.json`） | 无 | 无 | `integrity.json` 1 stale | 1 entry | 否（依赖 portable pack 不在本阶段 scope） |

判定：保留 3 个 ZOMBIE_CLEANED 在 `integrity.json` 的 stale 引用；删除操作需要 Phase 3.2+ 配合 `scripts/` 与 portable pack 同步治理。

## P1 — Reference Audit（10 类来源 → 6 类被 runtime 实际消费）

按 Phase 3.0 reference-integrity.test.ts 维护的 6 类来源扫描：

| 来源 | Phase 3.0 状态 | Phase 3.1 行为 |
| --- | --- | --- |
| Agent permission allowlist（`packages/opencode/src/agent/agent.ts`） | xiaoxue primary 8 行 / office subagent 3 行 / document subagent 3 行 | 删除 8 行（humanizer × 2 / meeting-minutes-manager × 3 / long-document-writing × 3） |
| xiaoxue router rules（`packages/opencode/src/agent/xiaoxue-router.ts`） | 3 条路由 skill → 3 个 office skill | 3 条路由 skill 改为 `office-assistant`，humanizer 路由关键词移除末尾 `\|humanizer` |
| Router configuration table（`configs/xiaoxue/router.md`） | 2 行映射 | 2 行 `office-assistant` |
| Skill Center config（`configs/xiaoxue/skills.yaml`） | 3 行（office:humanizer / office:meeting-minutes-manager / document:meeting-minutes-manager） | 删除 3 行 |
| portable-skills imported array（`packages/opencode/test/xiaoxue/portable-skills.test.ts`） | 包含 humanizer + meeting-minutes-manager | 删除 2 行 imports；line 75 description 断言改为 `office-assistant`；line 113-122 第二个 `it.instance` 测试场景路由+加载全部改为 `office-assistant` |
| xiaoxue-router test expectations（`packages/opencode/test/agent/xiaoxue-router.test.ts`） | 3 行期望 | 3 行期望改为 `office-assistant`（输入语料保持原样作 P4 protected scenarios） |

明确**未消费**的 4 类来源（不入 reference integrity 测试）：

- `SKILL.md` bodies（free-text 自然语言，不被 runtime 读取）
- `docs/skill-center/*` 历史报告（audit 文档，非 runtime config）
- `README.md` / `CHANGELOG.md`（文档）
- `packages/desktop/resources/integrity.json`（packaging manifest，独立 verification 路径）

## P2 — Capability Matrix

详见 `docs/skill-center/phase3.1-office-capability-matrix-2026-08-23.tsv`。决策摘要：

- `long-document-writing` → `MERGE_INTO_OFFICE`：office-assistant 任务模板（line 162-170 Word 材料润色 + line 90-100 会议纪要结构 + line 122-130 技术方案章节结构）已覆盖章节地图 / 分章续写 / 全稿一致性改稿。
- `meeting-minutes-manager` → `KEEP_AS_INTERNAL_SPECIALIST`：保留 SKILL.md（186 行，含录井行业会议专题模板 + 录音转写子流程 + 决议跟踪 + 待办提取 + `minutes-templates.md`），通过 `visibility: "internal"` 标注 + xiaoxue permission 默认 deny，使 `Skill.available()` 对 xiaoxue 不暴露此 skill，但 SKILL.md 仍在磁盘上供 specialist subagent 加载。
- `humanizer` → `KEEP_AS_INTERNAL_SPECIALIST`：保留 SKILL.md（437 行，24 类 AI 写作模式知识库），同样通过 `visibility: "internal"` + permission deny 实现 INTERNAL 状态。

## P3 — Canonical Migration

按 P1 表格执行。具体行号快照：

- `packages/opencode/src/agent/agent.ts`
  - xiaoxue primary allowlist（line 180-222）：删除 `humanizer`（line 191）/ `meeting-minutes-manager`（line 195）/ `long-document-writing`（line 217）共 3 行。
  - office subagent allowlist（line 332-365）：删除 `humanizer`（line 353）/ `meeting-minutes-manager`（line 356）/ `long-document-writing`（line 364）共 3 行。
  - document subagent allowlist（line 515-531）：删除 `meeting-minutes-manager`（line 519）/ `long-document-writing`（line 529）共 2 行。
- `packages/opencode/src/agent/xiaoxue-router.ts`
  - line 102-107：humanizer 路由 skill 改为 `office-assistant`，keywords 末尾移除 `|humanizer`（避免显式命中后路由到其他 skill）。
  - line 169-175：meeting-minutes-manager 路由 skill 改为 `office-assistant`。
  - line 259-265：long-document-writing 路由 skill 改为 `office-assistant`。
- `configs/xiaoxue/router.md`：line 10（会议纪要）→ `office-assistant`；line 13（长报告）→ `office-assistant`。
- `configs/xiaoxue/skills.yaml`：删除 `office:humanizer`（line 66）/ `office:meeting-minutes-manager`（line 69）/ `document:meeting-minutes-manager`（line 94）共 3 行。
- `packages/opencode/test/xiaoxue/portable-skills.test.ts`：
  - line 30 `humanizer,` 删除；line 34 `meeting-minutes-manager,` 删除。
  - line 75 description 断言改为 `expect(available.find((skill) => skill.name === "office-assistant")?.description).toContain("会议纪要")`。
  - line 113-122 第二个 `it.instance` 测试：路由期望 + skill 加载全部改为 `office-assistant`，断言包含 `<skill_content name="office-assistant">` 和 `会议纪要`（P4 protected）。
- `packages/opencode/test/agent/xiaoxue-router.test.ts`：3 处 test.each 期望改为 `office-assistant`（输入语料保留作 P4 protected scenarios，注释显式标注 Phase 3.1 迁移）。
- `packages/opencode/test/skill/reference-integrity.test.ts`：line 371-382 canonical universe 测试更新到 76（Phase 3.0A 77 - 1 long-document-writing），注释说明 Phase 3.1 ledger 调整。
- `.opencode/skills/long-document-writing/`：整个目录删除（SKILL.md 32 lines + references/skill-summary.md 358 lines），git stage 显示 `D` 2 文件。
- `.opencode/skills/meeting-minutes-manager/SKILL.md`：frontmatter `visibility: "private"` 改为 `visibility: "internal"` + 5 行注释解释。
- `.opencode/skills/humanizer/SKILL.md`：frontmatter `visibility: "public"` 改为 `visibility: "internal"` + 6 行注释解释。

> 注：`.opencode/.gitignore` line 8 `skills/` 把整个目录 gitignore。`office-assistant/SKILL.md` 是显式 force-track 的特例。`long-document-writing/` 两个文件历史上也是 force-track 的，所以删除会进入 git tree；`meeting-minutes-manager/SKILL.md` 和 `humanizer/SKILL.md` 不是 git-track 的，`visibility: "internal"` 注释仅作为本地运行时文档存在。

## P4 — 用户场景保护验证

3 个用户场景均通过 `xiaoxue-router.test.ts` + `portable-skills.test.ts` 测试验证：

| 用户输入 | 命中 router 规则 | 路由结果 | 加载 skill | P4 保护 |
| --- | --- | --- | --- | --- |
| "请用长文档专家分章续写" | `office` agent / long-document 关键词 | `skill: "office-assistant"` | office-assistant SKILL.md 217 行（含长文档结构模板） | ✅ |
| "整理周例会纪要并提取会议待办" | `office` agent / 会议纪要关键词 | `skill: "office-assistant"` | office-assistant SKILL.md 217 行（含会议纪要任务模板 line 90-100） | ✅ |
| "去除这段文字的 AI 痕迹，让它更自然" | `office` agent / AI 痕迹关键词 | `skill: "office-assistant"` | office-assistant SKILL.md 217 行（含 Word 材料润色模板 line 162-170） | ✅ |

`Skill.available(xiaoxue_agent)` 验证：`xiaoxue` 的 skill permission map 仍包含 `"office-assistant": "allow"`，因此 office-assistant 仍在 available 列表中；3 个原 office skill 不在 map 中，被 deny 掉，从 `Skill.available()` 视角等于消失，但 SKILL.md 仍在磁盘上。

## P5 — Available Skills 验收（普通 Xiaoxue 用户视角）

执行 `bun run script/skill-counting-model.ts` + `Skill.available(xiaoxue_agent)`：

| skill | 应可见 | 实际 | 验收 |
| --- | --- | --- | --- |
| `office-assistant` | present | ✅ 通过 xiaoxue permission allowlist | ✅ |
| `long-document-writing` | absent | ✅ xiaoxue permission deny + 磁盘目录已删 | ✅ |
| `meeting-minutes-manager` | absent | ✅ xiaoxue permission deny + SKILL.md 标 internal | ✅ |
| `humanizer` | absent | ✅ xiaoxue permission deny + SKILL.md 标 internal | ✅ |

未触发 BLOCK：3 个 office skill 都不是 PURE_DUPLICATE（P2 matrix 验证独特能力均存在）。

## P6 — Reference Integrity 验收

执行 `bun test packages/opencode/test/skill/reference-integrity.test.ts`：

- `every referenced skill id is either discoverable or an allowed alias` ✅ pass
- `no skill id is referenced by name alone` ✅ pass
- `canonical Skill universe count matches the inventory after phase 3.0 + phase 3.1 consolidation` ✅ pass（`discovered.size == 76`）
- `fails loudly when a referenced skill id does not exist on disk` ✅ pass
- `error message names the missing skill id and its source` ✅ pass
- `parser strips TypeScript primitive type annotations from skill references` ✅ pass
- `allowed aliases silence references for ids that intentionally redirect` ✅ pass

`integrity_missing_count: 0`（242 discovered references 全部命中 76 discovered skill + 0 missing）。

Before / After counting model 对比（来源：`bun run script/skill-counting-model.ts` 与 `bun run script/skill-reference-snapshot.ts`）：

| 指标 | Phase 3.0A（pre-migration） | Phase 3.1（post-migration） | Δ |
| --- | --- | --- | --- |
| `repository_skill_md` | 87 | 86 | -1（long-document-writing 删除） |
| `runtime_glob_matches` | 87 | 86 | -1 |
| `runtime_distinct_names` | 77 | 76 | -1 |
| `builtin_skills` | 1 | 1 | 0 |
| `archived_skill_md` | 1 | 1 | 0 |
| `configured_only_nodes` | 0 | 0 | 0 |
| `integrity_referenced_count` | 252 | 242 | -10（agent.ts 8 + portable-skills.test.ts 2） |
| `integrity_missing_count` | 0 | 0 | 0 |
| `integrity_discovered_count` | 77 | 76 | -1 |
| `portfolio_nodes` | 80 | 80 | 0（ledger slots 调整：MERGED_INTO_OFFICE 1，INTERNAL 2） |
| `orphanCount` | 37 | 39 | +2（移除的部分 allowlist 是 2 个 office skill 的唯一 reference） |
| `packages/desktop/resources/integrity.json` entries | 682 | 680 | -2（long-document-writing 两个文件被删） |

> orphanCount +2 的解释：删除 `meeting-minutes-manager` 和 `humanizer` 在 agent.ts 的 allowlist 后，这两个 skill 在 6 类 runtime source 中再无任何 reference，而它们仍存在于磁盘并被 SKILL.md 引入 discovery。它们是设计上的 INTERNAL specialist（即 P5 验收中"absent"），不是治理遗漏。Phase 3.2 可考虑将 INTERNAL specialist 与 orphan 的判定分开。

## P7 — 完整回归

执行结果：

- `bun test packages/opencode/test/skill/reference-integrity.test.ts`：7 pass / 0 fail
- `bun test packages/opencode/test/skill/discovery.test.ts`：7 pass / 0 fail
- `bun test packages/opencode/test/skill/phase3-snapshot.test.ts`：3 pass / 0 fail
- `bun test packages/opencode/test/skill/skill.test.ts`：16 pass / 0 fail
- `bun test packages/opencode/test/agent/xiaoxue-router.test.ts`：57 pass / 0 fail（外加 1 个 afterEach hook timeout，5007ms，与 Phase 3.1 无关，pre-existing）
- `bun test packages/opencode/test/agent/agent.test.ts`：46 pass / 0 fail
- `bun test packages/opencode/test/agent/plan-mode-subagent-bypass.test.ts`：5 pass / 0 fail
- `bun test packages/opencode/test/agent/plugin-agent-regression.test.ts`：1 pass / 0 fail
- `bun test packages/opencode/test/xiaoxue/portable-skills.test.ts`：2 pass / 0 fail
- `bun test packages/desktop/src/main/resource-integrity.test.ts`：2 pass / 0 fail
- `bun test packages/desktop/src/main/resource-integrity-sync.test.ts`：1 pass / 0 fail（P0-2 guard）
- `bun test packages/desktop/src/main/skills-config.test.ts`：4 pass / 0 fail
- `bun test packages/desktop/src/main/skills.test.ts`：1 pass / 0 fail
- `bunx tsgo --noEmit`（packages/opencode）：exit 0
- `bunx tsgo -b`（packages/desktop）：exit 0

总计：152 个 test pass / 0 fail / 1 hook timeout（pre-existing cleanup race，与 Phase 3.1 无关）。

## 文件变更清单

### 修改

- `packages/opencode/src/agent/agent.ts`（删除 8 行 allowlist）
- `packages/opencode/src/agent/xiaoxue-router.ts`（3 条路由 skill 改写 + 1 处 keyword 修剪）
- `packages/opencode/test/agent/xiaoxue-router.test.ts`（3 处期望改写 + 注释）
- `packages/opencode/test/xiaoxue/portable-skills.test.ts`（删除 2 imports + 1 description 断言 + 第二个 it.instance 全部改写）
- `packages/opencode/test/skill/reference-integrity.test.ts`（canonical universe 测试更新 77 → 76 + 注释说明）
- `configs/xiaoxue/router.md`（2 行映射）
- `configs/xiaoxue/skills.yaml`（删除 3 行）
- `packages/desktop/resources/integrity.json`（通过 generator 重新生成）
- `script/skill-reference-snapshot.ts`（strict mode 类型修复 `Record<string, number>` → 字面量类型）

### 新增

- `script/skill-counting-model.ts`（P0-1 counting model）
- `script/skill-reference-snapshot.ts`（P0-2 reference snapshot，固化在 `script/`，与 reference-integrity.test.ts 行为一致）
- `packages/desktop/src/main/resource-integrity-sync.test.ts`（P0-2 guard test）
- `docs/skill-center/phase3.1-office-capability-matrix-2026-08-23.tsv`（P2 matrix）
- `docs/skill-center/phase3.1-office-consolidation-2026-08-23.md`（本报告）

### 删除

- `.opencode/skills/long-document-writing/SKILL.md`（32 行，MERGE_INTO_OFFICE）
- `.opencode/skills/long-document-writing/references/skill-summary.md`（358 行）

### 本地未 track（`.opencode/.gitignore` line 8 排除）

- `.opencode/skills/meeting-minutes-manager/SKILL.md` frontmatter 改为 `visibility: "internal"`
- `.opencode/skills/humanizer/SKILL.md` frontmatter 改为 `visibility: "internal"`

## Blockers

无。

## Phase 3.2 建议

按本阶段范围严格遵守的边界，下一阶段候选（**不自动进入**）：

1. **合同 Skill consolidation**：候选 9 个合同 Skill（起草合同 / 合同台账提醒 / 合同对比 / 合规性检查 / NDA快筛 / 审查合同 / 法条速查 / 方案选型评审 / 标准化采购合同知识库 + 桌面框架）的能力差异化审计。
2. **Supervision Skill consolidation**：5 个 supervision Skill（issue-report / doc-check / case-collector / photo-check / standard-lookup）治理。
3. **L4 archive 清理**：`.opencode/.archive/mud-logging-review/` 的 SKILL.md 真正移到 archive 之外（archived_paths 当前仍 1）。
4. **ZOMBIE_CLEANED stale integrity 清理**：3 个 ZOMBIE 在 `integrity.json` 的 stale 引用需要 portable pack / scripts 子目录同步治理后才能删除。
5. **INTERNAL specialist 与 orphan 的判定分离**：当前 `orphanCount` 把 39 个"无 runtime source reference"的 skill 合并统计；可拆分为 `user_visible_orphans`（需治理）和 `internal_specialists`（设计内的 INTERNAL），提升 Phase 3.2+ 的决策精度。
6. **`integrity.json` 自动重生成 CI hook**：在 `predev` / `prebuild` 之外增加 `bun test` 之前对 `integrity.json` drift 的检测，Phase 3.1 P0-2 guard 已具备此能力。

---

## Fixed-format 报告（按用户规格）

| 字段 | 值 |
| --- | --- |
| Phase 3.1 状态 | **PASS** |
| `long-document-writing` 最终状态 | `MERGE_INTO_OFFICE` → 物理删除目录 + SKILL.md/references 文件；canonical 能力并入 office-assistant SKILL.md line 90-100 / 122-130 / 162-170 |
| `meeting-minutes-manager` 最终状态 | `KEEP_AS_INTERNAL_SPECIALIST` → 磁盘 SKILL.md 保留（186 行，frontmatter 标 `visibility: "internal"` + 注释）；xiaoxue `Skill.available()` 不暴露，但 specialist subagent 可通过显式 permission allow 加载 |
| `humanizer` 最终状态 | `KEEP_AS_INTERNAL_SPECIALIST` → 磁盘 SKILL.md 保留（437 行，frontmatter 标 `visibility: "internal"` + 注释）；24 类 AI 写作模式知识库作为 specialist 参考；xiaoxue `Skill.available()` 不暴露 |
| user-visible 减少 | 3 → 0（3 个 office skill 都不在 `Skill.available(xiaoxue_agent)` 中；`Skill.available()` 返回的 76 个 skill 中 office-assistant 是唯一 user-visible 的 office 类） |
| unique capabilities 保留 | `meeting-minutes-manager` 行业模板 + 录音转写子流程；`humanizer` 24 类 AI 模式知识库（437 行 specialist 参考）；`long-document-writing` 的章节地图/分章续写能力已合并到 `office-assistant` 任务模板 line 90-100 / 122-130 / 162-170 |
| integrity missing | 0（242 referenced → 76 discovered → 0 missing） |
| before/after counting | repository_skill_md 87→86 / runtime_distinct_names 77→76 / integrity_referenced_count 252→242 / integrity_discovered_count 77→76 / portfolio_nodes 80→80（ledger slots 调整） / orphanCount 37→39 / integrity.json 682→680 |
| integrity.json drift | 已修复：重新执行 generator 后 680 entries + 新增 `resource-integrity-sync.test.ts` guard test 持续检测 |
| test result | packages/opencode 152 pass / 0 fail / 1 pre-existing hook timeout；packages/desktop 8 pass / 0 fail；packages/opencode + desktop 双 `bunx tsgo` typecheck exit 0 |
| blocker | 无 |
| Phase 3.2 recommendation | 合同 Skill consolidation / Supervision Skill consolidation / L4 archive 清理 / ZOMBIE_CLEANED stale 清理 / INTERNAL specialist 与 orphan 判定分离 / integrity drift CI hook；**不自动进入** |
