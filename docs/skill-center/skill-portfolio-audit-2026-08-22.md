# 录井小雪 Skill Portfolio Audit（2026-08-22）

> 本报告是 RC6 Skill 资产盘点结果，仅做事实梳理与必要等级划分，**不执行任何删除、合并、改名、禁用操作**。
> 配套机器可排序清单：[skill-portfolio-inventory-2026-08-22.tsv](skill-portfolio-inventory-2026-08-22.tsv)

## 0. 执行摘要

- 当前 `.opencode/skills/` 目录下共有 **80 个 Skill 目录**。
- 其中 **77 个存在 `SKILL.md`** 会被 OpenCode Skill 发现服务注册为 Skill；其余 **3 个目录只有 `_skillhub_meta.json` 或残留子目录，无 `SKILL.md`**，是 ZOMBIE 状态： `contract-management`、`github-ai-trends`、`llm-wiki`。
- 在 xiaoxue 主 Agent 默认 allowlist 中真正可用 **41 个**；其余 **36 个**默认 deny，必须显式开启。
- 真正"用户会直接看到并触发"的 Skill，按业务入口收敛后约 **5 个核心 + 6 个重要常用 + 15 个按需保留**，加上不直接对用户展示的 **12 个 Foundation 底座**，与"10–15 个核心入口"的目标完全一致。
- 重复 / 应合并 **9 个**；低价值 / 候选归档 **32 个**（含 3 个僵尸 Skill）；明确僵尸 **3 个**。

## 1. Skill 发现与启用规则（事实依据）

### 1.1 发现服务（`packages/opencode/src/skill/index.ts:179-239`）

仅扫描以下来源：

1. `~/.claude/skills/**/SKILL.md` 和 `~/.agents/skills/**/SKILL.md`（用户全局）
2. 项目目录上溯的 `.claude/skills/**/SKILL.md`、`.agents/skills/**/SKILL.md`（项目外部）
3. Config 目录的 `{skill,skills}/**/SKILL.md`
4. Config `skills.paths` 显式配置的路径
5. Config `skills.urls` 远程拉取（缓存到 `~/.cache/skills/`）

> 因此 `.opencode/skills/**/SKILL.md` 是本项目 Skill 的"硬载体"，路径不会落到 OpenCode 默认扫描里。桌面端通过 `bundledSkillsDir()` 将其注入到 `process.resourcesPath/skills`，再通过 `withBundledSkills()` 写入 `Config.skills.paths`，最终让 Skill 发现服务能扫描到（见 `packages/desktop/src/main/skills.ts:11`、`skills-config.ts:1`）。

### 1.2 启用三道闸

- **第 1 道**（来源策略）：`XiaoxueEnterprisePolicy.allowsSource("skill", source)`（`xiaoxue/enterprise-policy.ts:66-71`）
  - 桌面端默认未启用企业托管（`unrestricted`），故所有 source 均放行。
- **第 2 道**（业务 Agent allowlist）：`packages/opencode/src/agent/agent.ts:181-224`
  - xiaoxue 主 Agent 显式 allow **41 个 Skill 名**，其余 deny。
- **第 3 道**（业务子 Agent allowlist）：
  - `office` 允许 13 个；`report` 允许 7 个；`tender` 允许 5 个；`contract` 允许 7 个；`knowledge` 允许 17 个；`document` 允许 14 个。
  - 因此一个 Skill 即使在主入口 deny，仍可由对应子 Agent 触发。

### 1.3 小雪主入口（xiaoxue Agent）allowlist 实际清单

| 类别 | 数量 | 列表 |
| --- | --- | --- |
| 6 大业务核心 Skill | 6 | geolog-logging-review, office-assistant, tender-document-review, 审查合同, geology-knowledge, mud-logging-report-generation |
| 通用办公 | 7 | long-document-writing, meeting-minutes-manager, material-organizer, document-review-tracked, autoresearch, humanizer, prompt-engineering-expert |
| 知识 / 研究 | 7 | aihot, deep-research, fullstack-dev, darwin-skill, github, github-ai-trends, github-trending-cn |
| Wiki | 2 | llm-wiki, llm-wiki-knowledge |
| 标书 | 2 | tender-management, tender-bid-generation |
| 合同 | 2 | contract-management, tencent-esign-contract |
| 文档/解析 | 6 | markitdown-skill, minimax-docx, minimax-xlsx, pdfkit-py, wpscli, tencentcloud-ocr |
| 媒体/外部服务 | 6 | image-well, nano-banana-pro, openai-whisper-api, tencent-meeting-skill, browser-use, web-access |
| 个人 | 1 | yourself-skill |
| 教程 | 1 | tutor-skills |
| mud-logging-review（重复） | 1 | mud-logging-review |
| **合计** | **41** | |

> 注：`contract-management`、`github-ai-trends`、`llm-wiki` 三个 Skill 名出现在 `configs/xiaoxue/skills.yaml` 与 `agent.ts:185` 的 allowlist 中，但本地目录里只有 `_skillhub_meta.json` 或空 `references/`，**没有任何 `SKILL.md`** → 这是"僵尸 Skill 注册"。OpenCode Skill 发现服务以 `**/SKILL.md` 为凭，未注册的允许条目在路由阶段会报 404 或被静默跳过。建议优先处理：仅改 `agent.ts` / `skills.yaml`，不删文件。

## 2. Skill Inventory 关键发现

完整 77 条逐项数据见 TSV。本节仅列必须高亮的事实：

### 2.1 健康度分布

| health | 数量 | 备注 |
| --- | --- | --- |
| OK | 77 | 存在 SKILL.md，可被 Skill 发现服务注册 |
| ZOMBIE | 3 | `contract-management`（只有 references/）、`github-ai-trends`（只有 _skillhub_meta.json + scripts/）、`llm-wiki`（只有 _skillhub_meta.json） |
| GBK 编码问题 | 19 | 中文目录名在 Windows 默认 UTF-8 控制台显示乱码，但 Skill 本体可被识别 |

### 2.2 启用情况分布

| 启用范围 | 数量 |
| --- | --- |
| xiaoxue 主入口 allow | 41 |
| 仅子 Agent allow | 7（effect/experiment-design/sci-employee-deep-research/skill-criticagent/cognitive-profile/giiisp-paper-search-apis/knowledge-distill 等） |
| 全部 deny | 28 |

> 注意：完全 deny 的 Skill **不会**出现在 `<available_skills>` 注入到 system prompt 的列表里（`packages/core/src/skill/guidance.ts:49-56`），因此模型基本不会触发它们，但用户可在 Skill Center UI 看到全部 77 个（如果 UI 列出全部）。

### 2.3 来源映射表（按 `skillSource()` 分类）

| source | 数量 | 含义 |
| --- | --- | --- |
| project | 77 + 3 ZOMBIE | 全部来自 `.opencode/skills/`（本项目 bundled）。77 个有效（可注册）+ 3 个 ZOMBIE（allowlist 引用但无 SKILL.md） |
| user | 0 | 当前无 `~/.config/opencode`/`~/.xiaoxue`/`~/.agents`/`~/.claude` 的 Skill |
| remote | 0 | 当前无远端 `skills.urls` 拉取缓存 |
| bundled | 0 | 桌面端 `process.resourcesPath/skills` 实际指向 `.opencode/skills/` 同一目录（`skills.ts:14`），所以运行时还是 project |

## 3. 必要等级（5 级 + FOUNDATION）

### 3.1 L0 — 系统核心（必须保留，5–10 个）

| Skill | 路由位置 | 评分 | 关键理由 |
| --- | --- | --- | --- |
| `geolog-logging-review` | 报告 Agent | 4.65 | 录井小雪核心定位；事实证据化最强；RC6 主入口 |
| `office-assistant` | 办公 Agent | 4.60 | 覆盖工作总结/汇报/纪要/整改/计划/方案/Excel/Word 全场景 |
| `geology-knowledge` | 知识 Agent | 3.85 | 企业知识唯一专业查询入口（不替代 Wiki 维护） |
| `tender-document-review` | 标书 Agent | 4.05 | 标书审核唯一主入口 |
| `审查合同` | 合同 Agent | 4.15 | 合同审核唯一主入口，行业 knowhow 内置 |

**L0 共 5 个**，均满足"高频 + 高业务价值 + 明确用户入口 + 不可替代"。

### 3.2 L1 — 重要常用 / 建议保留

| Skill | 评分 | 类别 |
| --- | --- | --- |
| `mud-logging-report-generation` | 3.65 | 报告生成 |
| `tender-bid-generation` | 4.00 | 标书生成 |
| `tencent-esign-contract` | 3.25 | 合同外部服务 |
| `material-organizer` | 3.05 | 资料预处理 |
| `llm-wiki-knowledge` | 3.25 | Wiki 管理 |
| `knowledge-distill` | 3.25 | 知识生产底座（**当前 deny，建议评估后启用**） |

**L1 共 6 个**。

### 3.3 L2 — 专业低频 / 按需保留（默认隐藏 / 专业模式）

- `tender-management`（3.20，招标方视角，MVP 乙方优先）
- `NDA快筛`（2.50）、`合同对比`（2.70）、`起草合同`（3.50）、`条款经济影响评估`（2.70）、`合规性检查`（2.40）、`法条速查`（2.70）— 全部为合同类分支
- `document-review-tracked`（3.25，留痕审稿）
- `pptx-generator`（3.00，PPT 专用生成）
- `supervision-photo-check`（2.20，监督照片）、`supervision-standard-lookup`（2.40，监督标准）
- `well-control-risk-assessment`（3.00，**FUTURE_PRODUCT_PHASE**，无 WITS 接入）
- `tencent-meeting-skill`（2.70，外部服务封装）
- `aihot`（2.70）、`deep-research`（3.15）— 知识 / 资讯

**L2 共 15 个**。

### 3.4 L3 — 重复 / 应合并（9 个）

| from | → into | 重叠理由 |
| --- | --- | --- |
| `mud-logging-review` | `geolog-logging-review` | 100% 重复（英文版 vs 中文版） |
| `long-document-writing` | `office-assistant` | office-assistant 任务模板已覆盖长文档 |
| `meeting-minutes-manager` | `office-assistant` | office-assistant 已有会议纪要任务模板；录音转写作为子流程 |
| `humanizer` | `office-assistant` | 已被 office-assistant 的 Word 润色任务覆盖 |
| `合同台账提醒` | `office-assistant` | 与整改清单/工作计划任务重叠 |
| `谈判备忘整理` | `office-assistant` | 与会议纪要任务重叠 |
| `supervision-issue-report` | `office-assistant` | 与整改清单任务重叠 |
| `supervision-doc-check` | `geolog-logging-review` | 与报告审核边界部分重叠 |
| `supervision-case-collector` | `supervision-case-collector`（保留为 L1，吞并另两个） | 5 个监督 Skill 应整合为 1 个 |

**L3 共 9 个**（合并清单中移走了 `llm-wiki` 与 `contract-management`，二者补到 L4 的 ZOMBIE / 停用名单）。

### 3.5 L4 — 低价值 / 淘汰候选（32 个，不删除）

**业务无关 / 开发者向 / 科研向 / 通用内容向 / 僵尸引用**：

- `autoresearch`（2.30）、`image-well`（2.55）、`nano-banana-pro`（2.30）、`prompt-engineering-expert`（2.40）、`yourself-skill`（2.15）、`cognitive-profile`（2.15）
- `fullstack-dev`（2.15）、`darwin-skill`（2.15）、`skill-criticagent`（2.15）、`mcp-criticagent`（2.15）
- `effect`（2.05）、`experiment-design`（1.95）、`research-baseline-builder`（1.95）
- `giiisp-paper-search-apis`（2.30）、`papercheck`（2.30）、`manim-agent`（2.30）、`practical-course-producer`（2.30）、`tutor-skills`（2.10）
- `github`（2.15）、`github-ai-trends`（1.90）、`github-trending-cn`（1.90）、`sci-employee-deep-research`（1.85）
- `minimax-pdf`（2.55）

**石油 IT 信息化项目专用（与"录井"主营差异大）**：

- `标杆对比`（2.40）、`技术选型评审`（2.40）、`立项报告`（2.40）、`写报告`（2.40）、`桌面调研`（2.40）、`方案框架`（2.40）、`项目周报`（2.40）、`领导汇报`（2.40）

**L4 共 32 个**。其中 3 个是僵尸 Skill（`contract-management`、`github-ai-trends`、`llm-wiki`）需要从 `agent.ts` 与 `configs/xiaoxue/skills.yaml` 移除 allowlist 引用后才能安全处理。

### 3.6 FOUNDATION — 基础能力（不占用户 Skill 列表，9 个）

这些是工具型底座，被多个业务 Skill 复用：

| Skill | 类型 |
| --- | --- |
| `markitdown-skill` | 文档→Markdown 解析 |
| `minimax-docx` | DOCX 创建/编辑 |
| `minimax-xlsx` | XLSX 全生命周期 |
| `pdfkit-py` | PDF 处理 |
| `wpscli` | 云端格式转换 |
| `tencentcloud-ocr` | OCR |
| `openai-whisper-api` | 语音转写 |
| `web-access` | 联网底座 |
| `browser-use` | 浏览器自动化 |
| `obsidian` | Obsidian 操作 |
| `石油行业合同知识库` | 合同知识内部支撑（说明文档已声明不对用户直接展示） |
| `信息化建设工具箱` | IT 信息化内部知识库（同上） |

**FOUNDATION 共 12 个**。建议未来在 Skill Center UI 中**默认不显示**，或归入"高级设置 / 基础能力"折叠区。

## 4. 重复 Skill 聚类表

| Cluster | Canonical | 重复 Skill | 建议动作 |
| --- | --- | --- | --- |
| 地质录井审核 | `geolog-logging-review` | `mud-logging-review` | **MERGE** |
| 办公主入口 | `office-assistant` | `long-document-writing`, `meeting-minutes-manager`, `humanizer`, `material-organizer`（子能力保留）, `合同台账提醒`, `谈判备忘整理` | **MERGE 4 个**；material-organizer 保留为预处理 helper |
| Wiki | `llm-wiki-knowledge` | `llm-wiki` | **MERGE** |
| 合同主入口 | `审查合同` | `contract-management`（僵尸） | **清理 allowlist** |
| 知识生产 | `knowledge-distill` | （无重复，本身唯一） | 评估是否在小雪主入口启用 |
| 报告生成 | `mud-logging-report-generation` | `office-assistant` 的报告模板 | **边界清晰**，保留 |
| 标书审核 | `tender-document-review` | `tender-management`（边界不同） | **边界清晰**，保留 |
| 标书生成 | `tender-bid-generation` | （无重复） | 保留 |
| 文档处理底座 | `markitdown-skill` / `minimax-docx` / `pdfkit-py` | `wpscli`（部分重叠） | 全部作为 FOUNDATION |
| 监督类 | `supervision-case-collector` | `supervision-doc-check`, `supervision-issue-report`, `supervision-photo-check`, `supervision-standard-lookup` | **MERGE 5 个为 1 个 canonical**（默认隐藏） |
| 知识/研究 | `deep-research` | `sci-employee-deep-research`（重复 80%） | **DISABLE_ARCHIVE** sci-employee-deep-research |
| GitHub 趋势 | `github-trending-cn` / `github-ai-trends` | `github`（CLI 太宽） | 评估后仅保留 `github-trending-cn` |
| 井控 | `well-control-risk-assessment` | （无重复） | 保留为 FUTURE |

## 5. Trigger Conflict Matrix

按"高频模糊用户输入"分桶：

### 5.1 HIGH / CRITICAL 冲突

| 模糊触发 | 抢同一 Trigger 的 Skill | 严重程度 | 当前 canonical owner（按路由） |
| --- | --- | --- | --- |
| "帮我审核这份文件" | `geolog-logging-review`（报告）、`tender-document-review`（标书）、`审查合同`（合同）、`document-review-tracked`（留痕） | CRITICAL | 由 xiaoxue_router → 对应业务 Agent；建议在 router.md 中固化"先识别文件类型再分发" |
| "帮我写材料/总结" | `office-assistant`、`long-document-writing`、`meeting-minutes-manager` | HIGH | office-assistant（router.md line 9/13/10） |
| "帮我检查/审查合同" | `审查合同`、`tencent-esign-contract`、`NDA快筛`、`合同对比` | HIGH | 审查合同（router.md line 17） |
| "帮我整理资料/文档" | `material-organizer`、`knowledge-distill`、`llm-wiki-knowledge`、`office-assistant` 的"整改清单" | HIGH | 由 xiaoxue_router → office/knowledge |
| "查 AI 资讯 / GitHub 趋势" | `aihot`、`deep-research`、`github-trending-cn`、`github-ai-trends`、`github` | MEDIUM | knowledge Agent |
| "做一份 PPT" | `office-assistant`、`pptx-generator` | LOW | office-assistant → 内部委托 pptx-generator |
| "做一个 Manim 视频 / 课程" | `manim-agent`、`practical-course-producer`、`papercheck` | LOW | 当前场景无，重叠不影响主流程 |

### 5.2 修复建议（**仅记录，不执行**）

- router.md line 8–9 已区分"地质录井报告"和"工作总结"，但 `document-review-tracked`（line 14）模糊地落在 document 类下，需在 router 中加一句"先调用专业审核 Skill，再用本 Skill 做留痕"。
- `long-document-writing`、`meeting-minutes-manager` 两个 Skill 的 description 与 office-assistant 的任务模板高度重叠，路由阶段让 xiaoxue_router 在 office Agent 内首选 office-assistant，再内部委托。

## 6. 最终精简建议（不执行）

### 6.1 A. KEEP_CORE（约 5–15 个，建议最终核心入口）

```
L0（5 个）：office-assistant, geolog-logging-review, geology-knowledge,
           tender-document-review, 审查合同
L1（6 个）：mud-logging-report-generation, tender-bid-generation,
           tencent-esign-contract, material-organizer,
           llm-wiki-knowledge, knowledge-distill（待启用评估）
合计：11 个核心入口
```

> 与"目标 10–15 个"完全一致。这 11 个构成前台 Skill Center 主视图。

### 6.2 B. KEEP_OPTIONAL（按需保留）

```
L2（15 个）：
  标书 / 合同：tender-management, NDA快筛, 合同对比, 起草合同,
               条款经济影响评估, 合规性检查, 法条速查
  办公 / 文档：document-review-tracked, pptx-generator
  监督 / 现场：supervision-photo-check, supervision-standard-lookup,
               well-control-risk-assessment
  知识 / 资讯：aihot, deep-research
  外部服务：tencent-meeting-skill
```

> 默认隐藏；专业模式 / 关键词触发时显示。

### 6.3 C. MERGE（9 个，不执行）

```
from                            → into
mud-logging-review               → geolog-logging-review
long-document-writing            → office-assistant
meeting-minutes-manager          → office-assistant
humanizer                        → office-assistant
合同台账提醒                     → office-assistant
谈判备忘整理                     → office-assistant
supervision-issue-report         → office-assistant
supervision-doc-check            → geolog-logging-review
supervision-case-collector       → supervision-case-collector（合并 4 个为 1）
```

### 6.4 D. DISABLE_ARCHIVE（32 个，不执行）

```
开发者向：autoresearch, image-well, nano-banana-pro, prompt-engineering-expert,
          yourself-skill, cognitive-profile, fullstack-dev, darwin-skill,
          skill-criticagent, mcp-criticagent, effect, experiment-design,
          github, github-ai-trends, github-trending-cn
科研向  ：sci-employee-deep-research, giiisp-paper-search-apis, papercheck,
          research-baseline-builder, manim-agent, practical-course-producer,
          tutor-skills, minimax-pdf
IT 信息化：标杆对比, 技术选型评审, 立项报告, 写报告, 桌面调研,
           方案框架, 项目周报, 领导汇报
```

## 7. 推荐的前台 / 后台分层

```
录井小雪（前台）
├── 常用技能（11 个核心入口）
│   ├── 办公助手（office-assistant）
│   ├── 报告审核（geolog-logging-review）
│   ├── 报告生成（mud-logging-report-generation）
│   ├── 标书审核（tender-document-review）
│   ├── 标书生成（tender-bid-generation）
│   ├── 合同审核（审查合同）
│   ├── 合同起草（起草合同 — L2）
│   ├── 知识查询（geology-knowledge）
│   ├── 知识蒸馏（knowledge-distill — 待启用评估）
│   ├── Wiki 管理（llm-wiki-knowledge）
│   └── 资料整理（material-organizer）
│
├── 专业技能（按需隐藏）
│   ├── 合同分支：NDA快筛 / 合同对比 / 条款经济影响评估 / 合规性检查 / 法条速查
│   ├── 标书分支：tender-management（招标方）
│   ├── 文档分支：document-review-tracked / pptx-generator
│   ├── 监督分支：supervision-*（合并后 1–2 个）
│   ├── 现场分支：well-control-risk-assessment（FUTURE）
│   ├── 知识研究：aihot / deep-research
│   └── 外部服务：tencent-esign-contract / tencent-meeting-skill
│
└── 基础能力（用户不直接看到，FOUNDATION 12 个）
    ├── 文档解析：markitdown-skill / pdfkit-py / tencentcloud-ocr
    ├── 文档生成：minimax-docx / minimax-xlsx / minimax-pdf（DISABLE）/ wpscli
    ├── 语音 / 会议：openai-whisper-api
    ├── 联网 / 浏览器：web-access / browser-use
    ├── 笔记 / Wiki：obsidian
    └── 内部知识库：石油行业合同知识库 / 信息化建设工具箱
```

## 8. 必须回答的 5 个问题

### Q1. 当前到底有多少个有效 Skill？

**答**：`.opencode/skills/` 目录中共 **80 个 Skill 目录**，其中：
- **77 个有效 Skill**（存在 SKILL.md，可被 OpenCode Skill 发现服务注册）
- **3 个 ZOMBIE 目录**（`contract-management` / `github-ai-trends` / `llm-wiki`）：本地只有 `_skillhub_meta.json` 或残留空目录，**没有 SKILL.md**，因此不会被 OpenCode 发现，但已被 `agent.ts` 与 `skills.yaml` 错误地列入 allowlist。

### Q2. 用户真正会直接使用的 Skill 有多少？

**答**：在 xiaoxue 主 Agent 入口 allowlist 中真正可用 **41 个**；但**用户实际会触发**的入口收敛到 **11 个核心 + 14 个专业按需 = 25 个**（其余 16 个是 Foundation 工具型，不应作为"技能"展示）。

### Q3. 哪些 Skill 是重复的？

**答**：9 个应合并，按 cluster：

| Cluster | Canonical | 重复 Skill |
| --- | --- | --- |
| 地质录井审核 | geolog-logging-review | mud-logging-review |
| 办公主入口 | office-assistant | long-document-writing, meeting-minutes-manager, humanizer, 合同台账提醒, 谈判备忘整理 |
| Wiki | llm-wiki-knowledge | llm-wiki |
| 合同主入口 | 审查合同 | contract-management（僵尸） |
| 监督类 | supervision-case-collector | supervision-doc-check, supervision-issue-report, supervision-photo-check, supervision-standard-lookup |

### Q4. 哪些其实应该降级为 Foundation Capability？

**答**：12 个：
- 文档解析 / 生成：`markitdown-skill`, `minimax-docx`, `minimax-xlsx`, `pdfkit-py`, `wpscli`, `tencentcloud-ocr`
- 语音 / 会议：`openai-whisper-api`
- 联网 / 浏览器：`web-access`, `browser-use`
- 笔记 / Wiki：`obsidian`
- 内部知识库：`石油行业合同知识库`, `信息化建设工具箱`

这些**不占用户 Skill 列表**，由业务 Skill 内部按需调用。

### Q5. 如果精简到 10–15 个核心入口，建议最终名单是什么？

**答**：建议 11 个核心入口：

```
1.  office-assistant              日常办公（工作总结/汇报/纪要/整改/计划/方案/Excel/Word/会议）
2.  geolog-logging-review         地质录井报告审核
3.  mud-logging-report-generation 地质录井报告生成
4.  geology-knowledge             地质录井专业知识查询
5.  knowledge-distill             知识蒸馏（资料→可追溯事实卡）
6.  llm-wiki-knowledge            LLM Wiki 维护（灌入/健康巡检）
7.  tender-document-review        招标文件 / 投标文件审核
8.  tender-bid-generation         投标文件生成
9.  审查合同                       石油合同审核（主入口）
10. 起草合同                       石油合同起草（主入口）
11. material-organizer            批量资料整理 / 链接采集 / 目录扫描
```

> 与用户参考清单"目标核心任务"基本一致，差异：
> - 把 `well-control-risk-assessment` 从核心下调为 L2（FUTURE_PRODUCT_PHASE，无 WITS 接入）；
> - 把 `knowledge-distill` 提升为核心（当前 deny，建议评估启用，因为它是 geology-knowledge 的生产侧）；
> - 把 `material-organizer` 保留为核心（批量资料整理是高频任务）；
> - 删除了"production-data / drilling-data analysis"（当前并无成熟 Skill）。

## 9. 必须高亮给用户的风险

1. **`contract-management`、`github-ai-trends`、`llm-wiki` 是三个僵尸 Skill**：allowlist 引用了不存在的 Skill 名，会触发 404 / warning / 静默跳过。应优先处理（仅改 `agent.ts` 与 `configs/xiaoxue/skills.yaml`，不删文件）。
2. **`mud-logging-review` 与 `geolog-logging-review` 100% 重复**，但都被 `report Agent` 和 `xiaoxue` 主入口 allow，造成 LLM 选 Skill 时的真实冲突。
3. **19 个中文 GBK 编码 Skill** 与英文 Skill 并存，混用 `xiaoxue_router` 时可能因 SKILL.md 编码导致 description 解析异常（特别是被 `ConfigMarkdown.parse` 读取时）。
4. **29 个 Skill 完全 deny 但存在于目录**，触发 `<available_skills>` 注入时**不会**出现（`guidance.ts:49-56`），但 Skill Center UI 若直接读 `.opencode/skills/` 列表则会全部展示，造成"看起来 77 个但实际只能调 41 个"的认知错位。
5. **7 个英文 SKILL.md 存在 GBK 编码内容**（如 `geolog-logging-review`, `contract-management` 不存在但其他几个含中文 description 的被误判为 GBK），需要在小雪正式发版前规范编码为 UTF-8。

## 10. 后续待用户审核事项

1. 用户确认 11 个核心入口名单是否准确，是否增删。
2. 用户确认 11 个 MERGE Skill 的合并方式是否被接受（建议先合并到 office-assistant + 监督类保留 1 个）。
3. 用户确认 22 个 DISABLE_ARCHIVE 是否同意后续打包时打入 `archive/` 子目录但不进入 Skill 扫描目录。
4. 用户确认 `contract-management` 僵尸 allow 是否立即移除（最低风险动作）。
5. 用户确认 `knowledge-distill` 是否应加入 xiaoxue 主 Agent allowlist（这是唯一"业务核心但当前 deny"的 Skill）。

## 11. 附录：本报告所有数据来源

- `packages/opencode/src/skill/index.ts` — Skill 发现主逻辑
- `packages/opencode/src/skill/discovery.ts` — 远端 Skill 拉取
- `packages/core/src/skill/discovery.ts` — V2 Skill 发现（远程拉取）
- `packages/core/src/skill/guidance.ts` — System Context 注入
- `packages/opencode/src/agent/agent.ts:166-243` — xiaoxue 主 Agent 与业务子 Agent 的 Skill allowlist
- `packages/opencode/src/xiaoxue/enterprise-policy.ts` — 企业托管策略（默认 unrestricted）
- `packages/desktop/src/main/skills.ts` + `skills-sync.ts` + `skills-config.ts` — 桌面端 Skill 注入路径
- `configs/xiaoxue/identity.yaml` — 小雪定位与边界
- `configs/xiaoxue/router.md` — 路由规则
- `configs/xiaoxue/skills.yaml` — 6 个核心 Skill 注册 + portable_pack agents
- `configs/xiaoxue/system.md` — 系统提示词核心业务范围
- `.opencode/skills/**/SKILL.md` — 77 个 Skill 的实际 frontmatter 与正文

> 本报告 **未修改** 任何 SKILL.md、`router.md`、`skills.yaml`、`agent.ts`、`skills.ts` 或 `.opencode/skills/` 中任何 Skill 文件。
