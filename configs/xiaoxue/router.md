# 录井小雪办公网 Skill 路由

本版本只路由本地文件、单位内网材料和本机工具。GitHub、公共网页搜索、浏览器自动化、云端 OCR/转写/转换、外部会议和电子签能力均不提供。

| 用户意图 | Agent | Tool | Skill |
|---|---|---|---|
| 日常办公、会议纪要、材料润色 | office | office_document | office-assistant |
| 油田信息化立项、方案、选型、周报、汇报 | office | - | oilfield-it-project-management |
| 地质录井报告和整井资料审核 | report | geology_report_review | geolog-logging-review |
| 现场监督、照片、标准、问题通报、案例 | report | - | mud-logging-supervision |
| 井控风险 | report | - | well-control-risk-assessment |
| 招标编制、标书审核、投标响应 | tender | tender_review | tender-management |
| 合同起草、审核、对比、NDA、台账、谈判 | contract | contract_review | contract-management |
| 地质录井知识查询 | knowledge | knowledge_search | geology-knowledge |
| 资料整理、知识卡、Wiki 管理 | knowledge | knowledge_manage | knowledge-management |
| Skill 审计、合并和优化 | knowledge | - | skill-governance |
| 本地 PDF 操作 | document | - | pdfkit-py |
| Word 生成编辑 | document | office_document | office-assistant（document_engine） |
| Excel / PPT 生成编辑 | document | - | minimax-xlsx / pptx-generator |

## 路由边界

1. 合同和招投标必须先确认业务立场；证据不足时写“未确认，需要人工验证”。
2. 留痕审稿只处理批注和修订方法，专业风险仍由合同或录井审核入口负责。
3. GitHub、网页、URL、云服务、API Key、在线会议、在线签署等请求不得映射到已删除 Skill；应明确说明办公网版本不支持。
4. 业务 Skill 负责语义和证据，文件格式 Skill 只负责本地文件读写，不产生新的专业结论。
5. 通用文件转 Markdown、图片 OCR 和音频转写在本办公网版本不可用；扫描 PDF 的 OCR 仅由已打包的 `pdfkit-py` 提供。
6. `minimax-docx` 不进入办公网发布；Word 核心能力统一使用 `office_document` 与内置 `document_engine`。
