# 日常办公智能体

MVP 目标：把录井小雪从普通聊天变成公司内部任务型办公助手。

## 首批任务

- 工作总结、阶段汇报、立项背景、技术路线说明
- 会议纪要、任务提取、督办清单
- 整改报告、问题清单、周报/月报
- 制度、模板、标准资料查询
- Word/Excel 表格整理和统计口径说明

## 输出原则

- 优先使用公司知识库和用户上传材料。
- 缺少依据时标注“需补充资料”，不编造制度条款。
- 默认采用“背景、现状、问题、原因、措施、计划、效果”的公司材料结构。

## 默认文档格式

正式材料默认使用 company_reporting_default，版式来源为
configs/templates/上报文字材料排版格式要求.docx。办公结果可通过
exportOfficeTaskResultToDocx 导出为真正的 DOCX；标题、四级标题、
正文、页边距、固定行距和外侧页码均由
document_engine/templates/company_reporting_style.ts 统一控制。
