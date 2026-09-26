# 录井小雪办公网 Skill 路由

本版本只路由本地文件、单位内网材料和本机工具。GitHub、公共网页搜索、浏览器自动化、云端 OCR/转写/转换、外部会议和电子签能力均不提供。

| 用户意图                                                   | Agent     | Tool                  | Skill                          |
| ---------------------------------------------------------- | --------- | --------------------- | ------------------------------ |
| 日常办公、会议纪要、材料润色                               | office    | office_document       | office-assistant               |
| 油田信息化立项、方案、选型、红黄绿灯七板块项目周报、汇报   | office    | -                     | oilfield-it-project-management |
| 单位固定公文口径周报、甲方周报或旬报、联席会汇报、党建周报、个人周报、院级合并汇总 | office | - | weekly-report |
| 生产运行日报、每日汇报、各单位日报合并、日报.xls 汇总及三张院级表 | office | - | daily-report |
| 论文章节写作、文献材料解析、科学计算、仿真、科研数据分析与可复现图表 | office | - | research-writing-compute |
| 论文查重与参考文献格式、实验设计与样本量、研究基线脚手架 | office | - | papercheck / experiment-design / research-baseline-builder |
| 地质录井报告和整井资料审核                                 | report    | geology_report_review | geolog-logging-review          |
| 个人离线报告修改经验的预览、确认保存、检索和撤销             | xiaoxue   | review_strategy       | geolog-logging-review          |
| 现场监督、照片、标准、问题通报、案例                       | report    | -                     | mud-logging-supervision        |
| 井控风险                                                   | report    | -                     | well-control-risk-assessment   |
| 招标编制、标书审核、投标响应                               | tender    | tender_review         | tender-management              |
| 合同起草、审核、对比、NDA、台账、谈判                      | contract  | contract_review       | contract-management            |
| 地质录井知识查询                                           | knowledge | knowledge_search      | geology-knowledge              |
| 知识库导入、入库、更新、删除、资料清单、入库规范与审批流程 | knowledge | knowledge_manage      | knowledge-ingestion-pipeline   |
| 资料整理、知识卡、Wiki 管理                                | knowledge | knowledge_manage      | knowledge-management           |
| Skill 审计、合并和优化                                     | knowledge | -                     | skill-governance               |
| 本地 PDF 操作                                              | document  | -                     | pdfkit-py                      |
| Word / Excel / PPT / PDF 审核、批注、整改和最终修改        | document  | office_document_revise| office-document-revision       |
| Word 生成编辑                                              | document  | office_document       | office-assistant               |
| 高设计感、模板化、统一视觉系统的技术汇报 PPT 新建          | document  | slide_visual          | ppt-implement                  |
| Excel / 普通 PPT 生成、已有 PPT 编辑、美化并输出同类型文件 | document  | -                     | minimax-xlsx / pptx-generator  |

## 路由边界

1. 合同和招投标必须先确认业务立场；证据不足时写“未确认，需要人工验证”。
2. 留痕审稿只处理批注和修订方法，专业风险仍由合同或录井审核入口负责。
3. GitHub、网页、URL、云服务、API Key、在线会议、在线签署等请求不得映射到已删除 Skill；应明确说明办公网版本不支持。
4. 业务 Skill 负责语义和证据，文件格式 Skill 只负责本地文件读写，不产生新的专业结论。
5. 通用文件转 Markdown、图片 OCR 和音频转写在本办公网版本不可用；扫描 PDF 的 OCR 仅由已打包的 `pdfkit-py` 提供。用户要求把资料（含扫描件 PDF）导入/入库知识库时，必须路由到 knowledge agent 走 `knowledge_manage` 受控入库（扫描件两步：pdfkit OCR → import + ocr_text_path），不得由 office 或其他 agent 用归档工具替代。
6. `minimax-docx` 不进入办公网发布；Word 核心能力统一使用 `office_document` 与内置 `document_engine`。
7. 用户要求审核或修改本地 DOCX/XLSX/PPTX/PDF 时，必须调用 `office_document_revise` 生成并交付同类型标注版和最终修改版，不得只给建议；原文件不得覆盖。
8. `office_document_revise` 返回两份文件的右侧结构化预览；预览不能替代实际文件交付。普通单文件生成完成后仍调用 `office_artifact_preview`。
9. “信息化项目周报”“项目进度周报”以及明确要求红黄绿灯、七板块的项目管理周报路由到 `oilfield-it-project-management`；普通“写周报”、固定单位公文口径、项目部信息化周报、甲方周报/旬报、联席会汇报、党建周报、个人周报及多单位合并汇总路由到 `weekly-report`。
10. “日报”“每日汇报”“今天的生产运行情况”“日报.xls”和“生成三张表”路由到 `daily-report`；“周报”“本周”“旬报”仍路由到 `weekly-report`。口语“把今天的报整一下”按日报处理，但带“周、本周、旬、项目周报”的请求不得命中日报技能。
11. 论文章节写作、用户提供文献的本地解析、科学计算、仿真、科研数据分析和可复现学术图表路由到 `research-writing-compute`；查重或引用格式检查仍归 `papercheck`，实验方案仍归 `experiment-design`，研究基线脚手架仍归 `research-baseline-builder`，纯格式排版仍归 `office-assistant`。
12. 明确要求“高设计感、精美、模板化、统一视觉系统、技术汇报 PPT”且属于新建演示文稿时路由到 `ppt-implement`；普通快速生成、已有 PPT 修改/美化和同类型审稿继续使用 `pptx-generator` 或 `office-document-revision`，避免两套 PPT 技能同时命中。
13. 用户要求从已确认的原稿与人工定稿提炼、保存、查找或撤销个人审核经验时，小雪主智能体直接调用 `review_strategy`，不要委派给 report Agent 或把它当作 `geology_report_review` 的子命令。若缺少文件，用通俗中文引导用户上传“修改前原稿”和“人工定稿”两份 DOCX，说明小雪先给待确认卡、用户核对后再点保存按钮；不要让用户自己填写 action、JSON 或经验 ID。`preview` 只生成待确认卡；保存和撤销必须分别等待用户单独发送精确确认指令。专业报告审核仍委派 report Agent。
