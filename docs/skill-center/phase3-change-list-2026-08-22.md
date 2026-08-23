# 录井小雪 Skill Portfolio — Phase 3 变更清单（2026-08-22）

> 本清单列出 Phase 2.5 完成后**待用户与 GPT 共同审核后**才执行的变更。
> 每项变更都标注：优先级 / 风险 / 预估工作量 / 前置条件 / 决策窗口。
> 配套文档：
> - [skill-dependency-matrix-2026-08-22.tsv](skill-dependency-matrix-2026-08-22.tsv)（80 行 × 13 列）
> - [skill-dependency-graph-2026-08-22.md](skill-dependency-graph-2026-08-22.md)（80 节点 / 7 层 Mermaid）
> - [phase2.5-amendment-report-2026-08-22.md](phase2.5-amendment-report-2026-08-22.md)（修订报告）
>
> **Phase 3.0A 对账标注（2026-08-23，superseded by Phase 3.0A）**：§0 总览中 ZOMBIE 行（3 个）维持不变：
> contract-management / github-ai-trends / llm-wiki，终态 `ZOMBIE_CLEANED`。`mud-logging-review` 不归类为
> ZOMBIE，Phase 3.0 已完成迁移，终态 `DEPRECATED_MIGRATED`。§1.1 tsc 5.8.2 崩溃条目：Phase 3.0A 已重新确认
> 根因为 TypeScript 5.8.2 编译器自身 bug（与 `.db-rehearsal` 无关），本阶段只给修复建议、不升级。
> 详见 [phase3.0a-closeout-reconciliation-2026-08-23.md](phase3.0a-closeout-reconciliation-2026-08-23.md)。

## 0. 总览

| 维度 | Phase 2.5 终点 | Phase 3 终点 | 变更类型 |
| --- | --- | --- | --- |
| L0 入口 | 8 | **8（确认不变）** | 用户决策 |
| L1 专业 | 10 | **10（确认不变）** | 用户决策 |
| L2 底座 | 13 | **13（确认不变）** | 用户决策 |
| L3 内部归并 | 16 | **1（监督）+ 0（办公）+ 0（合同）= 1** | **执行 MERGE** |
| L4 暂禁 | 19 | **0（全部归档）** 或 19（保留） | 用户决策 |
| L4 真归档 | 11 | **0（全部 .archive/）** | **执行 ARCHIVE** |
| ZOMBIE | 3 | 3（保留目录） | 不动 |
| 活跃 Skill 总数 | 80 → 44（含 3 ZOMBIE） | 27-47（取决于 L4 决策） | 净化 |
| mud-logging-review 状态 | 仍 allow | 仅移除 allow（保留目录） | 局部修改 |
| knowledge-distill 状态 | L1 + user_visible=no | **加入 knowledge Agent allowlist** | 局部修改 |
| tsc 5.8.2 崩溃 | baseline | **升级到 5.9 或 6.0** | **执行升级**（如用户批准） |

## 1. P0 — 必须 Phase 3 完成（RC6 阻塞项）

### 1.1 tsc 5.8.2 baseline 崩溃修复

| 维度 | 详情 |
| --- | --- |
| 优先级 | **P0**（CI 卡死） |
| 风险 | 🟡 MEDIUM（升级 TS 可能引入新 strict 错误） |
| 工作量 | 0.5 ~ 1 人日（升级 + 修类型错误） |
| 前置 | 用户决定升级到 5.9 还是 6.0 |
| 决策窗口 | RC6 封板前必须决定 |
| 候选方案 | A) 升级到 `typescript@5.9.x`（小版本，兼容性好）<br>B) 升级到 `typescript@6.0.x`（大版本，特性多）<br>C) 保持 5.8.2，局部用 `// @ts-ignore` 绕过崩溃点<br>D) 切换到 `tsgo`（TypeScript Go 原生编译） |
| 建议 | **A. 升级到 5.9.x**，原因：5.9 修复了多个 checker bug；6.0 还在 RC，节奏赶不上 RC6 |

### 1.2 well-control-risk-assessment 启用 / 移除

| 维度 | 详情 |
| --- | --- |
| 优先级 | P0（影响 L1 列表的真实性） |
| 风险 | 🟢 LOW（无论选哪个都不影响主流程） |
| 前置 | 用户确认井控业务是否纳入 RC6 |
| 决策窗口 | RC6 封板前 |
| 候选方案 | A) 保持 FUTURE_PRODUCT_PHASE（deny all）<br>B) 移除 SKILL.md 移到 `.archive/`<br>C) 接入 WITS 数据后启用 |
| 建议 | **A. 保持 FUTURE_PRODUCT_PHASE**，原因：身份边界（identity.yaml）已显式排除，移除会破坏未来扩展能力 |

## 2. P1 — 推荐 Phase 3 完成（L3 归并 + L4 真归档）

### 2.1 L3 内部归并执行（16 → 0，监督 5→1 例外）

#### 2.1.1 办公类 6 个归并到 office-assistant

| 源 Skill | 目标 | 执行动作 | 风险 | 工作量 |
| --- | --- | --- | --- | --- |
| `long-document-writing` | `office-assistant` | 1) 提取 SKILL.md 任务模板到 office-assistant/SKILL.md "长文档写作"段<br>2) 删除目录<br>3) router.md:13 移除<br>4) agent.ts:221,366,533 移除 allow<br>5) router.ts:273 移除 | 🟡 MEDIUM（任务模板合并需保证不丢边界） | 1 人日 |
| `meeting-minutes-manager` | `office-assistant` | 1) 提取会议纪要任务模板到 office-assistant<br>2) 录音转写子流程保留为 office-assistant 内部步骤（不单独 allow FOUNDATION）<br>3) 删除目录<br>4) router.md:10 / agent.ts / router.ts:183 同步清理 | 🟡 MEDIUM | 1 人日 |
| `humanizer` | `office-assistant` | 1) 提取润色任务模板<br>2) 删除目录<br>3) router.ts:134 / agent.ts:192,355 同步清理 | 🟢 LOW（纯重叠） | 0.5 人日 |
| `合同台账提醒` | `office-assistant` | 1) 提取合同履约台账任务到 office-assistant<br>2) 删除目录<br>3) router.md:20 / agent.ts / router.ts:155 同步清理<br>4) **注意**：本阶段已加 allow，Phase 3 需同步移除 | 🟡 MEDIUM（业务边界） | 0.5 人日 |
| `谈判备忘整理` | `office-assistant` | 1) 提取合同谈判备忘任务到 office-assistant<br>2) 删除目录<br>3) agent.ts 同步清理 | 🟡 MEDIUM | 0.5 人日 |
| `supervision-issue-report` | `office-assistant` | 1) 提取监督问题汇总任务到 office-assistant<br>2) 删除目录<br>3) agent.ts 同步清理 | 🟢 LOW | 0.5 人日 |

#### 2.1.2 监督类 5 个归并到 supervision-case-collector（5 → 1）

| 源 Skill | 目标 | 执行动作 | 风险 | 工作量 |
| --- | --- | --- | --- | --- |
| `supervision-photo-check` | `supervision-case-collector` | 1) 提取照片检查子流程到 case-collector<br>2) 删除目录<br>3) agent.ts 同步清理 | 🟢 LOW | 0.5 人日 |
| `supervision-standard-lookup` | `supervision-case-collector` | 1) 提取标准速查子流程<br>2) 删除目录<br>3) agent.ts 同步清理 | 🟢 LOW | 0.5 人日 |
| `supervision-issue-report`（若用户拒绝并入 office-assistant） | `supervision-case-collector` | 1) 提取问题汇总到 case-collector<br>2) 删除目录 | 🟡 MEDIUM | 0.5 人日 |
| `supervision-doc-check` | `geolog-logging-review` | 1) 提取监督文档核查到 geolog-logging-review<br>2) 删除目录<br>3) agent.ts 同步清理 | 🟡 MEDIUM（跨 L0 边界） | 0.5 人日 |
| `supervision-case-collector` | `document-review-tracked` | 1) 整体并入 document-review-tracked 作为监督任务模板<br>2) 删除目录<br>3) router.ts:253 改路由<br>4) agent.ts 同步清理 | 🟡 MEDIUM | 1 人日 |

#### 2.1.3 合同类 5 个归并到 审查合同

| 源 Skill | 目标 | 执行动作 | 风险 | 工作量 |
| --- | --- | --- | --- | --- |
| `NDA快筛` | `审查合同` | 1) 提取 NDA 快筛子流程<br>2) 删除目录<br>3) agent.ts 同步清理 | 🟢 LOW | 0.5 人日 |
| `合同对比` | `审查合同` | 同上 | 🟢 LOW | 0.5 人日 |
| `合规性检查` | `审查合同` | 同上 | 🟡 MEDIUM（描述差异） | 0.5 人日 |
| `法条速查` | `审查合同` | 同上 | 🟢 LOW | 0.5 人日 |
| `条款经济影响评估` | `审查合同` | 1) 提取经济量化子流程<br>2) 删除目录<br>3) agent.ts 同步清理 | 🟡 MEDIUM（外部依赖 python） | 0.5 人日 |

#### 2.1.4 mud-logging-review 局部修改（不删除）

| 源 Skill | 目标 | 执行动作 | 风险 | 工作量 |
| --- | --- | --- | --- | --- |
| `mud-logging-review` | `geolog-logging-review`（canonical 保留） | 1) agent.ts:215,393 移除 allow（仅保留目录作为迁移备份）<br>2) 在 SKILL.md 加 DEPRECATED 横幅 | 🟢 LOW | 0.2 人日 |

### 2.2 L4_TRUE_ARCHIVE_CANDIDATE 11 个直接归档

| Skill | 归档方式 | 风险 | 工作量 |
| --- | --- | --- | --- |
| `effect` | `.opencode/skills/.archive/effect/` | 🟢 LOW | 0.1 人日 |
| `experiment-design` | `.archive/experiment-design/` | 🟢 LOW | 0.1 人日 |
| `research-baseline-builder` | `.archive/research-baseline-builder/` | 🟢 LOW | 0.1 人日 |
| `giiisp-paper-search-apis` | `.archive/giiisp-paper-search-apis/` | 🟢 LOW | 0.1 人日 |
| `papercheck` | `.archive/papercheck/` | 🟢 LOW | 0.1 人日 |
| `manim-agent` | `.archive/manim-agent/` | 🟢 LOW | 0.1 人日 |
| `practical-course-producer` | `.archive/practical-course-producer/` | 🟢 LOW | 0.1 人日 |
| `sci-employee-deep-research` | `.archive/sci-employee-deep-research/` | 🟢 LOW | 0.1 人日 |
| `minimax-pdf` | `.archive/minimax-pdf/` | 🟢 LOW | 0.1 人日 |
| `skill-criticagent` | `.archive/skill-criticagent/` | 🟢 LOW | 0.1 人日 |
| `mcp-criticagent` | `.archive/mcp-criticagent/` | 🟢 LOW | 0.1 人日 |

**执行步骤**（以 `effect` 为例）：
```bash
mkdir -p .opencode/skills/.archive
mv .opencode/skills/effect .opencode/skills/.archive/effect
# 验证：bun test packages/opencode/test/skill/discovery.test.ts 应仍 100% pass
#       （.archive/ 以点开头，dot: undefined 会跳过）
```

### 2.3 knowledge-distill 加入 knowledge Agent allowlist

| 维度 | 详情 |
| --- | --- |
| 优先级 | P1（业务核心但当前 deny） |
| 风险 | 🟢 LOW（已通过 Phase 2.4 决策分析） |
| 前置 | 用户确认 |
| 工作量 | 0.1 人日 |
| 决策窗口 | RC6 封板前 |
| 改动 | `agent.ts:495` 区域，knowledge Agent skill allowlist 中新增 `knowledge-distill: "allow"` |
| 候选方案 | A) 加入 knowledge Agent allow（推荐）<br>B) 加入 xiaoxue 主 Agent allow（不推荐：用户认知负担）<br>C) 保持 DENY 等未来产品决策 |
| 建议 | **A. 加入 knowledge Agent allow**，原因：与 geology-knowledge 形成"查询-蒸馏-维护"完整链路 |

## 3. P2 — 可选 Phase 3 完成（用户决策窗口较大）

### 3.1 L4_DISABLED_FOR_XIAOXUE 19 个的去留

| 维度 | 详情 |
| --- | --- |
| 优先级 | P2（不影响 RC6 功能） |
| 风险 | 🟡 MEDIUM（IT 信息化类可能含用户需求） |
| 前置 | 用户明确哪些需要保留、哪些归档 |
| 工作量 | 0.5 人日（含与用户对齐） |
| 决策窗口 | RC6 后即可 |
| 子分类 | A) 业务无关 / 消费类（6 个）：autoresearch / image-well / nano-banana-pro / prompt-engineering-expert / yourself-skill / cognitive-profile<br>B) 开发者向（3 个）：fullstack-dev / darwin-skill / tutor-skills<br>C) GitHub 趋势（2 个）：github / github-trending-cn<br>D) IT 信息化（8 个）：标杆对比 / 技术选型评审 / 立项报告 / 写报告 / 桌面调研 / 方案框架 / 项目周报 / 领导汇报 |
| 建议 | **A + C 归档**（与录井业务无交集）<br>**B 保留**（开发者可能用到）<br>**D 用户确认**（部分可能与"信息化项目"工作流相关） |

### 3.2 GBK → UTF-8 编码统一

| 维度 | 详情 |
| --- | --- |
| 优先级 | P2（不影响功能） |
| 风险 | 🟢 LOW |
| 工作量 | 0.5 人日（19 个文件） |
| 前置 | 无 |
| 决策窗口 | RC6 封板前或后 |
| 候选方案 | A) 全部转 UTF-8（推荐）<br>B) 仅转 GBK 编码的（保留 GBK 文件头）<br>C) 不转（接受 Windows 控制台乱码） |
| 建议 | **A. 全部转 UTF-8** |

### 3.3 编码混杂的 7 个英文 SKILL.md 清理

| 维度 | 详情 |
| --- | --- |
| 优先级 | P2 |
| 工作量 | 0.5 人日 |
| 候选方案 | A) 统一转英文（推荐：geolog-logging-review 等已是混合）<br>B) 统一转中文<br>C) 保留现状 |
| 建议 | **A. 统一英文 description + 中文正文** |

## 4. P3 — Phase 3 暂不执行（路线图项目）

### 4.1 Phase 4 — Knowledge Layer 完整化

- `knowledge-distill` 启用后的端到端测试
- `llm-wiki-knowledge` 与 `obsidian` 的双向同步优化
- 与 `geology-knowledge` 的查询-蒸馏-维护闭环验证

### 4.2 Phase 5 — Skill Discovery 优化

- `Config.skills.paths` 引入更细粒度的目录白名单
- 解决 `.archive/` 模式与 `dot: undefined` 的边界
- 探索更高效的 Skill scanning 策略（缓存 + 增量）

### 4.3 Phase 6 — Skill Auto-Critique 集成

- `skill-criticagent` 重新设计后启用
- 与 `darwin-skill` 协同的 Skill 自我评估流水线
- 接入 CI 作为 Skill 质量门禁

## 5. 执行排期建议

| 时间窗口 | 任务 | 风险等级 |
| --- | --- | --- |
| Week 1（Phase 3.0） | 1.1 tsc 升级 + 1.2 well-control 决策 | 🟡 |
| Week 1-2（Phase 3.1） | 2.1 L3 归并（办公类 6 + 监督 5→1 + 合同 5 + mud-logging-review 局部） | 🟡 |
| Week 2（Phase 3.2） | 2.2 L4 真归档 11 个 + 2.3 knowledge-distill allow | 🟢 |
| Week 3（Phase 3.3） | 3.1 L4 暂禁 19 个去留（用户决策后）+ 3.2 GBK → UTF-8 + 3.3 编码混杂清理 | 🟢 |
| Week 4（Phase 3 收尾） | 全部测试 + 文档更新 + RC6 RC Tag | 🟢 |

## 6. Phase 3 完成的成功标准（DoD）

| DoD 项 | 验证方式 |
| --- | --- |
| 1. tsc typecheck 0 错误 | `bunx --bun tsc --noEmit -p packages/opencode/tsconfig.json` 退出码 0 |
| 2. 全量测试 100% pass | `bun test` 退出码 0 |
| 3. 活跃 Skill 数 ≤ 47 | 8 L0 + 10 L1 + 13 L2 + 0-1 L3 + 0-19 L4 + 3 ZOMBIE = 34-51 |
| 4. 所有僵尸路由不再触发 Effect.die | `bun run test/skill/discovery.test.ts` |
| 5. Canonical TSV / Mermaid 与代码一致 | 80 行 / 80 节点 + 实际 allowlist 完全一致 |
| 6. 文档同步 | phase3-completion-report-2026-XX.md 生成 |

## 7. 不在 Phase 3 范围（明确排除）

- ❌ 不删任何 ZOMBIE 目录（保留以备追溯）
- ❌ 不合并 L0 入口（5 变 8 已是 Phase 2.5 最终结论）
- ❌ 不改 SKILL.md 的 description 触发词（合并后由 L0 触发）
- ❌ 不动桌面 GUI / TUI / app / sdk-next（仅 core 改动）
- ❌ 不重启 opencode Cluster（保持单机模式）

## 8. 待用户最终确认的 8 个决策

1. ✅ tsc 升级到 5.9 还是 6.0
2. ✅ well-control-risk-assessment 保持 / 移除 / 等 WITS
3. ✅ L0 = 8 入口是否接受（特别是 起草合同 升 L0）
4. ✅ L1 = 10 名单是否接受（特别是 knowledge-distill user_visible=no）
5. ✅ L4 暂禁 19 个的去留
6. ✅ L3 归并顺序：先办公类还是先合同类
7. ✅ GBK → UTF-8 是否 RC6 前完成
8. ✅ knowledge-distill 是否在 RC6 启用

详细影响见 [phase2.5-amendment-report-2026-08-22.md §7](phase2.5-amendment-report-2026-08-22.md)。
