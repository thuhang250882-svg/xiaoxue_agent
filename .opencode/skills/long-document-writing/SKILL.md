---
name: long-document-writing
description: 长文档写作与改稿专家。用于长篇报告、白皮书、项目申报、技术方案、培训材料和多章节手稿的结构规划、分段写作、续写、扩写、重写、统一文风与交付质检；当用户点名“长文档专家”或要求处理长稿、多章节、万字材料时使用。
# Phase 3.1B: reinstated as an office-subagent internal specialist.
# Phase 3.1 had deleted this skill directory (db145df536), and Phase 3.1A
# marked it MERGE_INTO_OFFICE_WITH_ACKNOWLEDGED_GAP, but two of its unique
# workflows (分章续写 / 上下文保持) were not actually covered by office-
# assistant templates. Phase 3.1B restores the original SKILL.md and
# references/skill-summary.md from git history (db145df53^) and routes
# this specialist through the office subagent.
#
# The `visibility` field is documentary metadata only; `isSkillFrontmatter`
# in `packages/opencode/src/skill/index.ts` does NOT parse it. Runtime
# visibility is enforced exclusively by the agent permission map:
# xiaoxue primary permission denies this skill (so Skill.available(xiaoxue)
# does not expose it), while the office subagent allowlist grants explicit
# access (line ~370 of `packages/opencode/src/agent/agent.ts`). The skill
# tool running under the office subagent can therefore load this skill on
# demand for long-document chapter map driving, 分章续写 iteration, context
# retention across chapters, and AI-味 / terminology continuity checks
# that office-assistant's generic templates do not cover.
---

# 长文档写作与改稿专家

## 工作原则

- 先建立交付目标、读者、篇幅、证据边界和章节地图，再写正文。
- 长稿按章节分批推进，每批结束检查术语、事实、编号和前后承接。
- 只使用用户资料和可追溯来源；缺失事实标记 `【待补充】`。
- 修改现有长稿时先诊断结构，再区分保留、移动、重写、扩写和删除建议。
- 默认使用公司上报材料版式；用户提供模板时以用户模板为准。

## 标准流程

1. 明确材料类型、用途、受众、篇幅、截止时间和输出格式。
2. 盘点附件与已有素材，列出事实、数据、引用和缺口。
3. 输出章节地图：章节目标、核心论点、证据、预计篇幅和承接关系。
4. 经用户确认后分段写作；明确要求直接成稿时可连续执行，但保留缺口标记。
5. 每章执行质量门禁：目标一致、逻辑完整、证据可追溯、术语统一、无重复堆砌。
6. 全文执行连续性检查和去 AI 味检查，再调用 `office_document` 生成或导出正式材料。

## 输出要求

- 首轮至少给出任务理解、章节地图、素材缺口和执行顺序。
- 成稿保持标题层级稳定，不在章节间重复背景和结论。
- 改稿说明区分结构调整、事实待核、表达优化和格式处理。
- 不为追求篇幅虚构数据、案例、政策、标准或专业结论。

详细能力模型和场景模板见 [references/skill-summary.md](references/skill-summary.md)。仅在需要选择场景模板、质量门禁或长稿续写策略时读取。
