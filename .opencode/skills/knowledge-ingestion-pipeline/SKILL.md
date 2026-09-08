---
name: knowledge-ingestion-pipeline
description: 企业知识库资料入库全流程标准化作业。当用户要求把资料（标准、制度、模板、报告、经验、案例等）导入/上架/发布到企业知识库，或询问入库规范、审批流程、分类规则时使用。覆盖资料收集、格式审核、分类标签、权限矩阵、上架审批五个环节的执行标准与交付物。
---

# 企业知识库资料入库标准化流程

本 Skill 是知识库入库的**流程权威**。入库的工具操作（import/OCR/检索）以 `knowledge_manage` 与 `pdfkit-py` 为准；分类语义、审批顺序、交付物标准以本 Skill 为准。

## 环节路由

按当前所处环节读取对应标准，未指明环节时从环节 1 顺序执行：

1. **资料收集** — 资料从哪来、收什么、登记什么 → [collection-template.md](references/collection-template.md)
2. **格式合规审核** — 哪些格式能入库、扫描件/加密件怎么处理 → [format-compliance-checklist.md](references/format-compliance-checklist.md)
3. **分类标签配置** — 七大分类的判定标准与标签命名 → [taxonomy-config.md](references/taxonomy-config.md)
4. **权限矩阵** — 谁能提交、审核、发布、删除 → [permission-matrix.md](references/permission-matrix.md)
5. **上架发布审批** — 审批链、发布模式、留痕要求 → [publish-approval.md](references/publish-approval.md)

## 铁律（任何环节不可违反）

- 入库只能走 `knowledge_manage` 受控通道（import/update/list/remove），禁止用归档、复制、预览等旁路替代入库。
- 对话式导入的路径必须是**用户消息中逐字出现**的路径（信任锚）；不猜测、不拼接、不捏造路径。
- 原始文件永不修改：入库是"归档原件 + 建索引"，任何内容修正都产生新版本（update），旧版自动归档。
- 纯扫描件 PDF 必须走 OCR 两步入库（`pdfkit extract_text --ocr_fallback` → `import` 时传 `ocr_text_path`），禁止只做 OCR 不入库。
- 环节 5 审批未通过前，不得向用户宣称资料"已上架"。

## 快速参考：入库工具操作

| 场景 | 操作 |
|------|------|
| 普通资料（txt/md/csv/docx/xlsx/文字层PDF） | `knowledge_manage import`（附件或 paths 参数） |
| 纯扫描件 PDF | ① `pdfkit.py extract_text --input <PDF> --ocr_fallback` 存为 .txt → ② `import` 同时传 `paths=[PDF]` + `ocr_text_path=[txt]` |
| 替换新版本 | `knowledge_manage update`（按 sourceId，旧版自动归档） |
| 查看上架清单 | `knowledge_manage list`（可按 category 过滤） |
| 删除下架 | 先向用户确认 sourceId → `knowledge_manage remove` |

## 交付物清单（完整流程跑完应产出）

- [ ] 资料登记表（收集模板，含来源/日期/提交人）
- [ ] 格式审核结论（合格 / 已OCR / 已解密 / 退回原因）
- [ ] 分类与标签判定记录（含判定依据）
- [ ] 权限与审批链签署记录（提交人/审核人/发布人）
- [ ] 入库回执（KN- 编号、SHA256、段落数、版本号）
