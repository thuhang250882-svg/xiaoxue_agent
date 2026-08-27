---
name: tender-management
description: 处理油田录井、钻井和技术服务招投标业务，包括招标文件与评标办法编制、招标文件审核、投标响应规划以及技术标和商务标草稿。一个入口覆盖招标方与投标方，但不混淆双方立场。
---

# 招投标管理

先确认任务立场和模式，再读取对应参考文件。

## 模式路由

- 招标方编制招标公告、技术要求、资质条件或评标办法：读取现有 `technical-requirements-guide.md`、`qualification-requirements.md` 和 `evaluation-method-guide.md`。
- 审核招标文件或投标文件、识别废标红线和评分差距：读取 [review-mode.md](references/review-mode.md) 与 [review-framework.md](references/review-framework.md)。
- 生成投标响应计划、技术标或商务标章节草稿：读取 [bid-generation-mode.md](references/bid-generation-mode.md) 与 [bid-generation-contract.md](references/bid-generation-contract.md)。
- 需要正式 Word 审核报告时读取 [review-report-contract.md](references/review-report-contract.md) 和 [review-word-format.md](references/review-word-format.md)，并使用 `scripts/` 中的本地生成与验证脚本。

## 统一要求

- 招标方要求、投标方响应和企业自有证明材料分别取证，不得相互替代。
- 未找到证据不等于不符合；标记“未确认，需要人工验证”。
- 评分项、废标项、资质项、商务项和技术项分别列出，并给出文件、页码、章节或表格定位。
- 仅使用用户提供文件和单位内网材料，不搜索公网公告、供应商或案例。
- 不替用户作出投标、报价或法律承诺；关键参数和最终提交由授权人员确认。
