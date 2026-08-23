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
    agent: "knowledge",
    keywords: /(达尔文技能|darwin[- ]?skill|技能自优化|优化.{0,6}技能|评估.{0,6}SKILL\.md)/i,
    reason: "任务需要评估或优化智能体技能本身",
    skill: "darwin-skill",
  },
  {
    agent: "knowledge",
    keywords: /(全栈(开发|应用)|前后端开发|设计.{0,12}(REST|GraphQL|数据库|API)|实现.{0,8}(前端|后端|Web 应用|网站))/i,
    reason: "任务需要全栈应用架构、接口、数据或实现方法",
    skill: "fullstack-dev",
  },
  {
    agent: "knowledge",
    keywords: /(GitHub|github).{0,10}(Issue|PR|Pull Request|CI|Actions|仓库|发布|Release|工作流)/i,
    reason: "任务需要管理 GitHub 仓库、Issue、PR、CI 或发布流程",
    skill: "github",
  },
  {
    agent: "knowledge",
    keywords: /(GitHub|github).{0,8}(AI 趋势|AI 热门|AI 榜单|AI 项目排行)/i,
    reason: "任务需要查询 GitHub 上的 AI 项目趋势",
    skill: "github-trending-cn",
  },
  {
    agent: "knowledge",
    keywords: /(browser-use|浏览器自动化|自动.{0,6}(点击|填写表单|网页截图|操作网页))/i,
    reason: "任务需要通过浏览器自动化执行导航、点击、输入或截图",
    skill: "browser-use",
  },
  {
    agent: "knowledge",
    keywords: /(web-access|登录态网页|动态网页|网页抓取|抓取.{0,8}(小红书|微博|推特|Twitter)|访问网页)/i,
    reason: "任务需要联网搜索、抓取或操作动态及登录态网页",
    skill: "web-access",
  },
  {
    agent: "office",
    keywords: /(提示词|Prompt).{0,8}(优化|设计|改写|评审)|(优化|设计|改写|评审).{0,8}(提示词|Prompt)|提示词工程/i,
    reason: "任务需要设计或优化提示词及智能体指令",
    skill: "prompt-engineering-expert",
  },
  {
    agent: "knowledge",
    keywords: /(数字分身|数字孪生|个人 AI 分身|把我做成.{0,4}(AI|智能体)|分析我的.{0,6}(聊天记录|日记|照片))/,
    reason: "任务需要从个人资料构建数字分身或自我知识档案",
    skill: "yourself-skill",
  },
  {
    agent: "knowledge",
    keywords: /(Obsidian|黑曜石).{0,8}(知识库|笔记|管理|自动化|整理)|管理.{0,6}(Obsidian|黑曜石)/i,
    reason: "任务需要管理或自动化 Obsidian 知识库",
    skill: "obsidian",
  },
  {
    agent: "knowledge",
    keywords: /(学习库|学习资料|复习题|练习题|知识测验|掌握度).{0,10}(生成|创建|整理|跟踪)|把.{0,10}(文档|代码|PDF).{0,10}(做成|转成).{0,4}学习/i,
    reason: "任务需要把资料转成结构化学习库、练习题或掌握度跟踪",
    skill: "tutor-skills",
  },
  {
    agent: "office",
    keywords: /(搜索|查找|下载).{0,8}(图片|照片|插图|素材图)|图片素材.{0,6}(搜索|下载)/,
    reason: "任务需要从多个来源搜索和下载图片素材",
    skill: "image-well",
  },
  {
    agent: "office",
    keywords: /(生成|创作|制作|编辑|修改).{0,8}(图片|图像|海报|插画)|文生图|图生图|Gemini.{0,6}(图片|图像)/i,
    reason: "任务需要使用生成式图像能力创建或编辑图片",
    skill: "nano-banana-pro",
  },
  {
    agent: "document",
    keywords: /(转为|转成|转换为|提取成).{0,4}Markdown|Markdown.{0,6}(转换|提取)|把.{0,8}(PDF|Word|PPT|图片|音频).{0,8}转.{0,4}Markdown/i,
    reason: "任务需要把文档、图片或音频转换为 Markdown",
    skill: "markitdown-skill",
  },
  {
    agent: "office",
    keywords: /(批量|一批).{0,8}(资料|文件|材料).{0,8}(整理|归类|去重|提取要点)|(资料|材料).{0,8}(去重归类|批量整理)/,
    reason: "任务需要批量整理资料、提取要点、去重和归类",
    skill: "material-organizer",
  },
  {
    agent: "office",
    keywords: /(去除|降低|消除).{0,6}(AI 痕迹|机器味|AI 味)|写得.{0,6}(自然|像人)|文本人性化/i,
    reason: "任务需要在保留事实的前提下改善文本自然度",
    skill: "office-assistant",
  },
  {
    agent: "office",
    keywords: /(内容|文案|邮件|落地页|广告).{0,8}(多版本|批量变体|自动优化|专家评分)|autoresearch/i,
    reason: "任务需要生成多版本内容并进行迭代评分优化",
    skill: "autoresearch",
  },
  {
    agent: "knowledge",
    keywords: /(个人|本地).{0,6}(Wiki|维基知识库)|(把|将).{0,12}(资料|文档|知识).{0,8}(做成|构建成|整理成).{0,4}(Wiki|维基)/i,
    reason: "任务需要从资料构建或维护个人 Wiki 知识库",
    skill: "llm-wiki-knowledge",
  },
  {
    agent: "report",
    keywords: /(地质录井|完井|气测|地化|岩性).{0,10}(审核清单|格式检查|常见问题|专业审查)/,
    reason: "任务需要使用地质录井专业审核清单检查格式、数据和专业内容",
    tool: "geology_report_review",
    skill: "geolog-logging-review",
  },
  {
    agent: "contract",
    keywords: /(腾讯电子签|电子签|在线签署|发起签署|签署合同|合同签署)/,
    reason: "任务需要通过腾讯电子签处理合同签署或在线合同流程",
    skill: "tencent-esign-contract",
  },
  {
    agent: "contract",
    keywords: /(起草|编制|拟定|草拟|编写).{0,8}(合同|协议)/,
    reason: "任务需要起草、编写或编制合同/协议初稿",
    skill: "起草合同",
  },
  {
    agent: "contract",
    keywords: /(合同|协议).{0,6}(模板|范本)/,
    reason: "任务需要基于模板起草合同",
    skill: "起草合同",
  },
  {
    agent: "contract",
    keywords: /(合同|协议).{0,6}(台账|履约|到期|续签|续约|提醒)/,
    reason: "任务需要管理合同台账、到期提醒或履约节点",
    skill: "合同台账提醒",
  },
  {
    agent: "contract",
    keywords: /(合同|协议).{0,6}(风险清单|审批流程)/,
    reason: "任务需要列出合同风险清单或走审批流程",
    skill: "审查合同",
  },
  {
    agent: "tender",
    keywords: /(编制|起草|写|设计).{0,8}(招标文件|招标书|评标办法|招标技术要求|资质条件)/,
    reason: "任务需要编制招标文件、技术要求、评标办法或资质条件",
    skill: "tender-management",
  },
  {
    agent: "office",
    keywords: /(腾讯会议|会议号).{0,12}(预约|创建|修改|取消|查询|录制|转写|纪要)|(预约|创建|修改|取消).{0,8}腾讯会议/,
    reason: "任务涉及腾讯会议管理、录制、转写或智能纪要",
    skill: "tencent-meeting-skill",
  },
  {
    agent: "office",
    keywords: /(会议纪要|整理会议记录|会议摘要|会议决议|会议待办|行动项|周例会纪要|HSE.{0,4}例会)/i,
    reason: "任务需要生成会议纪要并提取决议、待办或跟踪事项",
    tool: "office_document",
    skill: "office-assistant",
  },
  {
    agent: "office",
    keywords: /(录音|音频|语音).{0,8}(转写|转文字|识别文字|字幕)/,
    reason: "任务需要先把音频或录音转写为文字",
    skill: "openai-whisper-api",
  },
  {
    agent: "document",
    keywords:
      /(PDF|pdf).{0,12}((转|转换).{0,3}(Word|Excel|PPT|图片|HTML)|合并|拆分|压缩|加密|解密|去水印|修复)|(Word|Excel|PPT|图片|CAD).{0,8}(转|转换).{0,3}(PDF|pdf)/,
    reason: "任务需要通过 WPS 云转换处理 PDF、Office、图片或 CAD 文件",
    skill: "wpscli",
  },
  {
    agent: "document",
    keywords: /(PDF|pdf).{0,12}(读取|提取|编辑|裁剪|旋转|水印|表单|签名|OCR|页码|页面)/,
    reason: "任务直接处理已有 PDF 文件",
    skill: "pdfkit-py",
  },
  {
    agent: "document",
    keywords:
      /(图片|扫描件|截图|PDF).{0,8}(OCR|文字识别|提取文字)|(识别|提取).{0,4}(图片|扫描件|截图|PDF).{0,6}(文字|文本)?|腾讯云.{0,4}OCR/i,
    reason: "任务需要对图片、扫描件或 PDF 做高精度文字识别",
    skill: "tencentcloud-ocr",
  },
  {
    agent: "document",
    keywords: /(生成|制作|编辑|处理).{0,8}(PPT|PPTX|PowerPoint|幻灯片)/i,
    reason: "任务需要生成或编辑可交付的演示文稿",
    skill: "pptx-generator",
  },
  {
    agent: "document",
    keywords: /(生成|制作|编辑|处理).{0,8}(XLSX|Excel|电子表格)/i,
    reason: "任务需要生成、读取或处理 Excel 工作簿",
    skill: "minimax-xlsx",
  },
  {
    agent: "document",
    keywords: /(生成|制作|编辑|处理).{0,8}(DOCX|Word|正式文档)/i,
    reason: "任务需要生成、读取或处理 Word 文档",
    tool: "office_document",
    skill: "minimax-docx",
  },
  {
    agent: "knowledge",
    keywords: /(深度调研|研究报告|多源调研|专题调研|系统调研)/,
    reason: "任务需要结构化、多来源的深度研究工作流",
    skill: "deep-research",
  },
  {
    agent: "knowledge",
    keywords: /(AI|大模型|LLM).{0,8}(日报|资讯|新闻|热点|动态|最近发布)/i,
    reason: "任务需要查询最新 AI 行业资讯",
    skill: "aihot",
  },
  {
    agent: "knowledge",
    keywords: /(GitHub|github).{0,8}(趋势|热门|榜单|AI 项目)/i,
    reason: "任务需要查询 GitHub 热门项目或 AI 趋势",
    skill: "github-trending-cn",
  },
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
    skill: "office-assistant",
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
    skill: "geolog-logging-review",
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
