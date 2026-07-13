export type XiaoxueBusinessAgent = "office" | "report" | "tender" | "contract" | "knowledge" | "document"

export type XiaoxueRoute = {
  agent: XiaoxueBusinessAgent
  confidence: "deterministic" | "suggested"
  reason: string
  tool?: string
  skill: string
}

const routes: Array<{
  agent: XiaoxueBusinessAgent
  keywords: RegExp
  reason: string
  tool?: string
  skill: string
}> = [
  {
    agent: "contract",
    keywords: /(?=.*(合同|协议|NDA|保密协议))(?=.*(花叔|留痕|批注|修订痕迹|保留原格式))/i,
    reason: "合同任务需要专业风险审核并叠加留痕审稿方法",
    tool: "contract_review",
    skill: "document-review-tracked",
  },
  {
    agent: "report",
    keywords: /(?=.*(地质|录井|完井|油气显示|气测|岩性|地层))(?=.*(报告|资料|附表))(?=.*(花叔|留痕|批注|修订痕迹|保留原格式))/,
    reason: "地质录井报告需要专业规则审核并叠加留痕审稿方法",
    tool: "geology_report_review",
    skill: "document-review-tracked",
  },
  {
    agent: "document",
    keywords: /(花叔(文档)?审稿|留痕审稿|审稿专家|批注.{0,6}修订|修订痕迹|保留.{0,6}(原格式|原文).{0,8}(审稿|改稿))/,
    reason: "用户明确要求留痕文档审稿、批注或修订建议",
    skill: "document-review-tracked",
  },
  {
    agent: "office",
    keywords: /(长文档(写作|改稿|专家)?|长篇(写作|改稿|报告)|多章节(材料|报告|手稿)|万字(材料|报告)|章节地图|分章续写)/,
    reason: "任务需要长文档规划、分章写作或全稿一致性改稿",
    tool: "office_document",
    skill: "long-document-writing",
  },
  {
    agent: "knowledge",
    keywords: /(LLM[- ]?Wiki|知识编译|Wiki.{0,8}(初始化|灌入|导入|增量更新|巡检|健康检查|矛盾|孤立页)|检查.{0,8}(Wiki|知识库).{0,8}(矛盾|过时|孤立|引用))/i,
    reason: "任务需要使用 LLM Wiki 方法编译、查询或巡检知识",
    tool: "knowledge_manage",
    skill: "llm-wiki-knowledge",
  },  {
    agent: "report",
    keywords: /(地质|录井|完井|井史|油气显示|气测|岩性|地层).{0,12}(报告|资料|附表|审核|检查)|报告审核/,
    reason: "任务涉及地质录井报告或相关资料审核",
    tool: "geology_report_review",
    skill: "mud-logging-review",
  },
  {
    agent: "tender",
    keywords: /(招标|投标|标书|评分办法|废标|技术响应)/,
    reason: "任务涉及招投标文件解析或审核",
    tool: "tender_review",
    skill: "tender-document-review",
  },
  {
    agent: "contract",
    keywords: /(合同|协议|NDA|保密协议|付款条款|违约责任|合同审查)/i,
    reason: "任务涉及合同或协议风险审查",
    tool: "contract_review",
    skill: "审查合同",
  },
  {
    agent: "knowledge",
    keywords: /(导入|添加|更新|替换|删除|移除|查看|列出).{0,8}(知识库|知识资料|资料清单)|(知识库|知识资料).{0,8}(导入|添加|更新|替换|删除|移除|清单)/,
    reason: "任务涉及本地知识资料导入、清单或删除",
    tool: "knowledge_manage",
    skill: "geology-knowledge",
  },
  {
    agent: "knowledge",
    keywords: /(查询|查找|检索|依据|标准|规范|制度|模板|历史案例|专家经验)/,
    reason: "任务以企业知识和依据查询为主",
    tool: "knowledge_search",
    skill: "geology-knowledge",
  },
  {
    agent: "document",
    keywords: /(生成|导出|制作).{0,8}(DOCX|Word|XLSX|Excel|正式文件|文档)/i,
    reason: "任务要求生成或导出正式文档",
    skill: "mud-logging-report-generation",
  },
  {
    agent: "office",
    keywords: /(工作总结|工作汇报|汇报材料|会议纪要|整改清单|工作计划|技术方案|项目申报|科研材料|文档润色|材料润色|扩写|续写|改稿)/,
    reason: "任务属于公司日常办公材料处理",
    tool: "office_document",
    skill: "office-assistant",
  },
]

export function routeXiaoxueTask(input: string): XiaoxueRoute {
  const value = input.trim()
  const matched = routes.find((route) => route.keywords.test(value))
  if (matched) {
    return {
      agent: matched.agent,
      confidence: "deterministic",
      reason: matched.reason,
      tool: matched.tool,
      skill: matched.skill,
    }
  }
  return {
    agent: "office",
    confidence: "suggested",
    reason: "未识别到明确专业审核或知识查询意图，暂按日常办公任务处理并应向用户确认",
    tool: "office_document",
    skill: "office-assistant",
  }
}

export const XIAOXUE_AGENT_ROUTES = routes.map((route) => ({
  agent: route.agent,
  tool: route.tool,
  skill: route.skill,
  reason: route.reason,
}))
