---
name: contract-management
description: 处理合同与协议的起草、审查、对比、NDA筛查、合规核对、法条查询、经济影响、台账提醒和谈判备忘。适用于石油录井及一般企业合同业务；不负责在线签署或调用外部法律服务。
---

# 合同管理

在一个入口内完成合同全生命周期任务。先判断任务模式，只读取对应参考文件，避免同时加载整套合同知识。

## 模式路由

- 起草合同或协议：读取 [drafting.md](references/drafting.md)；需要 Word 格式时再读取 [word-format-spec.md](references/word-format-spec.md)。
- 审查合同、风险分级或审批意见：读取 [review.md](references/review.md) 和 [review-output-contract.md](references/review-output-contract.md)。
- NDA/保密协议快筛：读取 [nda-screening.md](references/nda-screening.md)。
- 两版合同对比：读取 [comparison.md](references/comparison.md)。
- 合规或 HSE 核对：读取 [compliance.md](references/compliance.md)。
- 条款经济影响：读取 [economic-impact.md](references/economic-impact.md)。
- 法条与内部规则查询：读取 [legal-lookup.md](references/legal-lookup.md)。
- 台账、到期和履约节点：读取 [lifecycle-ledger.md](references/lifecycle-ledger.md)。
- 谈判成果与未决事项：读取 [negotiation-memo.md](references/negotiation-memo.md)。
- 石油行业合同参数和惯例：仅在上述模式确有需要时读取 [industry-knowledge.md](references/industry-knowledge.md)。

## 统一边界

- 仅使用用户提供文件、本地知识库和已授权的单位内网材料，不访问公网法律、电子签或合同平台。
- 不把缺失材料解释为事实；证据不足时标记“未确认，需要人工验证”。
- 保持甲乙方立场明确，金额、期限、责任和引用必须能回到原文位置。
- 涉及正式法律结论、签署或对外提交时，明确要求法务或授权人员确认。
