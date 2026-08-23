# Phase 3.2A — Supervision Skill Viability Audit (Closeout)

> 状态：CLOSED — COMPLETE + **FROZEN_PENDING_BUSINESS_ASSETS**（用户 2026-08-23 审核通过 PASS）
> 主题：5 个 supervision Skill 的逐项可行性审计（不做任何修改）
> 报告日期：2026-08-23
> 前置依据：Phase 3.2（CONSOLIDATION CANCELLED，详见 `phase3.2-supervision-consolidation-cancelled-2026-08-23.md`）/ Phase 3.1B（已 CLOSED）/ Phase 3.1A（已 CLOSED）/ Phase 3.0/3.0A/2.5（已 CLOSED）
> 输入基线：skill-counting-model.ts 87 SKILL.md / 77 runtime distinct names；skill-reference-snapshot.ts 248 referenced, 0 missing, 77 discovered, 80 portfolio_nodes, 37 orphans
> 关联矩阵：`docs/skill-center/phase3.2A-supervision-dependency-matrix-2026-08-23.tsv`
> Portfolio 修正：5 个 supervision Skill 由 `L3_INTERNAL` 修正为 `L4_DISABLED_FOR_XIAOXUE (reason=INCOMPLETE_BUSINESS_ASSETS, future_role=SPECIALIST)` — 详见 phase3.2-supervision-consolidation-cancelled-2026-08-23.md §四

---

## 一、最终汇报

```
Phase 3.2A: PASS

Cluster members = 5

READY_BUT_DISABLED:
  (none)

INCOMPLETE_STUB:
  - supervision-issue-report        (knowledge/inspection_cases 缺失 + knowledge/templates 空 + supervision-standard-lookup 是 sibling stub)
  - supervision-doc-check          (knowledge/templates 空; 核查可部分执行; 起草流程依赖 minimax-docx 输出)
  - supervision-case-collector     (knowledge/inspection_cases/ 整个目录不存在; 依赖 supervision-standard-lookup)
  - supervision-photo-check        (knowledge/standards/INDEX.md + clauses.md 缺失)
  - supervision-standard-lookup    (knowledge/standards 索引与条款卡缺失; knowledge/inspection_cases 缺失)

FUTURE_SPECIALIST_CANDIDATE:
  - supervision-issue-report        (监督中心通报生成是真实业务，但仅当 knowledge 三件套齐备时才完整可用)
  - supervision-doc-check          (地质交底与录井策划核查是真实业务，但 knowledge/templates 未填充)
  - supervision-case-collector     (案例库沉淀是真实业务，但 knowledge/inspection_cases 尚未建立)
  - supervision-photo-check        (看图说话是真实业务，但 knowledge/standards 尚未提取条款卡)
  - supervision-standard-lookup    (标准条款速查是真实业务，但 knowledge/standards/INDEX.md 尚未建立)

PURE_DUPLICATE:
  (none — 5 个 Skill 各属不同生命周期阶段，无能力重叠)

ARCHIVE_CANDIDATE:
  (none — 全部有独立工作流与业务价值)

Missing assets (清单见 phase3.2A-supervision-dependency-matrix-2026-08-23.tsv):
  - knowledge/standards/INDEX.md           REQUIRED for supervision-photo-check / supervision-standard-lookup
  - knowledge/standards/<标准>/clauses.md   REQUIRED for supervision-photo-check / supervision-standard-lookup
  - knowledge/standards/<标准>/original.pdf OPTIONAL fallback for supervision-standard-lookup
  - knowledge/templates/*.md                OPTIONAL with fallback for supervision-doc-check / supervision-issue-report
  - knowledge/inspection_cases/             REQUIRED for supervision-case-collector / supervision-issue-report / supervision-standard-lookup
  - knowledge/inspection_cases/README.md    REQUIRED (案例卡模板 + 分类归属)
  - knowledge/inspection_cases/INDEX.md     REQUIRED (索引登记)

Git history finding:
  - 5 个 Skill 在 git 中属于 NEVER EXISTED IN HISTORY：
    * .opencode/.gitignore:8 包含 `skills/`，整个 .opencode/skills/ 被忽略
    * `git ls-files .opencode/skills/supervision-*` 全部为空
    * `git log --all -- <path>` 全部为空
    * `git stash list` 两个 stash 均不含此 skill
    * `git reflog --all` 不含此 skill
    * `git fsck --unreachable` 不含此 skill
  - knowledge/standards/.gitkeep   首次添加于 commit `707ff18f51` (feat(review): add xiaoxue business engines, 2026-07-23)，再次添加于 `87b38370ae`；从未删除、从未填充
  - knowledge/templates/.gitkeep   首次添加于 commit `707ff18f51`，再次添加于 `87b38370ae`；从未删除、从未填充
  - knowledge/inspection_cases/    从未在 git 任何 commit 中出现过；当前工作树中目录不存在
  - 5 个 supervision Skill 仅在 packages/desktop/resources/integrity.json 中以资源清单形式登记（2365-2381 行），由打包流程收集
  - 5 个 supervision Skill 在工作树中的创建时间均为 2026-08-20 16:47~16:49（一天内集中落盘）
  - 结论：never_existed / never_populated —— 这是 SKILL.md 设计与现有 knowledge/ 资产的实际不一致状态，并非迁移遗漏或历史删除

Runtime references = 0
Orphans = 5

Recommendation:
  retain disabled (INCOMPLETE_STUB 状态)
  + business review (是否投入资源补齐 knowledge 资产)
  + 不允许在本阶段为消除 orphan 而修改 allowlist / router / subagent / 新增 fake workflow
  + **正式冻结状态：FROZEN_PENDING_BUSINESS_ASSETS**（5/5 Skill）
```

---

## 二、审计目标与方法

Phase 3.2 曾假设"5 个 supervision Skill 可合并"，被暂停。本阶段（3.2A）改为**逐 Skill 审计**，判断每个 Skill 自身的可执行性与缺失依赖，而非迁移或合并。

### 2.1 审计 5 维度

| 维度 | 验证内容 |
|---|---|
| 自包含性 | 仅靠 SKILL.md 是否能执行；哪些路径是 SKILL.md 引用但文件不存在 |
| 知识依赖 | knowledge/standards / knowledge/templates / knowledge/inspection_cases 三类资产的存在性与内容 |
| 工具依赖 | xlsx / docx / tencentcloud-ocr 等工具或 Skill 是否真实存在 |
| 最小可执行性 | 构造最小业务输入，验证能否完成、能否部分完成、被何处阻塞 |
| Git history | 缺失资产是 never existed / deleted / renamed / omitted during migration / external dependency |

### 2.2 排除的人为操作

- 不创建 supervision-assistant 等新 L0 用户入口
- 不修改 .opencode/skills/supervision-* 的 SKILL.md
- 不修改 agent.ts allowlist / xiaoxue-router.ts / configs/xiaoxue/{router.md,skills.yaml}
- 不创建 .opencode/skills/.archive/ 目录或 L4 archive
- 不创建空 knowledge/ 目录或伪造任何"看起来像真的"监督制度、检查标准、案例资料

---

## 三、P0 — 物理清单

5 个 Skill 目录均位于 `.opencode/skills/` 下，每个目录**仅有 SKILL.md**（无 references/、无 scripts/、无 templates/）：

| Skill | 物理大小 | 创建时间 |
|---|---|---|
| supervision-case-collector | 34 行 SKILL.md | 2026-08-20 16:48 |
| supervision-doc-check | 38 行 SKILL.md | 2026-08-20 16:49 |
| supervision-issue-report | 48 行 SKILL.md | 2026-08-20 16:48 |
| supervision-photo-check | 50 行 SKILL.md | 2026-08-20 16:48 |
| supervision-standard-lookup | 38 行 SKILL.md | 2026-08-20 16:47 |

**观察**：5 个 Skill 在同一天（约 1 小时内）落盘。设计成熟度近似（描述-输入-工作流-输出-纪律 五段式），但缺少配套 scripts/ / references/ 资产。

---

## 四、P1 — Runtime Reference Audit（基线确认）

Phase 3.2 已完成 P1，本阶段重复确认基线**未发生变化**：

| 引用源 | supervision-* 命中数 |
|---|---|
| `packages/opencode/src/agent/agent.ts` allowlist | 0 |
| `packages/opencode/src/agent/xiaoxue-router.ts` regex routing | 0 |
| `configs/xiaoxue/router.md` 关键词表 | 0 |
| `configs/xiaoxue/skills.yaml` subagent 配置 | 0 |
| `packages/opencode/test/xiaoxue/portable-skills.test.ts` | 0 |
| `packages/opencode/test/agent/xiaoxue-router.test.ts` | 0 |
| `packages/desktop/resources/integrity.json` | **5**（资源清单，不构成 runtime 引用） |

**结论**：5/5 Skill 的 runtime reference = 0（integrity.json 是打包清单，非 runtime 调度）。

---

## 五、P2 — Capability Matrix（业务生命周期区分）

按用户要求，至少区分以下 6 个业务阶段：

| 业务阶段 | 对应 Skill | 工作流摘要 |
|---|---|---|
| 监督资料检查（文档） | supervision-doc-check | 地质交底 / 录井策划对照单井地质设计的格式与数据核查 |
| 监督资料检查（照片） | supervision-photo-check | 看图说话：设备 / 设施 / 作业状态对照标准的偏差识别 |
| 监督资料检查（标准） | supervision-standard-lookup | 标准条款速查：口语化问题 → 标准号 → 条款 → 规范性描述 |
| 问题发现 / 问题报告 | supervision-issue-report | 案例与清单汇总成问题汇总表 + 监督通报初稿 |
| 案例沉淀 | supervision-case-collector | 新案例入库（卡片 + 索引）+ 历史案例检索 |
| 整改闭环 / 历史案例复用 | supervision-case-collector（整改字段更新）+ supervision-standard-lookup（参考案例号） |

**结论**：5 个 Skill 分属监督业务的不同生命周期节点，**NOT A MERGE CLUSTER**。同名"supervision-"只是命名域，非合并依据。

---

## 六、P3 — Dependency Audit（详细依赖清单）

完整依赖矩阵见 `phase3.2A-supervision-dependency-matrix-2026-08-23.tsv`（23 行依赖）。摘要：

### 6.1 knowledge/standards/ 相关

| Skill | 引用路径 | 类型 | 存在性 |
|---|---|---|---|
| supervision-photo-check | `knowledge/standards/INDEX.md` + clauses.md | REQUIRED | 父目录存在（仅 .gitkeep），INDEX.md / clauses.md 缺失 |
| supervision-standard-lookup | `knowledge/standards/INDEX.md` + clauses.md + original.pdf | REQUIRED | 同上 |

**判断**：两类资源（标准索引、条款卡）从未填充。

### 6.2 knowledge/templates/ 相关

| Skill | 引用路径 | 类型 | 存在性 |
|---|---|---|---|
| supervision-issue-report | `knowledge/templates/` 通报模板 | OPTIONAL with fallback | 目录存在（仅 .gitkeep） |
| supervision-doc-check | `knowledge/templates/` 文档模板 | OPTIONAL with fallback | 同上 |

**判断**：模板可回退到用户确认（SKILL.md 明确写出"无模板时向用户要格式要求"），但属于部分阻塞——起草流程无法填充模板占位符。

### 6.3 knowledge/inspection_cases/ 相关

| Skill | 引用路径 | 类型 | 存在性 |
|---|---|---|---|
| supervision-case-collector | `inspection_cases/README.md` / `INDEX.md` | REQUIRED | **目录不存在** |
| supervision-issue-report | `knowledge/inspection_cases/` 案例卡 | REQUIRED | **目录不存在** |
| supervision-standard-lookup | `knowledge/inspection_cases/INDEX.md` | OPTIONAL | **目录不存在** |

**判断**：inspection_cases 整个目录从未建立；supervision-case-collector 完全无法入库与检索；supervision-issue-report 的"重复问题检索"功能无法工作；supervision-standard-lookup 失去参考案例功能。

### 6.4 跨 Skill 引用

| 调用方 | 被调 Skill | 影响 |
|---|---|---|
| supervision-issue-report:39 | supervision-standard-lookup | 通报初稿无法附条款依据；本身亦为 INCOMPLETE_STUB |
| supervision-case-collector:14 | supervision-photo-check | 缺失照片输入时不影响其余流程 |
| supervision-case-collector:16 | supervision-standard-lookup | 入库条款无法查证，案例只能填"待核实" |

### 6.5 工具/Skill 依赖

| Skill | 工具引用 | 存在性 |
|---|---|---|
| supervision-issue-report | "xlsx 技能" → minimax-xlsx | 物理存在（gitignored） |
| supervision-issue-report | "docx 文档" → minimax-docx | 物理存在（gitignored） |
| supervision-doc-check | "docx/pdf/xls 文档提取" → minimax-docx / minimax-pdf | 物理存在（gitignored） |
| supervision-doc-check | "docx 初稿输出" → minimax-docx | 物理存在（gitignored） |
| supervision-photo-check | tencentcloud-ocr（隐式 OCR） | 在 integrity.json 中登记 |

**判断**：工具层依赖基本具备（minimax-docx / minimax-xlsx / tencentcloud-ocr 都在），但 knowledge/ 资产缺失是更深层阻塞。

---

## 七、P4 — Minimum Executability Test（最小业务输入验证）

不接入 Xiaoxue，按 SKILL.md 自身描述的工作流做静态执行推演。每个 Skill 构造一个最小业务输入：

### 7.1 supervision-photo-check

**最小输入**：1 张井场照片 + 场景说明"综合录井仪传感器安装"

**执行推演**：
1. 识别画面要素：可由 AI 视觉模型完成 ✓（除非用 OCR 工具，路径可选）
2. 确定检查依据：检索 `knowledge/standards/INDEX.md` → **文件不存在** ✗
3. 逐条比对：依赖条款卡 → **文件不存在** ✗
4. 输出四要素问题清单：可输出，但违反条款栏全部为"待核实"
5. 建议现场核查项：可输出

**完成度**：**部分完成**（看图说话 + 现场建议可输出；条款引用全部降级为"待核实"）。**阻塞**：knowledge/standards/INDEX.md + clauses.md。

### 7.2 supervision-doc-check

**最小输入**：1 份地质交底 docx + 1 份单井地质设计 docx

**执行推演**：
1. 收集文档：minimax-docx 提取正文 ✓
2. 基础数据比对：可手工比对井号 / 井型 / 井深 / 坐标 ✓
3. 格式规范检查：对照 `knowledge/templates/` → **目录仅 .gitkeep** → 须向用户确认格式 ✗
4. 输出差异清单：可输出（数据不一致 + 格式缺项 + 需人工确认 三类）
5. 起草流程：模板缺失 → **起草流程无法启动** ✗

**完成度**：**核查流程可部分完成**（数据比对可执行，格式检查降级）。**生成流程完全阻塞**。

### 7.3 supervision-case-collector

**最小输入**：1 个新发现问题的口述描述

**执行推演**：
1. 采集信息：可向用户逐项确认要素 ✓
2. 确定分类：检索 `inspection_cases/README.md` → **目录不存在** ✗
3. 核实条款：调用 supervision-standard-lookup → **sibling 是 stub** ✗
4. 生成案例卡：路径 `inspection_cases/<分类>/<日期>-<井号>-<序号>.md` → **父目录不存在，无法写入** ✗
5. 登记索引：写入 `inspection_cases/INDEX.md` → **文件不存在** ✗

**完成度**：**完全阻塞**。**唯一可执行动作**：把案例要素以对话内 markdown 形式呈现给用户，由用户手工入库。

### 7.4 supervision-issue-report

**最小输入**：当日 5 条问题的口述清单

**执行推演**：
1. 归集问题：可汇总要素 ✓
2. 分类汇总：可按六类 + 单位 → 小队 → 责任人分级生成 markdown 表格 ✓
3. 统计分析：可按类别 / 单位统计；"重复问题检索"需访问 `knowledge/inspection_cases/` → **目录不存在** ✗
4. 输出汇总表：minimax-xlsx 可生成 xlsx ✓
5. 通报生成：读取模板 → **目录仅 .gitkeep** → 须向用户确认模板 ✗；调用 supervision-standard-lookup 生成规范性描述 → **sibling 是 stub** ✗

**完成度**：**汇总表可生成**；**通报生成完全阻塞**。

### 7.5 supervision-standard-lookup

**最小输入**：1 个口语化问题（如"传感器未接地"）

**执行推演**：
1. 理解问题：可提取对象 / 行为 / 偏差 ✓
2. 定位标准：检索 `knowledge/standards/INDEX.md` → **文件不存在** ✗
3. 定位条款：检索 clauses.md → **文件不存在** ✗
4. 比对案例：检索 `knowledge/inspection_cases/INDEX.md` → **目录不存在** ✗
5. 输出三段式：可输出，但【违反条款】与【参考案例】只能给"未找到依据 / 无同类案例"

**完成度**：**严重阻塞**。唯一可执行动作是告知用户"未在已登记标准中找到依据"。

### 7.6 最小可执行性总结

| Skill | 完全完成 | 部分完成 | 完全阻塞 |
|---|---|---|---|
| supervision-photo-check | | ✓ | |
| supervision-doc-check | | ✓ | |
| supervision-case-collector | | | ✓ |
| supervision-issue-report | | ✓ | |
| supervision-standard-lookup | | | ✓ |

**核心结论**：5/5 Skill 自身设计完整（workflow 描述清晰），但 5/5 都受 knowledge/ 资产缺失阻塞。这是**资产缺失问题，不是 Skill 设计问题**。

---

## 八、P5 — 业务价值评估（区别于合并）

按用户要求明确区分 5 个生命周期阶段的能力差异：

| Skill | 唯一能力（不可被其他 Skill 替代） |
|---|---|
| supervision-doc-check | 井号 / 井型 / 井深 / 坐标 / 区域资料字段对照；地质交底 + 录井策划模板起草 |
| supervision-photo-check | 看图说话四要素输出（问题位置 / 具体表现 / 违反条款 / 整改建议）+ 严重程度排序 |
| supervision-standard-lookup | 标准号 + 条款号 + 页码三段式规范性描述生成；条款原文摘录 |
| supervision-case-collector | 案例卡 + INDEX.md 双向检索；编号规则 EZ/SC/JY/JK/ZL/LC；批量入库；脱敏入库 |
| supervision-issue-report | 单位-小队-责任人逐级汇总 + 六类问题分类 + 重复问题升级 + 通报模板填充 |

**判断**：5 个能力**完全不重叠**。任何一个被删除或合并都会丢失独立能力。

- 没有 PURE_DUPLICATE
- 没有 KEEP_AS_INTERNAL_SPECIALIST（runtime reference = 0）
- 没有适合合并的 canonical L0

**NOT A MERGE CLUSTER** — 再次确认。

---

## 九、P6 — Git History Investigation

### 9.1 5 个 Skill 的 Git 历史

`git ls-files .opencode/skills/supervision-*` 全部为空；`git log --all -- .opencode/skills/supervision-*` 全部为空；`git stash list` 两个 stash 都不含此路径；`git reflog --all` 不含此路径；`git fsck --unreachable` 不含此路径。

`git check-ignore -v .opencode/skills/supervision-issue-report/SKILL.md` 输出：

```
.opencode/.gitignore:8:skills/    .opencode/skills/supervision-issue-report/SKILL.md
```

**结论**：5 个 Skill 被 `.opencode/.gitignore` 第 8 行的 `skills/` 规则忽略。物理存在于工作树中，但从未被加入 git 历史。

**分类**：**never_existed_in_git_history**（与"删除"或"重命名"无关）。

### 9.2 knowledge/standards/ 的历史

`git log --all --diff-filter=A -- knowledge/standards`：

```
87b38370ae feat: sync xiaoxue with upstream
707ff18f51 feat(review): add xiaoxue business engines
```

两次 commit 都只添加 `knowledge/standards/.gitkeep`。**没有任何 commit 真正填充 INDEX.md / clauses.md / original.pdf**。`git log --all --diff-filter=D -- knowledge/standards` 为空（从未删除）。

**分类**：**never_populated**（占位骨架已建立 28 天，内容从未填充）。

### 9.3 knowledge/templates/ 的历史

与 9.2 平行：两次 commit 添加 `.gitkeep`，从未填充，从未删除。

**分类**：**never_populated**。

### 9.4 knowledge/inspection_cases/ 的历史

`git log --all --diff-filter=AD -- knowledge/inspection_cases` 全部为空。

**分类**：**never_existed_in_git_history**（从未添加 .gitkeep，从未添加任何文件）。

### 9.5 5 个 Skill 的落盘时间

5 个目录 `LastWriteTime` 均为 `2026-08-20 16:47~16:49`（约 1 小时内集中落盘）。

integrity.json 第 2365-2381 行登记 5 条 skill 资源清单，由打包流程收集。

### 9.6 结论

| 资产 | 历史状态 |
|---|---|
| 5 个 supervision Skill | never_existed_in_git_history（gitignore 屏蔽） |
| knowledge/standards/INDEX.md | never_populated（仅有 .gitkeep） |
| knowledge/standards/*/clauses.md | never_populated |
| knowledge/standards/*/original.pdf | never_populated |
| knowledge/templates/* | never_populated（仅有 .gitkeep） |
| knowledge/inspection_cases/ | never_existed_in_git_history（无目录） |
| knowledge/inspection_cases/README.md | never_existed_in_git_history |
| knowledge/inspection_cases/INDEX.md | never_existed_in_git_history |

**关键判断**：所有缺失都属于 **never_existed / never_populated**，**不是**：
- deleted historically（git log --diff-filter=D 全部为空）
- path renamed（无任何 rename 事件记录）
- omitted during migration（gitignore 屏蔽，非迁移遗漏）
- external dependency（与外部网络资源无关，是本地仓库资产）

这不是"路径写错"，也不是"外部 Skill 包迁入但资源未迁入"。这是**SKILL.md 设计预期了不存在的知识资产**——5 个 Skill 的设计者写出了完整工作流，但配套 knowledge/ 资产从未建立。

---

## 十、P7 — Business Lifecycle Mapping（业务阶段明确区分）

5 个 Skill 在监督业务中的生命周期定位：

```
[标准层]              supervision-standard-lookup        ← 条款查询入口
     ↓
[资料层]              supervision-photo-check            ← 现场照片看图说话
                     supervision-doc-check              ← 文档格式与数据核查
     ↓
[沉淀层]              supervision-case-collector         ← 案例入库 + 检索
     ↓
[报告层]              supervision-issue-report           ← 汇总 + 通报
```

**观察**：5 个 Skill 覆盖一个完整的"发现问题 → 录入 → 汇总 → 通报"监督工作流。任何一个缺失都会导致业务链断裂：

- 缺 supervision-photo-check → 现场照片无法结构化
- 缺 supervision-doc-check → 文档格式合规无法自动化
- 缺 supervision-standard-lookup → 所有违规行为无法对标
- 缺 supervision-case-collector → 历史经验无法复用
- 缺 supervision-issue-report → 监督中心无法批量出通报

**NOT A MERGE CLUSTER**：5 个 Skill 是监督业务的**完整工作链**，必须分别保留。

---

## 十一、P8 — 状态分类（决定性结论）

按用户给出的 5 类状态逐 Skill 判定：

| Skill | READY_BUT_DISABLED | INCOMPLETE_STUB | FUTURE_SPECIALIST_CANDIDATE | PURE_DUPLICATE | ARCHIVE_CANDIDATE |
|---|---|---|---|---|---|
| supervision-issue-report | | ✓ | ✓ | | |
| supervision-doc-check | | ✓ | ✓ | | |
| supervision-case-collector | | ✓ | ✓ | | |
| supervision-photo-check | | ✓ | ✓ | | |
| supervision-standard-lookup | | ✓ | ✓ | | |

**判定说明**：
- **READY_BUT_DISABLED**：要求 Skill 自身完整。本阶段 5/5 都不完整（受 knowledge/ 缺失阻塞），所以无任何 Skill 落入此类。
- **INCOMPLETE_STUB**：5/5 都满足——SKILL.md 工作流设计完整，但缺失必要知识资产。
- **FUTURE_SPECIALIST_CANDIDATE**：5/5 都满足——业务价值明确，但当前 release 范围内没有对应 knowledge 内容支撑。
- **PURE_DUPLICATE**：要求"能力完全被另一个 Skill 覆盖"。本阶段 5 个 Skill 各有独立工作流，无能力重叠，**全部不适用**。
- **ARCHIVE_CANDIDATE**：要求"无独有能力、无未来用途、无依赖"。5/5 都有独有能力 + 业务价值 + 内部依赖，**全部不适用**。

**核心结论**：5/5 都是 INCOMPLETE_STUB，且同时具备 FUTURE_SPECIALIST_CANDIDATE 特征。前者是当前状态，后者是修复路径——是否补齐 knowledge 资产是业务决策，不是技术决策。

---

## 十二、P9 — 禁止事项确认

按用户要求确认本阶段未执行以下操作：

| 禁止项 | 状态 |
|---|---|
| 修改 .opencode/skills/supervision-* 的 SKILL.md | 未执行 ✓ |
| 修改 agent.ts allowlist（添加 supervision-*） | 未执行 ✓ |
| 修改 xiaoxue-router.ts（添加 supervision-* regex） | 未执行 ✓ |
| 创建 .opencode/skills/supervision-assistant 等新 L0 入口 | 未执行 ✓ |
| 创建 .opencode/skills/.archive/ 目录 / 将 supervision-* 移入 | 未执行 ✓ |
| 创建空 knowledge/ 目录（伪造 .gitkeep） | 未执行 ✓ |
| 写入"看起来像真的"监督标准 / 模板 / 案例 | 未执行 ✓ |
| 把任何 supervision Skill 加入 Xiaoxue allowlist/router | 未执行 ✓ |

---

## 十三、P10 — Orphan 处置决策

按用户硬规则：orphan = 5 是真实且有价值的审计结果，不是必须修掉的错误。

**不允许通过以下方式消除 orphan**：
- 新增 allowlist
- 新增 router regex
- 新增 subagent 配置
- 注入 fake workflow

**orphan = 5 的真正含义**：
- 当前 runtime（agent.ts + xiaoxue-router.ts + configs/xiaoxue）确实不调度任何 supervision Skill
- 这是 audit snapshot 反映的当前事实
- Phase 3.2A 的判断：5 个 Skill 当前不具备执行条件，不应被调度

**orphan 何时会变化**：
- 如果未来补齐 knowledge/standards/INDEX.md + clauses.md → supervision-standard-lookup / supervision-photo-check 可执行
- 如果未来补齐 knowledge/templates/ → supervision-doc-check / supervision-issue-report 可执行
- 如果未来建立 knowledge/inspection_cases/ → supervision-case-collector / supervision-issue-report / supervision-standard-lookup 可执行
- 那时再考虑 allowlist / router 注册（独立 Gate，独立审计）

---

## 十四、P11 — Recommendation（最终建议）

```
activate: NO
repair:   DEFERRED (knowledge 资产补齐是业务决策，非技术任务)
retain disabled: YES (5/5 INCOMPLETE_STUB 状态保留)
archive:  NO (5/5 都有独立业务价值)
business review: REQUIRED
```

**下一步候选 Gate（任一即可启动，须用户明确授权）**：

1. **Gate X1: Knowledge Assets Bootstrap** — 业务侧决定是否投入资源补齐 knowledge/standards/ + knowledge/templates/ + knowledge/inspection_cases/。本 Gate 不属本审计范围。
2. **Gate X2: Design Freeze** — 在 knowledge 资产未到位前，5 个 Skill 保持现状冻结；不允许修改 SKILL.md 内容。
3. **Gate X3: 业务评审** — 监督中心确认 5 个 Skill 的业务优先级与发布计划，决定是否作为正式 release candidate。

---

## 十五、用户正式审核与冻结状态

2026-08-23 用户正式审核并通过本报告：`Phase 3.2A 我正式审核通过：PASS ✅`

确认核心判断：

```
supervision ≠ 重复 Skill 聚类
supervision = 一套尚未完成落地的业务能力链
```

**NOT A MERGE CLUSTER** — 用户明确批准此结论。5 个 Skill 形成清晰的业务链：

```
监督标准
   │
   ▼
standard-lookup
   │
   ├──────────────┐
   ▼              ▼
doc-check     photo-check
   │              │
   └──────┬───────┘
          ▼
     issue-report
          │
          ▼
   整改 / 闭环处置
          │
          ▼
    case-collector
          │
          ▼
      案例知识库
```

未来若真正落地，可能演进为 `supervision-assistant` orchestration，但底座（knowledge 资产）尚未准备好。

**冻结状态**：5 个 Skill 当前**既不应该 Archive，也不应该接入 Xiaoxue**。

---

## 十六、关联交付物

| 文件 | 用途 |
|---|---|
| `docs/skill-center/phase3.2-supervision-consolidation-cancelled-2026-08-23.md` | Phase 3.2 CANCELLED 正式记录（含 Portfolio 分类修正） |
| `docs/skill-center/phase3.2A-supervision-dependency-matrix-2026-08-23.tsv` | 23 行依赖矩阵（按 6 字段：referenced_path / referenced_by_skill / required_or_optional / exists / runtime_effect_if_missing / expected_source） |
| `docs/skill-center/phase3.2A-supervision-viability-audit-2026-08-23.md` | 本报告 |

## 十七、阶段关闭声明

Phase 3.2A 已完成 PASS（用户审核通过）。本阶段：
- 未修改任何 supervision Skill 的 SKILL.md
- 未修改 agent.ts / xiaoxue-router.ts / configs/xiaoxue/
- 未创建任何新 allowlist / router / subagent
- 未伪造任何 knowledge 资产
- 未启动任何 supervision Skill 接入 Xiaoxue
- **已修正 Portfolio 分类**：5 个 supervision Skill 从 `L3_INTERNAL` 调整为 `L4_DISABLED_FOR_XIAOXUE`

5 个 supervision Skill 在工作树中保持原状冻结，等待业务侧决定是否补齐 knowledge 资产。

---

**END OF PHASE 3.2A REPORT**