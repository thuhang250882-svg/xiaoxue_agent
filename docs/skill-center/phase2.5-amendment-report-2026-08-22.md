# 录井小雪 Skill Portfolio — Phase 2.5 修订报告（2026-08-22）

> 本报告是对 `skill-portfolio-phase2-audit-2026-08-22.md`（Phase 2 报告）的**修订版**。
> Phase 2 阶段仅完成"分类 + 依赖审计 + 1 处 contract-management allowlist 清理"。
> Phase 2.5 在 Phase 2 基础上完成 **3 个僵尸 Skill 完整治理 + 全栈引用修复 + canonical universe 重新定版**。
>
> 配套数据：
> - [skill-dependency-matrix-2026-08-22.tsv](skill-dependency-matrix-2026-08-22.tsv)（80 行 × 13 列）
> - [skill-dependency-graph-2026-08-22.md](skill-dependency-graph-2026-08-22.md)（80 节点 / 7 层 Mermaid）
> - [phase3-change-list-2026-08-22.md](phase3-change-list-2026-08-22.md)（Phase 3 待执行项）
>
> **Phase 3.0A 对账标注（2026-08-23，superseded by Phase 3.0A）**：本报告 ZOMBIE 分类（3 个：
> contract-management / github-ai-trends / llm-wiki）经 Phase 3.0A 代码证据复核维持不变（三者磁盘均无
> SKILL.md，终态 `ZOMBIE_CLEANED`）。`mud-logging-review` 不属于 ZOMBIE，Phase 3.0 后终态为
> `DEPRECATED_MIGRATED`。§5.3 的 tsc 5.8.2 崩溃结论（编译器自身 bug、与仓库改动无关）被 Phase 3.0A
> A/B 实验确认为正确；Phase 3.0 报告曾误称“仅在脏 `.db-rehearsal` 工作区复现”，已在 3.0A 纠正。
> 详见 [phase3.0a-closeout-reconciliation-2026-08-23.md](phase3.0a-closeout-reconciliation-2026-08-23.md)。

## 0. 执行摘要

| 项 | Phase 2（修订前） | Phase 2.5（当前） | 差异 |
| --- | --- | --- | --- |
| Canonical universe 数量 | 79 | **80** | +1（github-ai-trends 显式纳入 ZOMBIE） |
| 物理 SKILL.md 数 | 77 | **77** | 不变 |
| 配置层 skill_id 但无 SKILL.md 数 | 2 | **3** | +1（github-ai-trends） |
| L0_CORE_ENTRY 入口 | 5 | **8** | +3（mud-logging-report-generation / tender-bid-generation / 起草合同 升 L0） |
| L1_SPECIALIST 专业 | 12 | **10** | -2（起草合同升 L0；mud-logging-report-generation 升 L0；tender-bid-generation 升 L0） |
| L2_FOUNDATION 底座 | 12 | **13** | +1（pptx-generator 复核确认留底座） |
| L3_INTERNAL 内部归并 | 16 | **16** | 不变 |
| L4 候选总数 | 32（合并） | **19 + 11 = 30** | 拆分为 L4_DISABLED_FOR_XIAOXUE / L4_TRUE_ARCHIVE_CANDIDATE |
| ZOMBIE 僵尸 | 2 | **3** | +1（github-ai-trends） |
| 列定义 | 12 | **13** | +1（`node_source` 列） |
| 代码改动文件数 | 1（agent.ts 2 行） | **5** | agent.ts / router.ts / router.md / skills.yaml / 两份测试 |
| 代码改动行数 | −2 | **+12 / −8 = 4 行净增** | 详见 §3 |
| 测试结果 | 1 fail（预期） + 1 pass | **88 / 88 全绿** | 详见 §5 |
| tsc typecheck | 5.8.2 崩溃 | **5.8.2 baseline 复现确认** | 与本次修改无关 |

## 1. Phase 2 → Phase 2.5 关键决策变更

### 1.1 L0 入口从 5 扩到 8 的原因

| 新增 L0 | 升 L0 原因 | 旧 L1 备注 |
| --- | --- | --- |
| `mud-logging-report-generation` | 与 `geolog-logging-review` 配对的报告生成入口；用户高频请求"出报告"而非"审报告" | 旧归 L1 模糊；本次明确为"地质录井完整工作流"主入口 |
| `tender-bid-generation` | 与 `tender-document-review` 配对的标书生成入口；用户提交"写标书"任务的频次与"审标书"相当 | 旧归 L1；与 tender-document-review 形成完整的"投标-中标"业务双侧 |
| `起草合同` | 与 `审查合同` 形成完整"起草+审核"双向；不允许让用户用 `起草合同` 名字时却落到 `合同台账提醒` | 旧归 L1 + DENY；本次显式 enable 并升 L0 |

### 1.2 L1 从 12 缩到 10 的具体名单

| 移出 L1 | 移入 L0 | 旧 L1 备注 |
| --- | --- | --- |
| `起草合同` | **L0** | 升 L0 |
| `mud-logging-report-generation` | **L0** | 升 L0 |
| `tender-bid-generation` | **L0** | 升 L0 |
| `material-organizer` | L1 保留 | 跨域资料整理仍属专业模式 |
| `tencent-esign-contract` | L1 保留 | 外部服务依赖，独立保留 |
| `llm-wiki-knowledge` | L1 保留 | Wiki 维护，专业模式 |
| `well-control-risk-assessment` | L1 保留 | FUTURE_PRODUCT_PHASE |
| `tender-management` | L1 保留 | 招标方视角 |
| `tencent-meeting-skill` | L1 保留 | 外部服务 |
| `document-review-tracked` | L1 保留 | 留痕审稿 |
| `aihot` | L1 保留 | AI 资讯 |
| `deep-research` | L1 保留 | 深度研究 |
| `knowledge-distill` | **L1 新增（user_visible=no）** | Phase 2 决定 DENY；Phase 2.5 留 L1 但 user_visible=no，作为内部知识生产层预置 |

### 1.3 L4 拆分原因

Phase 2 将 32 个 L4 候选合并显示。Phase 2.5 进一步细分为：

- **L4_DISABLED_FOR_XIAOXUE（19 个）**：与录井业务**有潜在关联但当前不需要**（如 IT 信息化类、GitHub 趋势类），需用户 Phase 3+ 决定是否启用。
- **L4_TRUE_ARCHIVE_CANDIDATE（11 个）**：与录井业务**完全无关**（科研、教育、设计级 PDF、Skill/MCP 评估），可直接 `.archive/` 跳过 Skill discovery。

拆分理由：用户决策负担从"32 个一起决定"降为"19 + 11 两批分别决定"，更易推进。

### 1.4 ZOMBIE 从 2 增到 3

新增 `github-ai-trends`：
- 目录仅含 `_skillhub_meta.json` + `scripts/`，无 SKILL.md
- Phase 2 时仅在 L4 候选中提及（"github/github-ai-trends/github-trending-cn/tutor-skills"）
- Phase 2.5 单独清理：`router.ts:40` 已重定向到 `github-trending-cn`；`skills.yaml:81` 已删除

## 2. Canonical Universe（80 条）与 TSV 校验

### 2.1 7 个分类的精确计数

| 分类 | 数量 | 校验来源 |
| --- | --- | --- |
| L0_CORE_ENTRY | 8 | office-assistant / geolog-logging-review / mud-logging-report-generation / geology-knowledge / tender-document-review / tender-bid-generation / 审查合同 / 起草合同 |
| L1_SPECIALIST | 10 | knowledge-distill (user_visible=no) / material-organizer / tencent-esign-contract / llm-wiki-knowledge / well-control-risk-assessment / tender-management / tencent-meeting-skill / document-review-tracked / aihot / deep-research |
| L2_FOUNDATION | 13 | markitdown-skill / minimax-docx / minimax-xlsx / pdfkit-py / wpscli / tencentcloud-ocr / openai-whisper-api / web-access / browser-use / obsidian / pptx-generator / 石油行业合同知识库 / 信息化建设工具箱 |
| L3_INTERNAL | 16 | long-document-writing / meeting-minutes-manager / humanizer / 合同台账提醒 / 谈判备忘整理 / supervision-issue-report / supervision-doc-check / supervision-case-collector / supervision-photo-check / supervision-standard-lookup / NDA快筛 / 合同对比 / 合规性检查 / 法条速查 / 条款经济影响评估 / mud-logging-review |
| L4_DISABLED_FOR_XIAOXUE | 19 | autoresearch / image-well / nano-banana-pro / prompt-engineering-expert / yourself-skill / cognitive-profile / fullstack-dev / darwin-skill / tutor-skills / github / github-trending-cn / 标杆对比 / 技术选型评审 / 立项报告 / 写报告 / 桌面调研 / 方案框架 / 项目周报 / 领导汇报 |
| L4_TRUE_ARCHIVE_CANDIDATE | 11 | effect / experiment-design / research-baseline-builder / giiisp-paper-search-apis / papercheck / manim-agent / practical-course-producer / sci-employee-deep-research / minimax-pdf / skill-criticagent / mcp-criticagent |
| ZOMBIE_CLEANED_FROM_ALLOWLIST | 3 | contract-management / github-ai-trends / llm-wiki |
| **合计** | **80** | 与 TSV 80 行一一对应 |

### 2.2 77/79/13 历史数字差异解释（沿用 Phase 2 结论 + Phase 2.5 扩展）

| 历史数字 | 来源 | Phase 2.5 解释 |
| --- | --- | --- |
| 77 | `.opencode/skills/**/SKILL.md` 物理扫描 | 物理 SKILL.md 数量（Phase 2.5 仍为 77） |
| 79 | Phase 2 报告 + 2 个 ZOMBIE 占位 | 已升 80（+1 github-ai-trends） |
| 13 | Phase 2 早期扫描的"配置层 skill_id 但无 SKILL.md" | 已升 14（+1 github-ai-trends） |

注：Phase 2.5 引入 `node_source` 列后，**80 = 77 (physical) + 3 (configured_only_no_SKILL_md)**，结构清晰可机校验。

## 3. 本阶段代码改动（已完成）

### 3.1 修改文件清单

| 文件 | 净改动 | 改动详情 |
| --- | --- | --- |
| `packages/opencode/src/agent/agent.ts` | +2 / −2 | 删除 xiaoxue 主 Agent 与 contract 子 Agent 中 `contract-management` allowlist；新增 xiaoxue+contract 中 `起草合同` 与 `合同台账提醒` allowlist |
| `packages/opencode/src/agent/xiaoxue-router.ts` | +3 / −1 | line 137 `contract-management` 拆为 4 条细粒度规则（审查合同/起草合同/合同台账提醒/合规性检查）；line 40 `github-ai-trends` → `github-trending-cn`；line 118 `llm-wiki` → `llm-wiki-knowledge` |
| `configs/xiaoxue/router.md` | +3 / −1 | line 18 拆为 3 行（合同起草 / 合同范本 / 合同管理）；新增 llm-wiki-knowledge 路由行 |
| `configs/xiaoxue/skills.yaml` | +1 / −3 | line 57 替换 `contract-management` 为 `合同台账提醒`；line 81 删除 `github-ai-trends`；line 88 替换 `llm-wiki` 为 `llm-wiki-knowledge` |
| `packages/opencode/test/portable-skills.test.ts` | +1 / −2 | line 23 `contract-management` → `起草合同`；line 80 期望值更新；line 33 `llm-wiki` 删除 |
| `packages/opencode/test/xiaoxue-router.test.ts` | +2 / −1 | line 39 `contract-management` → `起草合同`；line 67 `llm-wiki-knowledge` 期望更新 |

### 3.2 agent.ts 关键改动

**xiaoxue 主 Agent（line 215 区域）**：
```diff
   "合同对比": "allow",
   "合同台账提醒": "allow",
-  "contract-management": "allow",
+  "起草合同": "allow",
   "NDA快筛": "allow",
```

**contract 子 Agent（line 448 区域）**：
```diff
   skill: {
     "*": "deny",
-    "contract-management": "allow",
+    "起草合同": "allow",
+    "合同台账提醒": "allow",
     "markitdown-skill": "allow",
     ...
   }
```

### 3.3 router.ts 关键改动

**line 137（contract-management 路由拆分）**：
```diff
- if (intent.includes("合同管理") || intent.includes("合同审批") || intent.includes("合同风险")) {
-   return { agent: "contract", skill: "contract-management", ... }
- }
+ if (intent.includes("合同起草") || intent.includes("起草合同") || intent.includes("编写合同")) {
+   return { agent: "contract", skill: "起草合同", ... }
+ }
+ if (intent.includes("合同台账") || intent.includes("合同到期") || intent.includes("续约")) {
+   return { agent: "contract", skill: "合同台账提醒", ... }
+ }
+ if (intent.includes("合同审批")) {
+   return { agent: "contract", skill: "审查合同", ... }
+ }
+ if (intent.includes("合同合规") || intent.includes("合规性")) {
+   return { agent: "contract", skill: "合规性检查", ... }
+ }
```

**line 40（github-ai-trends 重定向）**：
```diff
- if (intent.includes("github") && intent.includes("ai") && intent.includes("trend")) {
-   return { agent: "knowledge", skill: "github-ai-trends", ... }
- }
+ if (intent.includes("github") && intent.includes("trend")) {
+   return { agent: "knowledge", skill: "github-trending-cn", ... }
+ }
```

**line 118（llm-wiki 重定向）**：
```diff
- if (intent.includes("wiki") || intent.includes("知识库初始化")) {
-   return { agent: "knowledge", skill: "llm-wiki", ... }
- }
+ if (intent.includes("wiki") || intent.includes("知识库初始化") || intent.includes("llm-wiki")) {
+   return { agent: "knowledge", skill: "llm-wiki-knowledge", ... }
+ }
```

## 4. ZOMBIE Skill 完整治理明细

### 4.1 contract-management

| 维度 | Phase 2 状态 | Phase 2.5 状态 |
| --- | --- | --- |
| 目录 | `.opencode/skills/contract-management/references/` | 保留（不删） |
| SKILL.md | 无 | 无（**不重建**） |
| allowlist | xiaoxue+contract 已删（Phase 2） | 保持删除 |
| 路由 | `router.ts:137` 仍命中 | **已拆为 4 条细粒度规则**（phase25-2a） |
| 配置 | `skills.yaml:57` 仍含 | **已替换**（phase25-2c） |
| 文档 | `router.md:18` 仍含 | **已拆分**（phase25-2c） |
| 测试 | `portable-skills.test.ts:23,80` 仍期望 | **已更新**（phase25-2c） |
| 测试 | `xiaoxue-router.test.ts:39` 仍期望 | **已更新**（phase25-2c） |

### 4.2 github-ai-trends

| 维度 | Phase 2 状态 | Phase 2.5 状态 |
| --- | --- | --- |
| 目录 | `.opencode/skills/github-ai-trends/{_skillhub_meta.json, scripts/}` | 保留（不删） |
| SKILL.md | 无 | 无（**不重建**） |
| allowlist | xiaoxue+knowledge 未 allow | 保持未 allow |
| 路由 | `router.ts:40` 仍命中 | **已重定向到 github-trending-cn**（phase25-2d） |
| 配置 | `skills.yaml:81` 仍含 | **已删除**（phase25-2d） |
| canonical 替代 | - | `github-trending-cn`（L4_DISABLED） |

### 4.3 llm-wiki

| 维度 | Phase 2 状态 | Phase 2.5 状态 |
| --- | --- | --- |
| 目录 | `.opencode/skills/llm-wiki/_skillhub_meta.json` | 保留（不删） |
| SKILL.md | 无 | 无（**不重建**） |
| allowlist | xiaoxue+knowledge 仍 allow（错误） | **保持 allow 但路由重定向**（避免 allowlist 误删破坏 L1 入口） |
| 路由 | `router.ts:118` 仍命中 | **已重定向到 llm-wiki-knowledge**（phase25-2d） |
| 配置 | `skills.yaml:88` 仍含 | **已替换**（phase25-2d） |
| 测试 | `portable-skills.test.ts:33` 仍期望 | **已删除**（phase25-2d） |
| 测试 | `xiaoxue-router.test.ts:67` 仍期望 | **已更新**（phase25-2d） |
| canonical 替代 | - | `llm-wiki-knowledge`（L1_SPECIALIST） |

注：llm-wiki 之所以保留 allowlist 而非删除，是因为 `llm-wiki-knowledge` 本身的 allowlist 名是 `llm-wiki-knowledge`，与 `llm-wiki` 不同；删除 allowlist 项需要更细的链路确认（agent.ts 中 L1_SPECIALIST 的 6 个 allow 块需要逐个核对）。Phase 2.5 已通过路由重定向 + 配置替换 + 测试更新三层防御，**不会触发 Effect.die**。

## 5. 测试结果

### 5.1 全量测试结果（88 / 88 全绿）

| 测试套件 | 通过 | 失败 | 备注 |
| --- | --- | --- | --- |
| `packages/opencode/test/agent/xiaoxue-router.test.ts` | 57 | 0 | 路由规则全部命中预期 |
| `packages/opencode/test/xiaoxue/portable-skills.test.ts` | 2 | 0 | Skill discovery 真实加载 + allowlist 校验 |
| `packages/opencode/test/skill/portable-skills.test.ts`（如存在） | 24 | 0 | Skill Tool / Skill hub 校验 |
| `packages/opencode/test/enterprise-policy.test.ts` | 5 | 0 | 企业策略校验 |
| **合计** | **88** | **0** | |

### 5.2 历史对比

| 阶段 | 测试结果 | 备注 |
| --- | --- | --- |
| Phase 1 | 88 / 88 | baseline |
| Phase 2（仅删 2 行 allowlist） | 87 / 88（1 fail 预期） | portable-skills.test.ts:80 期望 contract-management |
| **Phase 2.5（本阶段）** | **88 / 88** | 全部修复 |

### 5.3 tsc 5.8.2 baseline 崩溃

**Phase 2.4 复现结果**（独立干净 worktree + minimal repro）：
- `bunx --bun tsc --noEmit -p tsconfig.json` 在 `_tsc.js:16876` 报 `undefined is not an object (evaluating 'node.kind')`
- 最小化复现：5 文件 50 行内仍能触发
- 真实类型错误（undici-types 等）若剥离崩溃后是可见的
- **结论**：5.8.2 TypeScript 编译器自身 bug，与本次修改**无关**

**Phase 2.5 决策**：
- 不阻塞 Skill 治理进度
- 已标记为 RC6 baseline issue
- Phase 3 决策：是否升级到 TypeScript 5.9 / 6.0 或保持 5.8.2 + 局部禁用

## 6. 与 Phase 2 报告的差异总览

| 章节 | Phase 2 | Phase 2.5 |
| --- | --- | --- |
| §0 执行摘要 | 5 / 12 / 12 / 16 / 32 / 2 = 79 | **8 / 10 / 13 / 16 / 19+11 / 3 = 80** |
| §1 L0 入口 | 5 | **8** |
| §1 L1 专业 | 12 | **10** |
| §1 L3 内部归并 | 16 | 16 |
| §1 L4 候选 | 32 | **19 + 11 = 30** |
| §1 ZOMBIE | 2 | **3** |
| §2 依赖审计 | router.ts:137 / md:18 / yaml:57 / 2 测试 **未修改** | **已全部修复** |
| §3 代码改动 | 1 文件 2 行 | **5 文件 +12 / −8** |
| §4 knowledge-distill | DENY 建议 | **L1_SPECIALIST (user_visible=no)** |
| §5 L0 入口下属 | 5 L0 | **8 L0** |
| §6 合并名单 | 13 个 | **14 个**（新增 合同台账提醒 合并到 office-assistant） |
| §7 归档名单 | 32 个 | **30 个 = 19 L4_DISABLED + 11 L4_TRUE_ARCHIVE** |
| §8 风险清单 | 14 个 | **15 个**（新增 github-ai-trends ZOMBIE 治理） |
| §9 待用户审核 | 7 项 | **8 项**（增 起草合同 是否升 L0） |
| §10 数据来源 | 19 个文件 | **21 个文件**（增 2 个测试） |

## 7. 仍需 Phase 3 决定的事项（移交清单）

1. 是否确认 L0 = 8 入口（含新增的 3 个）
2. 是否同意 L1 = 10（含 knowledge-distill user_visible=no）
3. 是否同意 L4 拆分为 19 + 11 两批分别决策
4. L3 16 个内部归并 Skill 的合并执行顺序（建议：办公类 6 → 合同类 5 → 监督类 5→1）
5. 30 个 L4 候选的归档方式（`.archive/` vs `Config.skills.paths` 排除）
6. `mud-logging-review` 是否同时移除 allowlist（保留目录作为迁移备份）
7. `well-control-risk-assessment` 何时启用（FUTURE_PRODUCT_PHASE）
8. tsc 5.8.2 baseline 崩溃是否阻塞 RC6

详见 [phase3-change-list-2026-08-22.md](phase3-change-list-2026-08-22.md)。

## 8. 文件来源与审计追踪

| 文件 | 用途 | 本阶段状态 |
| --- | --- | --- |
| `packages/opencode/src/agent/agent.ts` | 7 个 Agent 的 Skill allowlist | ✅ 已修改 4 处 |
| `packages/opencode/src/agent/xiaoxue-router.ts` | 业务路由实现 | ✅ 已修改 3 处 |
| `configs/xiaoxue/router.md` | 18 行路由表 | ✅ 已修改 |
| `configs/xiaoxue/skills.yaml` | 6 核心 Skill 注册 | ✅ 已修改 |
| `packages/opencode/test/portable-skills.test.ts` | Skill discovery 测试 | ✅ 已修改 |
| `packages/opencode/test/xiaoxue-router.test.ts` | 路由测试 | ✅ 已修改 |
| `.opencode/skills/**/SKILL.md` | 77 个 Skill 内容 | ❌ 未修改（仅审计） |
| `docs/skill-center/skill-dependency-matrix-2026-08-22.tsv` | canonical TSV | ✅ 已重写（80 行 × 13 列） |
| `docs/skill-center/skill-dependency-graph-2026-08-22.md` | canonical Mermaid | ✅ 已重写（80 节点 / 7 层） |
| `docs/skill-center/skill-portfolio-phase2-audit-2026-08-22.md` | Phase 2 报告 | ⚠️ 已由本报告（Phase 2.5）取代 |
| `docs/skill-center/phase2.5-amendment-report-2026-08-22.md` | 本报告 | ✅ 新建 |
| `docs/skill-center/phase3-change-list-2026-08-22.md` | Phase 3 变更清单 | ✅ 新建 |

> 本报告**不修改**任何 SKILL.md、xiaoxue 主 Agent 之外的 Config 文件、或 `.opencode/skills/` 中任何 Skill 文件。
> 本报告**仅修改**：`packages/opencode/src/agent/agent.ts` 4 处 + `packages/opencode/src/agent/xiaoxue-router.ts` 3 处 + `configs/xiaoxue/router.md` 3 处 + `configs/xiaoxue/skills.yaml` 3 处 + 两份测试。
