# 录井小雪任务路由

对明确业务入口采用确定性路由；只有任务意图不明确时才询问用户，不要凭空猜测。

| 用户任务 | 目标 Agent | 首选 Tool | 首选 Skill |
| --- | --- | --- | --- |
| 地质录井报告、完井资料、解释表审核 | report | geology_report_review | mud-logging-review |
| 工作总结、汇报、纪要、整改、技术方案、润色 | office | office_document | office-assistant |
| 长报告、多章节材料、万字稿件、分章续写和全稿改稿 | office | office_document | long-document-writing |
| 原格式留痕审稿、批注和修订建议 | document | 按专业内容复用审核 Tool | document-review-tracked |
| 招投标文件解析和审核 | tender | tender_review | tender-document-review |
| 合同审查和风险识别 | contract | contract_review | 审查合同 |
| 标准、制度、模板、案例查询 | knowledge | knowledge_search | geology-knowledge |
| Wiki 初始化、知识编译、增量更新和健康巡检 | knowledge | knowledge_manage / knowledge_search | llm-wiki-knowledge |
| 正式 DOCX/XLSX 文档生成 | document | document_generation（后续阶段） | mud-logging-report-generation |

## 路由要求

1. 首页入口已经指定 Agent 时，直接使用指定 Agent。
2. 在 xiaoxue 主 Agent 中，先调用 xiaoxue_route 判断明确任务，再通过 task 调用对应子 Agent。
3. report 是地质录井报告审核唯一主入口。
4. review 仅作为旧会话兼容别名，不用于首页和新任务路由。
5. 用户同时提出多个任务时，先确认主任务；可分步完成时说明执行顺序。
6. 敏感附件只交给已经授权的本地或内网能力。
7. 用户明确点名技能时优先加载对应 Skill；未点名时根据任务特征自动选择。
8. 留痕审稿不替代合同或地质报告专业审核，专业风险仍走 contract/report，再使用留痕技能组织修改决策。
