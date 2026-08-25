# 录井小雪任务路由

对明确业务入口采用确定性路由；只有任务意图不明确时才询问用户，不要凭空猜测。

| 用户任务 | 目标 Agent | 首选 Tool | 首选 Skill |
| --- | --- | --- | --- |
| 地质录井报告、完井资料、解释表审核 | report | geology_report_review | geolog-logging-review |
| 地质录井报告格式、专业内容和常见问题清单审核 | report | geology_report_review | geolog-logging-review |
| 工作总结、汇报、纪要、整改、技术方案、润色 | office | office_document | office-assistant |
| 会议纪要、决议和待办提取 | office | office_document | office-assistant |
| 音频或录音转写 | office | 按授权调用外部转写 | openai-whisper-api |
| 腾讯会议预约、录制、转写和智能纪要 | office | 按授权调用外部服务 | tencent-meeting-skill |
| 长报告、多章节材料、万字稿件、分章续写和全稿改稿 | office | office_document | office-assistant |
| 原格式留痕审稿、批注和修订建议 | document | 按专业内容复用审核 Tool | document-review-tracked |
| 招投标文件解析和审核 | tender | tender_review | tender-document-review |
| 招标文件、技术要求、评标办法和资质条件编制 | tender | - | tender-management |
| 投标文件、投标章节、技术标、商务标、商务报价、报价书、投标响应编制 | tender | - | tender-bid-generation |
| 合同审查和风险识别 | contract | contract_review | 审查合同 |
| 合同起草、编写或编制合同/协议初稿 | contract | - | 起草合同 |
| 合同模板、合同范本生成 | contract | - | 起草合同 |
| 合同台账、到期提醒、续约跟踪、履约节点 | contract | - | 合同台账提醒 |
| 合同风险清单、合同审批流程 | contract | contract_review | 审查合同 |
| 腾讯电子签在线签署 | contract | 按授权调用外部服务 | tencent-esign-contract |
| 标准、制度、模板、案例查询 | knowledge | knowledge_search | geology-knowledge |
| 深度调研、AI 资讯和 GitHub 趋势 | knowledge | 按任务选择本地或联网能力 | deep-research / aihot / github-trending-cn |
| Wiki 初始化、知识编译、增量更新和健康巡检 | knowledge | knowledge_manage / knowledge_search | llm-wiki-knowledge |
| 正式 DOCX/XLSX 文档生成 | document | document_generation（后续阶段） | mud-logging-report-generation |
| PDF、Office、OCR 和格式转换 | document | 按文件类型和授权选择 | pdfkit-py / minimax-docx / minimax-xlsx / pptx-generator / tencentcloud-ocr / wpscli |

## 路由要求

1. 首页入口已经指定 Agent 时，直接使用指定 Agent。
2. 在 xiaoxue 主 Agent 中，先调用 `xiaoxue_route` 判断明确任务；拿到结果后必须立即调用 `skill`，其 `name` 使用路由结果的 `skill`；加载成功后再通过 `task` 调用对应子 Agent，并在任务描述中明确写入已选择的技能名。
3. report 是地质录井报告审核唯一主入口。
4. review 仅作为旧会话兼容别名，不用于首页和新任务路由。
5. 用户同时提出多个任务时，先确认主任务；可分步完成时说明执行顺序。
6. 敏感附件只交给已经授权的本地或内网能力。
7. 用户明确点名技能时优先加载对应 Skill；未点名时根据任务特征自动选择。
8. 留痕审稿不替代合同或地质报告专业审核，专业风险仍走 contract/report，再使用留痕技能组织修改决策。
9. 不得只在文字中声称“已调用技能”。只有 `skill` Tool 返回成功后，才能按该技能流程继续；加载失败时应报告技能名和失败原因。
