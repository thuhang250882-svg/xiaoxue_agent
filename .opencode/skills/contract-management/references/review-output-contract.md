# 石油合同审查证据与义务契约

## 风险证据

每项风险至少包含：

```json
{
  "id": "CR-001",
  "severity": "红色",
  "category": "验收",
  "finding": "风险说明",
  "contract_evidence": {
    "file": "合同.docx",
    "clause": "第8.2条",
    "location": "第12页/验收条款/段落anchor",
    "quote": "短摘录",
    "reliability": "native|ocr|manual"
  },
  "legal_evidence": {
    "citation": "法条或标准",
    "verification": "verified|verify_original|not_available"
  },
  "recommendation": "修改或谈判建议",
  "recommended_text": "可选替代措辞",
  "needs_confirmation": false
}
```

## 义务时间线

```json
{
  "id": "OB-001",
  "obligor": "甲方",
  "counterparty": "乙方",
  "action": "完成验收并出具书面结果",
  "object": "录井成果",
  "trigger": "乙方提交完整成果",
  "deadline_or_cycle": "10个工作日内",
  "owner": "待确认",
  "consequence": "逾期视为验收的效力需结合原文判断",
  "evidence": {"file": "合同.docx", "location": "第8.2条", "quote": "短摘录"},
  "status": "待确认"
}
```

## 约束

- 证据位置必须真实；扫描/OCR 不可靠时标 reliability 和人工复核。
- 义务期限使用合同原文，不把模型计算出的日期伪装成合同日期。
- 商务选择、留空项和事实缺口默认 `needs_confirmation=true`，只给建议，不直接修订。
- `合同对比` 负责版本差异，`合同台账提醒` 消费义务时间线，`起草合同` 负责新文本；本 Skill 不抢占这些 Trigger。
