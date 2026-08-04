import { describe, expect, test } from "bun:test"
import { routeXiaoxueTask } from "../../src/agent/xiaoxue-router"

describe("xiaoxue agent router", () => {
  test.each([
    ["请审核这份XX井地质录井报告", "report", "geology_report_review"],
    ["解析招标文件并检查废标风险", "tender", "tender_review"],
    ["审查技术服务合同的付款和违约条款", "contract", "contract_review"],
    ["帮我写一份阶段工作总结", "office", "office_document"],
    ["查询地质录井标准和公司制度依据", "knowledge", "knowledge_search"],
    ["把这份制度导入知识库", "knowledge", "knowledge_manage"],
    ["用新文件更新知识资料", "knowledge", "knowledge_manage"],
    ["用长文档专家帮我规划一份万字项目报告", "office", "office_document"],
    ["请用花叔审稿专家保留原格式并留下修订痕迹", "document", undefined],
    ["用花叔留痕方式审查这份合同并保留修订痕迹", "contract", "contract_review"],
    ["给这份地质录井报告添加批注并保留原格式", "report", "geology_report_review"],
    ["使用 LLM Wiki 检查知识库中的矛盾和孤立页面", "knowledge", "knowledge_manage"],
    ["把确认后的材料导出为正式DOCX", "document", undefined],
    ["帮我预约明天下午的腾讯会议", "office", undefined],
    ["把这段录音转写成文字", "office", undefined],
    ["起草一份录井技术服务合同", "contract", undefined],
    ["设计录井服务招标的评标办法", "tender", undefined],
    ["把这个PDF拆分并压缩", "document", undefined],
    ["做一份人工智能应用的深度调研", "knowledge", undefined],
  ] as const)("%s routes to %s", (input, agent, tool) => {
    const result = routeXiaoxueTask(input)
    expect(result.agent).toBe(agent)
    expect(result.confidence).toBe("deterministic")
    expect(result.tool).toBe(tool)
  })

  test.each([
    ["请用长文档专家分章续写", "long-document-writing"],
    ["请用花叔审稿专家留下批注", "document-review-tracked"],
    ["用 LLM Wiki 做知识健康巡检", "llm-wiki-knowledge"],
    ["预约腾讯会议并查询会议号", "tencent-meeting-skill"],
    ["整理周例会纪要并提取会议待办", "meeting-minutes-manager"],
    ["把录音转写成文字", "openai-whisper-api"],
    ["起草录井技术服务合同", "contract-management"],
    ["通过腾讯电子签发起合同签署", "tencent-esign-contract"],
    ["编制招标技术要求和资质条件", "tender-management"],
    ["把 PDF 转 Word", "wpscli"],
    ["读取 PDF 的表单和页面", "pdfkit-py"],
    ["识别扫描件中的文字", "tencentcloud-ocr"],
    ["生成一份正式 Word 文档", "minimax-docx"],
    ["制作一份项目统计 Excel", "minimax-xlsx"],
    ["生成一份项目汇报 PPT", "pptx-generator"],
    ["查询最近的 AI 行业动态", "aihot"],
    ["做一份多来源深度调研", "deep-research"],
    ["用达尔文技能评估并优化这个 SKILL.md", "darwin-skill"],
    ["设计一个全栈应用的 REST API 和数据库", "fullstack-dev"],
    ["帮我检查 GitHub PR 和 Actions", "github"],
    ["查询 GitHub AI 项目排行榜", "github-ai-trends"],
    ["查询 GitHub 本周热门项目", "github-trending-cn"],
    ["用浏览器自动点击页面并填写表单", "browser-use"],
    ["抓取这个登录态动态网页", "web-access"],
    ["优化这段智能体提示词", "prompt-engineering-expert"],
    ["根据我的日记和聊天记录创建数字分身", "yourself-skill"],
    ["整理我的 Obsidian 知识库", "obsidian"],
    ["把这批 PDF 做成学习库并生成练习题", "tutor-skills"],
    ["搜索并下载几张录井现场图片素材", "image-well"],
    ["生成一张项目宣传插画", "nano-banana-pro"],
    ["把这个 Word 转成 Markdown", "markitdown-skill"],
    ["批量整理这批资料并去重归类", "material-organizer"],
    ["去除这段文字的 AI 痕迹，让它更自然", "humanizer"],
    ["为这封邮件生成多版本并自动优化评分", "autoresearch"],
    ["把这些资料构建成个人 Wiki", "llm-wiki"],
    ["使用地质录井专业审核清单检查气测报告", "geolog-logging-review"],
    ["请审核这份呼北2井录井报告", "geolog-logging-review"],
  ] as const)("%s selects %s", (input, skill) => {
    expect(routeXiaoxueTask(input).skill).toBe(skill)
  })
  test("ambiguous tasks use a confirmable office fallback", () => {
    const result = routeXiaoxueTask("帮我处理一下这个事情")
    expect(result.agent).toBe("office")
    expect(result.confidence).toBe("suggested")
    expect(result.reason).toContain("确认")
  })
})
