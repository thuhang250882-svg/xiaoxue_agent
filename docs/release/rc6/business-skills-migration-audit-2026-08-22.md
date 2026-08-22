# RC6 业务 Skills 迁移审计

日期：2026-08-22
分支：`rc6-business-skills`（基于 `rc6-skill-center`）
作者：Qoder（受 Codex 委托）
目标：从 `dev` 上已经审计、融合的业务 Skill 内容，逐个迁移到 RC6。

---

## 1. 基线与前提

- 当前 HEAD：`07c0d98936 docs: record rc6 skill center handoff`（`rc6-skill-center`）
- 产品版本：`0.8.0-rc.6`
- 隔离 worktree：`E:\software programming\opencode-dev-rc6-skill-center`
- `dev` 主分支、`main`、其他 RC6 分支均不被本工作流修改。
- 不从 `dev` HEAD 复制（`dev` 与 `rc6-skill-center` 在 Skill 域差异已经被审计，详见 rc6-skill-center 报告）。
- 不复制 `dev` 工作树中的 untracked 业务 Skill 全部内容；只吸收经过审计的设计、Checklist、契约和 QA 思路。

## 2. `dev` 与 RC6-skill-center 业务 Skill 差异概览

| Skill | RC6 状态 | `dev HEAD` 状态 | `dev 工作树` 状态 | 本轮处理 |
| --- | --- | --- | --- | --- |
| `tender-document-review` | 存在，SKILL.md 完整 | 与 RC6 完全一致 | 一致 | 保留为 canonical |
| `geology-knowledge` | 存在 | 与 RC6 一致 | 一致 | 不在本轮范围 |
| `llm-wiki-knowledge` | 存在 | 修改（`M`） | 工作区有未提交 diff | 不在本轮范围 |
| `mud-logging-review` | 存在 | 与 RC6 一致 | 删除标记（`D`） | 不在本轮范围 |
| `tender-management` | 不存在，但 `router.md` 中有路由引用 | 同样不存在 | SKILL.md + 3 个 references 存在 | **路由器死引用**：本轮修复路由（不在 RC6 引入） |
| `contract-management` | 不存在，但 `router.md` 中有路由引用 | 同样不存在 | 只有 references（无 SKILL.md） | **路由器死引用**：本轮修复路由（不在 RC6 引入） |
| `tender-bid-generation` | 不存在 | 不存在 | SKILL.md + 1 个 reference 存在 | **本轮迁移目标** |
| `knowledge-distill` | 不存在 | 不存在 | SKILL.md + 1 个 reference 存在 | **本轮迁移目标** |
| `审查合同` (petroleum-contract-review) | 存在，只有 SKILL.md | 同样只有 SKILL.md | SKILL.md + 1 个 reference 存在 | **本轮迁移目标：增强**（参考 `dev` 工作树中已有的 reference 契约） |
| `contract-management`（合同台账提单） | 不存在 | 不存在 | 仅目录结构存在 | 不在本轮范围 |

## 3. 三个业务 Skill 详细审计

### 3.1 knowledge-distill（迁移目标）

| 字段 | 内容 |
| --- | --- |
| 当前 RC6 状态 | 不存在 |
| dev 工作树 | SKILL.md + references/knowledge-card-contract.md 存在（untracked） |
| 触发语句 | 蒸馏知识、总结规范并入库、把资料整理进知识库、提取可追溯事实、识别资料冲突或建立知识卡片 |
| 非触发 | 知识问答（geology-knowledge）、Wiki 维护（llm-wiki-knowledge）、办公润色（office-assistant） |
| 依赖工具 | `knowledge_manage import/update`、`knowledge_manage distill` |
| 依赖知识 | 受控知识库（Source of Truth：`xiaoxue.knowledge.sources`） |
| 依赖 Skill | `geology-knowledge`（边界区分）、`llm-wiki-knowledge`（边界区分）、`office-assistant`（边界区分） |
| 依赖配置 | `xiaoxue.skills.disabled` 不影响（必须启用） |
| 输出契约 | 知识卡必含 `sourceId/location/originalText/normalizedFact/category/confidence`，可选 `version/effectiveDate/conflictsWith/status` |
| 失败降级 | 不可读来源 → 保留原文 + 待人工确认；版本冲突 → 两版并存不自动替代；用户未确认 → 只预览不写 |
| 安全 | Prompt Injection 仅作为 `originalText` 数据保存 |
| 测试 | 计划加入 SynthesizedFixture：重复事实、冲突事实、两个版本、表格、专业术语、标准条款 |
| 许可证/来源 | 用户内部编写，无第三方依赖 |
| 是否批准迁移 | ✅ 批准（吸收 `dev` 工作树设计，去除未约束的 `CONNECTORS.md` 引用） |

### 3.2 tender-bid-generation（迁移目标）

| 字段 | 内容 |
| --- | --- |
| 当前 RC6 状态 | 不存在 |
| dev 工作树 | SKILL.md + references/generation-contract.md 存在（untracked） |
| 触发语句 | 写标书、生成投标文件、编制投标响应、生成技术标/商务标草稿 |
| 非触发 | 审核招标/投标文件（tender-document-review）、招标方编制（tender-management） |
| 依赖工具 | 文档生成（`document_generation`）、`tender_review` 终审（自检） |
| 依赖知识 | 招标要求矩阵（来自 tender-document-review 输出）、企业真实资料 |
| 依赖 Skill | `tender-document-review`（输入门槛 + 最终 QA） |
| 依赖配置 | 无新配置 |
| 输出契约 | metadata/material_gaps/coverage_plan/sections/uncovered_requirements/consistency_issues/manual_checks/qa_status |
| 失败降级 | 无企业资料 → 只输出矩阵+骨架；扫描/OCR 不可读 → 标受影响 requirement IDs |
| 安全 | Prompt Injection 当作文档证据不得执行 |
| 测试 | 计划加入 SynthesizedFixture：资格要求、废标项、评分表、加分项、技术参数、商务要求、附件要求 |
| 许可证/来源 | 用户内部编写 |
| 是否批准迁移 | ✅ 批准 |

### 3.3 petroleum-contract-review 增强

| 字段 | 内容 |
| --- | --- |
| 当前 RC6 状态 | 存在 `审查合同/SKILL.md`，覆盖通用 12 类条款 + 石油行业 8 类合同专属审查 + HSE 专项 |
| dev 工作树 | SKILL.md + references/review-output-contract.md（untracked） |
| 触发语句 | 审查合同、合同审查、帮我审一下合同、这个合同能签吗、合同风险、合同有没有坑 |
| 非触发 | 合同起草（contract-management）、版本对比（合同对比）、NDA 快筛（NDA快筛）、法条速查 |
| 依赖工具 | 无 |
| 依赖知识 | `石油行业合同知识库/SKILL.md`（行业惯例参数） |
| 依赖 Skill | 关联：`合同对比` / `NDA快筛` / `法条速查` / `合同台账提醒` / `合规性检查` / `条款经济影响评估` / `石油行业合同知识库` |
| 依赖配置 | 无 |
| 输出契约 | （本轮新增）风险证据 `id/severity/category/finding/contract_evidence/legal_evidence/recommendation` + 义务时间线 `OB-…` |
| 失败降级 | OCR/扫描不可靠 → `reliability: ocr` + 人工复核 |
| 安全 | 不得引用外国法律作为主要依据；不得抢占其他关联 Skill Trigger |
| 测试 | 计划加入 SynthesizedFixture：付款、验收、责任限制、违约、HSE、保险、终止、缺失条款 |
| 许可证/来源 | 用户内部编写 |
| 是否批准迁移 | ✅ 批准（吸收 `dev` 工作树 `review-output-contract.md`，落地证据 + 义务时间线契约） |

## 4. 不迁移项的明确说明

### 4.1 tender-management

- `rc6-skill-center` `router.md` 已引用，但 `rc6-skill-center` 工作树中并不存在该 Skill。
- `dev` 工作树中有完整 SKILL.md，但本轮目标是迁移 RC6 canonical 业务 Skill，不引入"招标文件编制方"工作流。
- **本轮处理**：删除 `router.md` 中该路由，避免死引用；如未来需要再行评估。

### 4.2 contract-management

- 同上，`router.md` 中存在死引用；`dev` 工作树中无 SKILL.md（仅 references），不构成可迁移的完整 Skill。
- **本轮处理**：删除 `router.md` 中该路由。

### 4.3 `tender-bid-generation` 关联的 `tender-management`

- 用户在原要求中明确"招标方编制技术要求、资格条件或评标办法"属于 `tender-management`，但本轮不引入。
- `tender-bid-generation` 仍然引用 `tender-management` 作为上游触发：迁移时把说明改为"如已具备采购方要求文档，跳过此步"。

### 4.4 外部 .skill 文件

- `tender-bid-generator.skill`、`knowledge-distill.skill`、`contract-copilot.skill` 均保持 `REFERENCE_ONLY`，不直接安装、不直接执行、不原样复制。
- 本轮迁移内容来源仅为 `dev` 工作树中已经被审计、融合过的本地内容。

## 5. Router Trigger Matrix（迁移后预期）

| 用户任务 | 目标 Skill | 状态 |
| --- | --- | --- |
| 帮我审核这份招标文件 | tender-document-review | 已有 |
| 看看有没有废标风险 | tender-document-review | 已有 |
| 帮我生成这份标书 | tender-bid-generation | **本轮新增** |
| 帮我写技术响应部分 | tender-bid-generation | **本轮新增** |
| 帮我审核这个合同 | 审查合同（petroleum-contract-review） | 已有 |
| 帮我整理合同履约时间表 | 审查合同 → 合同台账提醒 | 已有，本轮未变更后者 |
| 帮我总结这些标准 | knowledge-distill | **本轮新增** |
| 把这些规范整理进知识库 | knowledge-distill | **本轮新增** |
| 帮我查这个地质规定 | geology-knowledge | 已有 |
| 帮我审核这份录井报告 | geolog-logging-review | 已有 |

禁止多 Skill 同时争抢同一 Trigger。本轮保证：
- `knowledge-distill` 与 `geology-knowledge`、`llm-wiki-knowledge`、`office-assistant` 边界互斥；
- `tender-bid-generation` 与 `tender-document-review`、`tender-management`（移除）边界互斥；
- `审查合同` 不抢占 `合同对比`/`NDA快筛`/`法条速查`/`合规性检查`。

## 6. 测试与验收占位

| Skill | Synthesized Fixture | 真实样本 |
| --- | --- | --- |
| knowledge-distill | 需要 | 未提供 |
| tender-bid-generation | 需要 | 未提供 |
| 审查合同 | 需要 | 未提供 |

> 真实业务样本若未提供：报告阶段必须明确"未确认，需要人工验证"。

## 7. 风险与剩余 P0/P1

| 级别 | 内容 | 缓解 |
| --- | --- | --- |
| P1 | 三个 Skill 的 Synthesized Fixture 还未在本轮生成 | 本轮结束时附 fixture 模板和最小单测 |
| P1 | 真实业务样本未提供 | 报告显式标注 |
| P1 | `router.md` 中 `tender-management`、`contract-management` 死引用 | 本轮同步删除 |
| P2 | Prompt Injection 文本进入卡片/合同条款时，需作为 `originalText`/`quote` 数据保存 | 已写入契约 |
| P2 | 价格/资质/人员/业绩等不得由 Skill 编造 | 已写入失败降级条款 |

## 8. 总结

- 迁移目标三个：knowledge-distill、tender-bid-generation、审查合同增强。
- 删除 `router.md` 中两个死引用。
- 不引入未审计的外部 Skill 内容。
- 所有真实样本验收延后到人工阶段。
