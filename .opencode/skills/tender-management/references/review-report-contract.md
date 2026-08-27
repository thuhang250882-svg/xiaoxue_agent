# 审核结果 JSON 契约

## 输出顺序

1. 审核范围与材料状态
2. 一页式结论
3. 需领导决策/协调事项
4. 致命/高风险事项
5. 逐项要求—响应矩阵
6. 评分差距与价格核算
7. 交叉矛盾与偏差
8. 整改清单
9. 人工核验项
10. 限制与未审范围

## 最小结构

```json
{
  "metadata": {
    "project_name": "项目名称或未提及",
    "review_date": "2026-08-14",
    "mode": "full",
    "files": [{"role": "tender", "name": "招标文件.pdf", "sha256": "", "extraction": "native", "coverage": "全部120页"}]
  },
  "summary": {
    "overall": "整改后复核",
    "status_counts": {"符合": 0, "部分符合": 0, "不符合": 0, "未找到": 0, "待人工确认": 0, "不适用": 0},
    "risk_counts": {"致命": 0, "高": 0, "中": 0, "低": 0, "提示": 0},
    "top_actions": []
  },
  "items": [],
  "decision_items": [],
  "manual_checks": [],
  "limitations": []
}
```

每个 `items` 条目必须包含 `id`、`category`、`requirement`、`requirement_type`、`status`、`risk_level`、`tender_evidence`、`bid_evidence`、`finding`、`remediation`、`owner`、`deadline`、`manual_check`。每条证据包含 `file`、`location` 和 `quote`。

每个 `decision_items` 条目包含唯一 `id`、`decision`、非空 `options`、`evidence_and_impact`、`deadline` 和 `owner`。没有事项时仍使用空数组。

枚举：

- `mode`: `full`、`tender-only`、`bid-only`
- `overall`: `建议提交`、`整改后复核`、`不建议提交`、`资料不足`
- `requirement_type`: `否决项`、`评分项`、`一般响应项`、`信息项`、`待确认`
- `status`: `符合`、`部分符合`、`不符合`、`未找到`、`待人工确认`、`不适用`
- `risk_level`: `致命`、`高`、`中`、`低`、`提示`

计数必须与 `items` 一致；完整审核的“符合”必须同时有招标与投标证据；未满足的明确否决项必须标为致命；不得虚构证据位置。
