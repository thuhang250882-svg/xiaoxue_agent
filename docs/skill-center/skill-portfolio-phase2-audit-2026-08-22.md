# 录井小雪 Skill Portfolio — Phase 2 Classification & Dependency Audit（2026-08-22）

> 本报告在 Phase 1 资产盘点基础上，对全部 77 个 Skill 做 **5 级分类 + 依赖审计**，
> **本阶段不删除、不重命名、不合并、不归档任何 Skill**。
> 唯一执行的代码修改：清理 `packages/opencode/src/agent/agent.ts` 中
> `contract-management` 僵尸 allowlist 项（xiaoxue 主 Agent + contract 子 Agent）。
> 配套数据：
> - [skill-dependency-matrix-2026-08-22.tsv](skill-dependency-matrix-2026-08-22.tsv)（79 行 × 13 列）
> - [skill-dependency-graph-2026-08-22.md](skill-dependency-graph-2026-08-22.md)（Mermaid 依赖图）

## 0. 执行摘要

| 项 | 数量 | 备注 |
| --- | --- | --- |
| 5 级分类总计 | 79（含 2 个 ZOMBIE / 12 个 FOUNDATION） | 较 Phase 1 的 77 多 2 个 ZOMBIE 占位 |
| L0_CORE_ENTRY 用户直接入口 | 5 | 用户真正高频入口 |
| L1_SPECIALIST 专业常用 | 12 | 保留但专业模式 |
| L3_INTERNAL 合并候选 | 16 | 合并到 L0 / L1 |
| L4_ARCHIVE_CANDIDATE 归档候选 | 32 | 业务无关 / 开发者 / 科研 / IT 信息化 |
| FOUNDATION 底座 | 12 | 不对用户直接展示 |
| ZOMBIE 僵尸 | 2 | `contract-management`（已清理 allowlist）/ `llm-wiki`（仍残留） |
| **本阶段代码改动** | **−2 行** | `agent.ts:185` + `agent.ts:445` |
| **测试改动** | 0 | 删 allowlist 后 `portable-skills.test.ts:80` 必然失败 |
| **归档候选实际搬迁** | 0 | 仅建议，不执行 |
| **合并实际执行** | 0 | 仅建议，不执行 |

---

## 1. 5 级分类（Phase 2 全量）

### 1.1 L0_CORE_ENTRY（5 个）— 用户直接入口

| Skill | 角色 | 引用关系（allowlist + router + skill-to-skill） |
| --- | --- | --- |
| `office-assistant` | 日常办公主入口（工作总结/汇报/纪要/整改/计划/方案/项目申报/材料润色/Excel） | xiaoxue/office/document/knowledge Agent allow；`router.md:9`、`router.ts:296,321`、`skills.yaml:10`；显式覆盖 `long-document-writing` / `meeting-minutes-manager` / `humanizer` / `合同台账提醒` / `谈判备忘整理` |
| `geolog-logging-review` | 地质录井报告审核（中文事实证据化版本） | xiaoxue/report Agent allow；`router.md:7,8`、`router.ts:122,254,259`、`skills.yaml:5,47`；canonical of `mud-logging-review` |
| `geology-knowledge` | 企业知识查询（标准/制度/模板/案例/专家经验） | xiaoxue/knowledge/report Agent allow；`router.md:20`、`router.ts:281,288`、`skills.yaml:25,60`；知识蒸馏入口 |
| `tender-document-review` | 标书审核 | xiaoxue/tender Agent allow；`router.md:15`、`router.ts:262`、`skills.yaml:15`；与 `tender-bid-generation` 互补 |
| `审查合同` | 合同审核（石油行业 8 类合同专属 + HSE 专项） | xiaoxue/contract Agent allow；`router.md:17`、`router.ts:269`、`skills.yaml:20`；最大 skill-to-skill 网络（6 个内部关联） |

### 1.2 L1_SPECIALIST（12 个）— 核心业务下面的专业子能力

| Skill | 隶属业务 | 当前允许 Agent | 状态 |
| --- | --- | --- | --- |
| `mud-logging-report-generation` | 报告生成 | xiaoxue/document | KEEP_OPTIONAL |
| `tender-bid-generation` | 标书生成 | xiaoxue | KEEP_OPTIONAL |
| `tender-management` | 标书（招标方视角） | xiaoxue/tender | KEEP_OPTIONAL |
| `tencent-esign-contract` | 合同外部服务（腾讯电子签） | xiaoxue/contract | KEEP_OPTIONAL |
| `material-organizer` | 资料整理 | xiaoxue/office/document/knowledge | KEEP_OPTIONAL |
| `起草合同` | 合同起草 | **DENY**（仅合同分支） | **KEEP_OPTIONAL（建议启用）** |
| `knowledge-distill` | 知识生产 | **DENY（所有 Agent）** | **KEEP_OPTIONAL（待启用）** — 见 §4 单独分析 |
| `llm-wiki-knowledge` | Wiki 管理 | xiaoxue/knowledge | KEEP_OPTIONAL |
| `document-review-tracked` | 留痕审稿 | xiaoxue/report/contract/document | KEEP_OPTIONAL |
| `well-control-risk-assessment` | 井控风险（FUTURE_PRODUCT_PHASE） | DENY | KEEP_OPTIONAL（FUTURE） |
| `aihot` | AI 资讯 | xiaoxue/knowledge | KEEP_OPTIONAL |
| `deep-research` | 深度研究 | xiaoxue/knowledge | KEEP_OPTIONAL |
| `tencent-meeting-skill` | 腾讯会议 | xiaoxue/office | KEEP_OPTIONAL |

### 1.3 L2_FOUNDATION（用户原任务用词，本报告重命名为 L1_SPECIALIST 的二级 / 合并候选）

> Phase 1 报告将 `long-document-writing` / `meeting-minutes-manager` / `humanizer` 归为 L2；Phase 2 进一步确认它们与 `office-assistant` 任务模板高度重叠。
> 详见 §6 第一批可安全合并名单。

### 1.4 L3_INTERNAL（16 个）— 内部辅助、合并候选

**办公类 → `office-assistant`**：
- `long-document-writing`（长文档写作）
- `meeting-minutes-manager`（会议纪要 + 录音转写子流程）
- `humanizer`（去 AI 化润色）
- `合同台账提醒`（合同履约台账）
- `谈判备忘整理`（合同谈判备忘）
- `supervision-issue-report`（监督问题汇总）

**报告/审核类**：
- `supervision-doc-check`（监督文档核查） → 合并到 `geolog-logging-review`
- `mud-logging-review`（英文版） → canonical = `geolog-logging-review`（**仅确定，不删除**）

**合同分支 → `审查合同` / `起草合同`**：
- `NDA快筛`、`合同对比`、`合规性检查`、`法条速查`、`条款经济影响评估`
- （`起草合同` 保留为独立 L1，与 `审查合同` 形成完整起草+审核双向）

**监督类 → 合并 5→1**：
- `supervision-case-collector`（canonical）
- `supervision-photo-check`、`supervision-standard-lookup`（被 canonical 吸收）

### 1.5 L4_ARCHIVE_CANDIDATE（32 个）— 重复、废弃、实验性、无引用

| 子类 | 数量 | 列表 |
| --- | --- | --- |
| 业务无关 / 开发者向 | 10 | `autoresearch`、`image-well`、`nano-banana-pro`、`prompt-engineering-expert`、`yourself-skill`、`cognitive-profile`、`fullstack-dev`、`darwin-skill`、`skill-criticagent`、`mcp-criticagent`、`effect` |
| 科研向 | 7 | `experiment-design`、`research-baseline-builder`、`sci-employee-deep-research`、`giiisp-paper-search-apis`、`papercheck`、`manim-agent`、`practical-course-producer` |
| GitHub 趋势 | 4 | `github`、`github-ai-trends`、`github-trending-cn`、`tutor-skills` |
| 石油 IT 信息化 | 8 | `标杆对比`、`技术选型评审`、`立项报告`、`写报告`、`桌面调研`、`方案框架`、`项目周报`、`领导汇报` |
| PDF | 1 | `minimax-pdf`（设计级 PDF，需求极低） |
| 其他残留 | 1 | `llm-wiki`（仅 `_skillhub_meta.json`，无 SKILL.md，**实际是 ZOMBIE 形式但仍 allow**） |

### 1.6 FOUNDATION（12 个）— 不对用户直接展示的基础能力

`markitdown-skill`、`minimax-docx`、`minimax-xlsx`、`pdfkit-py`、`wpscli`、`tencentcloud-ocr`、`openai-whisper-api`、`web-access`、`browser-use`、`obsidian`、`石油行业合同知识库`、`信息化建设工具箱`、`pptx-generator`（Phase 2 将 `pptx-generator` 从 L2 重新归为 FOUNDATION）

---

## 2. 依赖审计（关键发现）

### 2.1 allowlist 实际清单 vs Phase 1 数量校验

| Agent | Phase 1 报告 | Phase 2 实际扫描 `agent.ts` | 差异说明 |
| --- | --- | --- | --- |
| xiaoxue 主 Agent | 41 | 39（已删除 1 处 `contract-management`） | ✅ 本阶段已修改 |
| office 子 Agent | 13 | 13 | 一致 |
| report 子 Agent | 7 | 7 | 一致 |
| tender 子 Agent | 5 | 5 | 一致 |
| contract 子 Agent | 7 | 6（已删除 1 处 `contract-management`） | ✅ 本阶段已修改 |
| knowledge 子 Agent | 17 | 17 | 一致 |
| document 子 Agent | 14 | 14 | 一致 |

### 2.2 Skill-to-Skill 引用关系（最关键）

通过扫描全部 77 个 `SKILL.md` 文本（识别 UTF-8 + GBK 双编码），识别出真实 Skill-to-Skill 引用：

| 主 Skill | 引用子 Skill | 引用类型 | 出处 |
| --- | --- | --- | --- |
| `审查合同` | `石油行业合同知识库`、`合同对比`、`NDA快筛`、`法条速查`、`合同台账提醒`、`合规性检查`、`条款经济影响评估` | SKILL.md "关联技能"段 | 审查合同/SKILL.md:257-265 |
| `knowledge-distill` | `geology-knowledge`、`llm-wiki-knowledge`、`office-assistant` | SKILL.md "边界"段 | knowledge-distill/SKILL.md:13-15 |
| `meeting-minutes-manager` | `markitdown-skill`、`openai-whisper-api`（隐含通过 description） | SKILL.md 自描述 | meeting-minutes-manager |
| `tencent-esign-contract` | `审查合同` / `合同对比` / `起草合同`（SKILL.md 自描述） | SKILL.md 自描述 | tencent-esign-contract |
| `tender-bid-generation` | `tender-document-review`、`tender-management` | SKILL.md 自描述 | tender-bid-generation |
| `supervision-case-collector` | `supervision-standard-lookup`、`supervision-photo-check` | SKILL.md 自描述 | supervision-case-collector |
| `supervision-issue-report` | `supervision-standard-lookup` | SKILL.md 自描述 | supervision-issue-report |
| `llm-wiki-knowledge` | `obsidian`（通过 tools） | 工具调用 | llm-wiki-knowledge/SKILL.md:36-38 |
| `geolog-logging-review` | `knowledge/`、`audit_extracted_text.py` | 文件引用 | geolog-logging-review/SKILL.md:39-43 |

### 2.3 TypeScript / Python 代码引用（实代码）

| 文件 | 引用的 Skill 名 | 是否需要本阶段修复 |
| --- | --- | --- |
| `packages/opencode/src/agent/agent.ts` | 41 个 Skill allow | ✅ **已修改**（删除 2 处 contract-management） |
| `packages/opencode/src/agent/xiaoxue-router.ts` | 9 个 Skill | ❌ 含 `contract-management:137`（路由仍命中，崩溃风险未消） |
| `packages/opencode/src/tool/skill.ts` | 通用 `skill` Tool | ✅ 调用不存在 Skill 会 `Effect.die`（崩溃） |
| `packages/opencode/src/tool/xiaoxue-router.ts` | 调用 `agent/xiaoxue-router.ts` | ❌ 同上 |
| `packages/opencode/test/agent/xiaoxue-router.test.ts` | 9 个 Skill 名 | ❌ line 39 期望 `contract-management`（仍命中，但 skill tool 调用会失败） |
| `packages/opencode/test/xiaoxue/portable-skills.test.ts` | 33 个 Skill 名 | ❌ line 80 期望 `contract-management.description` 含"合同管理"（已失败） |
| `configs/xiaoxue/router.md` | 18 个 Skill 名 | ❌ line 18 含 `contract-management` |
| `configs/xiaoxue/skills.yaml` | 33 个 Skill 名 | ❌ line 57 含 `contract-management` |
| `configs/xiaoxue/identity.yaml` | 不引用 Skill 名 | ✅ |
| `configs/xiaoxue/{office,geology_report,tender_review,contract_review,knowledge_query,document_generation}.md` | 部分 | 读取未发现硬编码 |

### 2.4 desktop / app / sdk-next 引用

✅ **0 个 Skill 名硬编码引用**——所有 Skill 引用集中在 `packages/opencode` 内。

### 2.5 archive 目录扫描行为（关键澄清）

**用户担忧成立**：**.opencode/skills/archive/ 会被 Skill discovery 递归扫描到**。

代码证据（`packages/opencode/src/skill/index.ts`）：
```ts
const OPENCODE_SKILL_PATTERN = "{skill,skills}/**/SKILL.md"  // line 25
const scan = (state, root, pattern, opts?: { dot?: boolean; scope?: string }) => {
  const matches = await Glob.scan(pattern, {
    cwd: root,
    absolute: true,
    include: "file",
    symlink: true,
    dot: opts?.dot,  // 默认 undefined，只有 .claude/.agents 显式 dot: true
  })
  ...
}
```

**结论**：
- `archive/` 不是以 `.` 开头，`dot: undefined` 不会跳过它
- `**` 匹配任意深度，`{skill,skills}/**/SKILL.md` 会扫到 `archive/foo/SKILL.md`
- **移到 `archive/` 不等于 disable**
- 若要 disable，必须用 `.archive/`（以点开头才会跳过）或从 `Config.skills.paths` 移除该目录

**当前 `.opencode/skills/` 下不存在 archive 目录**（已用 `Test-Path` 验证）。

---

## 3. 本阶段唯一代码修改（已完成）

### 3.1 修改文件

**`packages/opencode/src/agent/agent.ts`**

删除两处僵尸 allowlist：

```diff
                   aihot: "allow",
                   autoresearch: "allow",
                   "browser-use": "allow",
-                  "contract-management": "allow",   ← line 185, xiaoxue 主 Agent
                   "darwin-skill": "allow",

                 write: "ask",
                 skill: {
                   "*": "deny",
-                  "contract-management": "allow",   ← line 445, contract 子 Agent
                   "markitdown-skill": "allow",
                   "pdfkit-py": "allow",
                   "tencent-esign-contract": "allow",
```

### 3.2 测试验证结果

| 测试 | 期望 | 实际 | 评价 |
| --- | --- | --- | --- |
| `bun test test/agent/xiaoxue-router.test.ts` | 57 个 router 测试通过 | ✅ 57 pass / 0 fail | 删除不影响路由决策（router 是 string-only） |
| `bun test test/xiaoxue/portable-skills.test.ts` 第 1 个 | `contract-management` 出现在 `available` 列表 | ❌ 正确失败（line 78 期望） | ✅ **预期失败**，证明僵尸已从主 Agent 移除 |
| `bun test test/xiaoxue/portable-skills.test.ts` 第 2 个 | 加载 `meeting-minutes-manager` | ✅ pass | ✅ Skill discovery 与 Skill Tool 工作正常 |
| `tsc --noEmit` | 0 错误 | ⚠️ `tsc 5.8.2` 自身崩溃 | 与本次修改无关（环境问题：`_tsc.js:16876` 报 `undefined.kind`） |

**用户提醒**：测试 `portable-skills.test.ts:78-80` 会在下次 CI 失败。如要恢复，可同时更新 `imported` 数组移除 `contract-management`，并删除 line 80 的断言——但**这超出本阶段允许的修改范围**，待 Phase 3 用户确认。

---

## 4. knowledge-distill 归属分析（专项）

> 用户原话："knowledge-distill 暂不加入主 Agent allowlist；首先分析它是否应该作为
> material-organizer / geology-knowledge / office-assistant 的内部知识沉淀能力。"

### 4.1 self-description 边界声明

`knowledge-distill/SKILL.md:9-16`：

```
本技能是知识生产层，不是问答 Skill。

- 查询地质录井标准、制度或案例：使用 geology-knowledge。
- 初始化 Wiki、维护双向链接、检查孤立页/过时页面：使用 llm-wiki-knowledge。
- 只润色或整理办公材料：使用 office-assistant。
- 把授权原始资料转换为可审计事实卡、规则卡和冲突卡：使用本技能。
```

### 4.2 与三个候选目标的能力对比

| 维度 | `office-assistant` | `material-organizer` | `geology-knowledge` | **`knowledge-distill`** |
| --- | --- | --- | --- | --- |
| 输入 | 用户原始素材 + 模板 | 批量 URL/PDF/Word/截图 | 自然语言查询 | 授权 Word/PDF/Excel/标准/规则/报告 |
| 输出 | Markdown / DOCX 结构化材料 | 带目录与关键词索引的研究笔记 | 知识卡片（可追溯） | **evidence-preserving 知识卡（含 sourceId/location/originalText/normalizedFact/confidence/conflictsWith）** |
| 工具调用 | `office_document` | `bash,read,write` + `web_fetch` | `knowledge_search`,`knowledge_manage` | `knowledge_manage import/update/distill` + `xiaoxue_obsidian_archive` |
| 是否写知识库 | ❌ | ❌ | ❌（只读） | ✅ |
| 是否要求确认 | ❌ | 可选 | ❌ | ✅ 强制 `confirmed=true` |
| 冲突处理 | ❌ | 标注并存 | ❌ | ✅ 显式 `conflictsWith` |
| 来源追溯 | 仅 office_document actionItems | 文件名 | 知识卡 ID | ✅ **sourceId + SHA-256** |

### 4.3 结论：knowledge-distill **不是** 三个候选的子能力

- **不能并入 `office-assistant`**：`office-assistant` 输出的是"办公材料"（DOCX/Markdown），不是"知识卡"。`office-assistant` 的执行流程里没有任何 `knowledge_manage` 调用，没有 SHA-256，没有 conflictsWith，没有 version。
- **不能并入 `material-organizer`**：`material-organizer` 输出"研究笔记"（按主题分类的 Markdown），不写受控知识库，不强制确认，没有证据卡结构。
- **不能并入 `geology-knowledge`**：`geology-knowledge` 自描述为"查询"Skill（`packages/opencode/src/skill/index.ts` 的 description: "Query geological mud logging standards..."），其 `knowledge_search` 是只读 query 路径。

### 4.4 唯一合理归属：独立的 L1 知识生产 Skill

| 维度 | 建议 |
| --- | --- |
| Classification | **L1_SPECIALIST**（保留独立） |
| 建议 allow Agent | `knowledge`（追加 `knowledge-distill: allow`） |
| 是否入主入口 | ❌ 不入 xiaoxue 主入口（保持专业模式） |
| 启用时机 | Phase 3 用户确认后 |
| 与其他 Skill 的关系 | 与 `geology-knowledge`（查询）/`llm-wiki-knowledge`（Wiki 维护）形成 **查询-蒸馏-维护** 完整链路 |

---

## 5. L0 用户入口名单 + L0 下属的 L1/L2 Skill

### 5.1 5 个 L0 入口（Phase 2 最终建议）

| # | Skill | 下属 L1/L2 Skill |
| --- | --- | --- |
| 1 | `office-assistant` | `material-organizer` / `meeting-minutes-manager` / `long-document-writing` / `humanizer` / `pptx-generator`（FOUNDATION） / `minimax-docx` / `minimax-xlsx` / `openai-whisper-api` / `tencent-meeting-skill` |
| 2 | `geolog-logging-review` | `mud-logging-report-generation` / `markitdown-skill` / `pdfkit-py` / `tencentcloud-ocr` |
| 3 | `geology-knowledge` | `knowledge-distill` / `llm-wiki-knowledge` / `aihot` / `deep-research` / `obsidian` |
| 4 | `tender-document-review` | `tender-bid-generation` / `tender-management` |
| 5 | `审查合同` | `起草合同` / `tencent-esign-contract` / `合同对比` / `NDA快筛` / `合规性检查` / `法条速查` / `条款经济影响评估` / `石油行业合同知识库` |

### 5.2 总数：5 L0 + 12 L1 + 12 FOUNDATION = 29 个 "Skill 系统"

> 与 Phase 1 的"11 个核心入口"相比，Phase 2 把范围扩展为"5 个用户入口 + 12 个专业子能力 + 12 个底层支撑" = **29 个有意义的 Skill 节点**。
> 其余 50 个（ZOMBIE 2 + L3_INTERNAL 16 + L4_ARCHIVE_CANDIDATE 32）是"待清理 / 待归档 / 待禁用"候选。

---

## 6. 第一批可安全合并名单（**仅建议，不执行**）

### 6.1 安全合并条件

满足以下**全部**条件方可建议合并：
- ✅ 与某个 L0/L1 canonical Skill 任务模板高度重叠
- ✅ canonical Skill 已有完整流程描述（taskType）
- ✅ 合并后业务能力不丢失（仅路由简化）
- ✅ 没有独立外部 API 依赖
- ✅ 没有独立部署资源

### 6.2 第一批合并名单（7+1+5 = 13 个）

| 源 Skill | 目标 canonical | 合并理由 | 安全等级 |
| --- | --- | --- | --- |
| `long-document-writing` | `office-assistant` | office-assistant 已含"长文档写作"任务模板 | ✅ 高 |
| `meeting-minutes-manager` | `office-assistant` | office-assistant 已含"会议纪要"任务模板；录音转写保留为可选子流程（FOUNDATION） | ✅ 高 |
| `humanizer` | `office-assistant` | office-assistant 已含"Word 材料润色"任务模板 | ✅ 高 |
| `合同台账提醒` | `office-assistant` | 与 office-assistant 的"整改清单/工作计划"任务重叠 | ✅ 高 |
| `谈判备忘整理` | `office-assistant` | 与 office-assistant 的"会议纪要"任务重叠 | ✅ 高 |
| `supervision-issue-report` | `office-assistant` | 与 office-assistant 的"整改清单"任务重叠 | ✅ 高 |
| `supervision-doc-check` | `geolog-logging-review` | 与报告审核边界部分重叠 | ✅ 中 |
| **`mud-logging-review`** | **`geolog-logging-review`** | 100% 重复；canonical 已确定 | ✅ **仅确定，不删除**（用户要求保留以备迁移） |
| `supervision-photo-check` | `supervision-case-collector` | 监督类合并 5→1 | ✅ 中 |
| `supervision-standard-lookup` | `supervision-case-collector` | 监督类合并 5→1 | ✅ 中 |
| `supervision-case-collector` | `document-review-tracked` | 监督类合并 5→1，最终保留 1 个 | ✅ 中 |
| `NDA快筛` / `合同对比` / `合规性检查` / `法条速查` / `条款经济影响评估` | `审查合同` | 审查合同 SKILL.md 已显式声明"关联技能"，是 natural sub-skill | ✅ 高 |

### 6.3 不建议合并

- `tencent-esign-contract` ↔ `审查合同`：前者依赖 `ESIGN_TOKEN` 外部 API，合并会破坏外部服务边界
- `tender-document-review` ↔ `tender-management`：前者乙方视角，后者招标方视角，合并会丢失业务边界
- `tender-bid-generation` ↔ `tender-document-review`：互补关系，合并会丢失流程独立性
- `knowledge-distill` ↔ `geology-knowledge`：前者生产，后者查询，详见 §4
- `office-assistant` ↔ `long-document-writing` / 等：反向合并（用 office-assistant 吸收其他）

---

## 7. 第一批可安全归档名单（**仅建议，不执行**）

### 7.1 安全归档条件

满足以下**任一**条件即可建议归档：
- 完全 deny（不出现在 `<available_skills>` 中）
- 业务无关（科研 / 教育 / 个人 / 开发者向）
- IT 信息化项目专用（与"录井"主营差异大）
- 与某 canonical 高度重复

### 7.2 第一批归档名单（32 个）

按子类分组：

**A. 业务无关 / 消费类（6 个）**
`autoresearch` / `image-well` / `nano-banana-pro` / `prompt-engineering-expert` / `yourself-skill` / `cognitive-profile`

**B. 开发者向（6 个）**
`fullstack-dev` / `darwin-skill` / `skill-criticagent` / `mcp-criticagent` / `effect` / `minimax-pdf`

**C. 科研 / 教育 / 论文（7 个）**
`sci-employee-deep-research` / `giiisp-paper-search-apis` / `papercheck` / `manim-agent` / `practical-course-producer` / `experiment-design` / `research-baseline-builder`

**D. GitHub 趋势（4 个）**
`github` / `github-ai-trends` / `github-trending-cn` / `tutor-skills`

**E. 石油 IT 信息化（8 个）**
`标杆对比` / `技术选型评审` / `立项报告` / `写报告` / `桌面调研` / `方案框架` / `项目周报` / `领导汇报`

**F. ZOMBIE 元数据（1 个）**
`llm-wiki`（仅 `_skillhub_meta.json`，无 SKILL.md）

### 7.3 归档 ≠ 删除

**必须告知用户**：归档候选如要执行：
1. **不能仅移动到 `.opencode/skills/archive/`**（**仍会被扫描**，详见 §2.5）
2. **必须移动到 `.archive/`**（以点开头才会被 `dot: undefined` 跳过）或
3. **修改 `Config.skills.paths`** 排除这些目录
4. 或**修改 `agent.ts` allowlist + Config** 双重 disable

---

## 8. 所有存在高风险引用的 Skill（必查清单）

| # | Skill | 风险类型 | 引用位置 | 风险等级 | 修复建议（**不执行**） |
| --- | --- | --- | --- | --- | --- |
| 1 | `contract-management` | **ZOMBIE → Effect.die 崩溃点** | `router.ts:137`、`router.md:18`、`skills.yaml:57`、`xiaoxue-router.test.ts:39`、`portable-skills.test.ts:23,80` | 🔴 CRITICAL | 改 router.ts:137 → 改为 `审查合同` 或 `起草合同`；改 router.md:18 同理；改 skills.yaml:57 移除；改测试移除 `contract-management` |
| 2 | `mud-logging-review` | **100% 重复 + trigger 抢同一任务** | `agent.ts:216,393`（xiaoxue + report 都 allow） | 🔴 HIGH | Phase 3 用户确认后移除 allowlist；保留目录作为迁移备份 |
| 3 | `long-document-writing` | **任务模板重叠 + router 抢 trigger** | `agent.ts:221,366,533`、`router.md:13`、`router.ts:242` | 🟡 MEDIUM | Phase 3 合并到 office-assistant 后移除 allowlist |
| 4 | `meeting-minutes-manager` | **任务模板重叠 + router 抢 trigger** | `agent.ts:198,358,523`、`router.md:10`、`router.ts:152` | 🟡 MEDIUM | 同上，录音转写保留为子流程 |
| 5 | `humanizer` | **完全重叠 office-assistant 润色** | `agent.ts:193,355`、`router.ts:103` | 🟡 MEDIUM | 合并后移除 allowlist |
| 6 | `tencent-esign-contract` ↔ `审查合同` | **description 级 trigger 冲突**（前者触发词含"审查合同"/"合同风险"） | `agent.ts:207,448`、`router.md:19` | 🟡 MEDIUM | 在 tencent-esign-contract SKILL.md 增加"仅当企业接入腾讯电子签时使用"门控 |
| 7 | `llm-wiki` | **ZOMBIE 元数据 + 仍 allow** | `agent.ts:195,489`、`router.ts:118` | 🟡 MEDIUM | 移除 allowlist + 决定清理/补 SKILL.md |
| 8 | `knowledge-distill` | **业务核心但当前 deny**（仅知识管理入口，无 tool 调用） | `agent.ts` 中**无 allow** | 🟡 MEDIUM | Phase 3 用户确认后加入 `knowledge` Agent allowlist |
| 9 | `起草合同` | **业务核心但当前 deny**（仅合同分支） | `agent.ts` 中无 allow，但 `审查合同/SKILL.md:262` 显式引用 | 🟢 LOW | Phase 3 加入 `contract` Agent allowlist |
| 10 | `well-control-risk-assessment` | **FUTURE_PRODUCT_PHASE 无 WITS 接入** | `identity.yaml:30` 边界排除 | 🟢 LOW | 保持 L1（FUTURE）状态 |
| 11 | `material-organizer` | **跨域文档 SKILL.md 引用不存在的 paper-quick-reader / academic-translation**（上游 opencode-skills 残留） | `material-organizer/SKILL.md:42-46, 359-363` | 🟢 LOW | 在 SKILL.md "不在范围"段注明"该段为上游模板残留，实际未启用" |
| 12 | `审查合同` | **最大 skill-to-skill 引用网络**（6 个内部关联 Skill） | `审查合同/SKILL.md:257-265` | 🟢 LOW | 当 6 个 sub-Skill 合并后需更新关联段 |
| 13 | 19 个 GBK 编码中文 Skill | **Windows 默认 UTF-8 控制台显示乱码**（不影响功能） | N/A | 🟢 LOW | RC6 发版前统一转换为 UTF-8 |
| 14 | 7 个英文 SKILL.md 含中文 description | **编码混杂**（geolog-logging-review 等） | N/A | 🟢 LOW | 同上 |

---

## 9. 待用户审核事项（**Phase 3 前置条件**）

> 本阶段**不执行**任何合并或归档。所有下列操作必须等用户与 GPT 共同审核。

1. **确认 5 个 L0 入口是否增删**：
   - 是否需要将 `knowledge-distill` 加入 L0 入口（前提是把它加入 xiaoxue 主 Agent allowlist）
   - 是否需要将 `起草合同` 提升为 L0 入口（与 `审查合同` 并列）

2. **确认 12 个 L1 专业常用的可见范围**：
   - 默认隐藏 / 专业模式可见 / 始终可见？
   - `well-control-risk-assessment` 保持 FUTURE_PRODUCT_PHASE 状态？

3. **确认 16 个 L3_INTERNAL 的合并方向**：
   - `office-assistant` 吸收 6 个办公类 Skill 接受度？
   - `审查合同` 吸收 5 个合同分支 Skill 接受度？
   - 5 个 `supervision-*` Skill 合并 5→1 接受度？
   - `mud-logging-review` 是否同时移除 allowlist（保留目录）？

4. **确认 32 个 L4_ARCHIVE_CANDIDATE 的归档方式**：
   - 移到 `.archive/`（以点开头）或修改 `Config.skills.paths`？
   - 还是保持 `archive/` 子目录但 Skill discovery 已通过 `.archive/` 显式排除？
   - `llm-wiki` ZOMBIE 元数据是否同步归档？

5. **确认 contract-management 僵尸路由链修复**（本次仅清理 allowlist）：
   - 是否同意改 `router.ts:137` 把 `skill: "contract-management"` 改为 `skill: "起草合同"`？
   - 是否同意改 `router.md:18` 同理？
   - 是否同意改 `skills.yaml:57` 移除 `contract-management`？
   - 是否同意更新 `portable-skills.test.ts` 与 `xiaoxue-router.test.ts` 测试期望？

6. **确认 knowledge-distill 是否启用**：
   - 加入 `knowledge` Agent allowlist（推荐）；
   - 或继续 keep-deny 直至 Phase 3？

7. **确认 GBK 编码转换计划**：
   - 是否同意 RC6 发版前将 19 个 GBK 编码中文 Skill 转为 UTF-8？

---

## 10. 附录：所有数据来源

| 文件 | 用途 |
| --- | --- |
| `packages/opencode/src/agent/agent.ts` | 7 个 Agent 的 Skill allowlist（已修改 line 185 + 445） |
| `packages/opencode/src/agent/xiaoxue-router.ts` | 业务路由实现（9 个 Skill 名硬编码，**未修改**） |
| `packages/opencode/src/tool/skill.ts` | `skill` Tool（不存在的 Skill 会 `Effect.die`） |
| `packages/opencode/src/tool/xiaoxue-router.ts` | `xiaoxue_route` Tool（包装 router） |
| `packages/opencode/src/skill/index.ts` | Skill discovery 主逻辑（line 25 `OPENCODE_SKILL_PATTERN`） |
| `packages/opencode/src/skill/discovery.ts` | 远端 Skill 拉取 |
| `packages/core/src/skill/discovery.ts` | V2 Skill 发现（远程拉取） |
| `packages/core/src/skill/guidance.ts` | `<available_skills>` 注入 |
| `packages/opencode/src/xiaoxue/enterprise-policy.ts` | 企业托管策略（默认 unrestricted） |
| `packages/opencode/test/agent/xiaoxue-router.test.ts` | 57 个 router 测试（已通过） |
| `packages/opencode/test/xiaoxue/portable-skills.test.ts` | Skill discovery 真实加载（1 fail + 1 pass，符合预期） |
| `configs/xiaoxue/router.md` | 18 行路由表 |
| `configs/xiaoxue/skills.yaml` | 6 核心 Skill 注册 + portable_pack agents |
| `configs/xiaoxue/identity.yaml` | 小雪定位与边界 |
| `configs/xiaoxue/{system,office,geology_report,tender_review,contract_review,knowledge_query,document_generation}.md` | 系统提示词 |
| `.opencode/skills/**/SKILL.md` | 77 个 Skill 的 frontmatter 与正文 |
| `docs/skill-center/skill-portfolio-audit-2026-08-22.md` | Phase 1 报告（本次前置） |
| `docs/skill-center/skill-portfolio-inventory-2026-08-22.tsv` | Phase 1 机器可排序清单 |

> 本报告**未修改**任何 SKILL.md、`router.md`、`skills.yaml`、`xiaoxue-router.ts`、`skill.ts`、`router` md 之外的部分或 `.opencode/skills/` 中任何 Skill 文件。
> 本报告**仅修改**：`packages/opencode/src/agent/agent.ts` 两行 `contract-management` allow。
