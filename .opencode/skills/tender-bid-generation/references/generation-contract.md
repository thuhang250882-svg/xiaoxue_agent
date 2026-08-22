# 投标生成结果契约

## 最小结构

```json
{
  "metadata": {
    "project_name": "项目名称",
    "lot": "标段",
    "tender_matrix_version": "sha256 或版本",
    "mode": "draft"
  },
  "material_gaps": [],
  "coverage_plan": [],
  "sections": [],
  "uncovered_requirements": [],
  "consistency_issues": [],
  "manual_checks": [],
  "qa_status": "待独立审核"
}
```

每个 `coverage_plan` 条目包含 `section_id/title/requirement_ids/material_ids/status/owner`。每个章节包含 `section_id/content/evidence_refs/placeholders`。`evidence_refs` 必须能回到招标要求或企业素材真实位置。

## 阻断规则

- 未匹配的明确否决项不得被草稿文字伪装成"已响应"。
- 没有企业证据的资格、业绩、人员、设备和参数只能成为缺口或占位符。
- 价格、折扣、税率、投标有效期和重大合同偏差必须经过人工确认。
- `qa_status` 不得由本技能自行改成"通过"；只有独立审核结果可更新。
