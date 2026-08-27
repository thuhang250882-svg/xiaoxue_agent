---
name: mud-logging-supervision
description: 处理录井现场监督检查，包括照片检查、地质交底和录井策划核查、标准条款速查、问题汇总通报以及历史案例入库检索。用于监督检查业务，不替代完整地质录井报告审核。
---

# 录井监督检查

## 模式路由

- 现场照片对标检查：[photo-check.md](references/photo-check.md)
- 地质交底或录井策划文档核查：[document-check.md](references/document-check.md)
- 标准条款与整改表述查询：[standards-lookup.md](references/standards-lookup.md)
- 问题统计、汇总表和检查通报：[issue-report.md](references/issue-report.md)
- 历史问题案例入库或相似案例检索：[case-management.md](references/case-management.md)

## 统一输出规则

- 每条问题至少给出位置、表现、依据、原因和整改建议。
- 标准条款必须来自本地已登记资料；无法定位时写“未确认，需要人工验证”。
- 照片观察事实与专业推断分开，不能从不可见细节推定违规。
- 完整报告、整井多文件和油气显示解释转交 `geolog-logging-review`；井控实时风险转交 `well-control-risk-assessment`。
