# Phase 3.2 — Supervision Skill Consolidation (CANCELLED)

> 状态：CANCELLED — **未执行合并，未修改任何 SKILL.md / allowlist / router / subagent / archive**
> 主题：5 个 supervision Skill 合并提案的取消记录
> 取消日期：2026-08-23
> 替代阶段：Phase 3.2A（已完成 PASS，详见 `phase3.2A-supervision-viability-audit-2026-08-23.md`）
> 前置依据：Phase 2.5 / 3.0 / 3.0A / 3.1 / 3.1A / 3.1B 全部已 PASS 或 SUPERSEDED

---

## 一、取消原因

Phase 3.2 在初稿阶段假设"5 个 supervision Skill 可合并为 1 个 canonical supervision-assistant"。审核过程发现：

1. **5/5 Skill 的 runtime reference = 0**（无任何 agent.ts / xiaoxue-router.ts / configs/xiaoxue 引用）
2. **5/5 SKILL.md 都引用了不存在的 knowledge 资产**：
   - `knowledge/standards/INDEX.md` + `clauses.md`（缺失）
   - `knowledge/inspection_cases/` 整个目录（不存在）
   - `knowledge/templates/`（仅有 .gitkeep，无模板）
3. **5/5 SKILL.md 设计完整，无 PURE_DUPLICATE**
4. **5/5 各自承载独立的监督业务生命周期节点**（标准查询 / 资料核查 / 案例沉淀 / 问题汇总），不构成合并集群

→ 强行合并会破坏 Phase 3.1A 已建立的 hard rule（runtime reference = 0 不得声明 Internal Specialist），且无法验证合并后产物真实可执行。

→ **NOT A MERGE CLUSTER**。Skill 名称都带 "supervision-" 不构成合并依据。

---

## 二、替代路径

| 原 Phase 3.2 假设 | 实际决策 |
|---|---|
| 5 个 supervision Skill 合并为 1 个 canonical | **取消合并**；改为审计每个 Skill 自身可行性 |
| supervision-assistant 作为 L0 入口 | **不在本阶段创建**；待 knowledge 资产齐备后再议 |
| 通过 allowlist / router 把 Skill 接入 Xiaoxue | **禁止**（runtime reference = 0；Phase 3.1A hard rule） |
| 通过 archive 把 Skill 移除 | **禁止**（业务价值清晰，ARCHIVE_CANDIDATE 不适用） |

---

## 三、本阶段最终状态

```
Phase 3.2:        CANCELLED
Phase 3.2A:       PASS（详见 phase3.2A-supervision-viability-audit-2026-08-23.md）
Supervision:      FROZEN_PENDING_BUSINESS_ASSETS
```

---

## 四、Portfolio 分类修正（与本阶段同步）

按 Phase 3.1A hard rule：

> 没有真实 invocation path 的 Skill，不能称为 Internal Specialist。

**修正前**（skill-dependency-matrix-2026-08-22.tsv 第 38-42 行 / skill-portfolio-inventory-2026-08-22.tsv 第 66-69 行）：

| Skill | 原 classification | 备注 |
|---|---|---|
| supervision-issue-report | L3_INTERNAL | 错误（无 invocation path） |
| supervision-doc-check | L3_INTERNAL | 错误（无 invocation path） |
| supervision-case-collector | L3_INTERNAL | 错误（无 invocation path） |
| supervision-photo-check | L3_INTERNAL | 错误（无 invocation path） |
| supervision-standard-lookup | L3_INTERNAL | 错误（无 invocation path） |

**修正后**：

| Skill | 新 classification | reason | future_role |
|---|---|---|---|
| supervision-issue-report | L4_DISABLED_FOR_XIAOXUE | INCOMPLETE_BUSINESS_ASSETS | SPECIALIST |
| supervision-doc-check | L4_DISABLED_FOR_XIAOXUE | INCOMPLETE_BUSINESS_ASSETS | SPECIALIST |
| supervision-case-collector | L4_DISABLED_FOR_XIAOXUE | INCOMPLETE_BUSINESS_ASSETS | SPECIALIST |
| supervision-photo-check | L4_DISABLED_FOR_XIAOXUE | INCOMPLETE_BUSINESS_ASSETS | SPECIALIST |
| supervision-standard-lookup | L4_DISABLED_FOR_XIAOXUE | INCOMPLETE_BUSINESS_ASSETS | SPECIALIST |

`recommendation` 列同步更新为 `FROZEN_PENDING_BUSINESS_ASSETS (future_role=SPECIALIST, reason=INCOMPLETE_BUSINESS_ASSETS)`。

---

## 五、Portfolio 计数变化

| Tier | 修正前 | 修正后 | 变化 |
|---|---|---|---|
| L0_CORE_ENTRY | 8 | 8 | — |
| L1_SPECIALIST | 10 | 10 | — |
| L2_FOUNDATION | 13 | 13 | — |
| L3_INTERNAL | 16 | 11 | **−5** |
| L4_DISABLED_FOR_XIAOXUE | 19 | 24 | **+5** |
| L4_TRUE_ARCHIVE_CANDIDATE | 11 | 11 | — |
| ZOMBIE_CLEANED_FROM_ALLOWLIST | 3 | 3 | — |
| **portfolio_nodes** | **80** | **80** | — |

来源：`bun script/skill-counting-model.ts` 输出（portfolio_by_classification 字段）。

---

## 六、未执行任何禁止事项的确认

本阶段**未执行**以下操作（按用户硬规则）：

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
| 修改 configs/xiaoxue/{router.md, skills.yaml} | 未执行 ✓ |

---

## 七、下一阶段方向（用户已建议）

按用户 2026-08-23 指示：

> **不要启动 Phase 3.3 合同 Skill 治理**，除非用户正式授权。

候选 Phase 3.3 — Contract Skill Architecture Audit：
- 审计对象：审查合同 / 起草合同 / 合同台账提醒 / 谈判备忘整理 / tencent-esign-contract / 石油行业合同知识库 等
- 起点：生命周期架构分析（合同需求 → 起草 → 审查 → 谈判 → 签署 → 履约 → 台账 → 风险提醒）
- **不预设合并结论**；先做架构审计

**当前阶段**：Phase 3.2A 已 PASS；Supervision Cluster 已 FROZEN；等待用户授权启动下一阶段。

---

## 八、阶段关闭声明

Phase 3.2 CONSOLIDATION CANCELLED 正式记录。

后续如需重启 supervision Skill 工作，须满足以下前提之一：
1. 业务侧已补齐 knowledge/standards/ + knowledge/templates/ + knowledge/inspection_cases/ 资产
2. 用户明确授权启动新的治理阶段（Phase 3.X），并提供新的指令集

---

**END OF PHASE 3.2 CANCELLED RECORD**