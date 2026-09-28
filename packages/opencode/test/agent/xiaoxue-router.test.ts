import { describe, expect, test } from "bun:test"
import { routeXiaoxueTask, XIAOXUE_AGENT_ROUTES } from "../../src/agent/xiaoxue-router"

describe("xiaoxue agent router", () => {
  test("the ingestion route is covered by the release profile", async () => {
    const profile = await Bun.file(
      new URL("../../../../configs/xiaoxue/rc-release-profile.json", import.meta.url),
    ).json()
    expect(profile.rc.INTERNAL_DEPENDENCIES).toContain("knowledge-ingestion-pipeline")
    expect(profile.corePaths.knowledge_retrieval.skills).toContain("knowledge-ingestion-pipeline")
  })
  test.each([
    ["请审核这份XX井地质录井报告", "report", "geolog-logging-review", "geology_report_review"],
    ["解析招标文件并检查废标风险", "tender", "tender-management", "tender_review"],
    ["编制一份完整的投标响应文件", "tender", "tender-management", "tender_review"],
    ["审查技术服务合同的付款和违约条款", "contract", "contract-management", "contract_review"],
    ["起草一份录井技术服务合同", "contract", "contract-management", "contract_review"],
    ["查询地质录井标准和公司制度依据", "knowledge", "geology-knowledge", "knowledge_search"],
    ["把这份制度导入知识库", "knowledge", "knowledge-ingestion-pipeline", "knowledge_manage"],
    ["导入知识库", "knowledge", "knowledge-ingestion-pipeline", "knowledge_manage"],
    ["知识库导入这份扫描件 PDF", "knowledge", "knowledge-ingestion-pipeline", "knowledge_manage"],
    ["识别扫描件 PDF 文字后导入知识库", "knowledge", "knowledge-ingestion-pipeline", "knowledge_manage"],
    ["资料入库审批流程", "knowledge", "knowledge-ingestion-pipeline", "knowledge_manage"],
    ["使用 LLM Wiki 检查知识库中的矛盾和孤立页面", "knowledge", "knowledge-management", "knowledge_manage"],
    ["整理周例会纪要并提取会议待办", "office", "office-assistant", "office_document"],
    ["帮我写周报", "office", "weekly-report", undefined],
    ["出一份塔里木甲方旬报", "office", "weekly-report", undefined],
    ["把基层单位的周报合并汇总", "office", "weekly-report", undefined],
    ["把各单位日报合并成院级生产运行日报", "office", "daily-report", undefined],
    ["日报.xls 汇总生成三张表", "office", "daily-report", undefined],
    ["把这个PDF拆分并压缩", "document", "pdfkit-py", undefined],
    ["生成一份Word正式文档", "document", "office-assistant", "office_document"],
    ["修改我拖进来的PPT并输出修改后的PPTX", "document", "office-document-revision", "office_document_revise"],
    ["帮我美化这份PowerPoint", "document", "pptx-generator", undefined],
    ["做一份10页高设计感技术汇报PPT", "document", "ppt-implement", "slide_visual"],
    ["基于本地实验数据做可复现的科学计算和学术图表", "office", "research-writing-compute", undefined],
    ["检查论文参考文献格式是否符合GB/T 7714", "office", "papercheck", undefined],
    ["规划随机化实验并计算样本量和统计功效", "office", "experiment-design", undefined],
    ["为机器学习研究搭建基线训练脚手架", "office", "research-baseline-builder", undefined],
    ["请治理并合并这些重复 Skill", "knowledge", "skill-governance", undefined],
    ["用女娲蒸馏专家的思维方式做成技能", "knowledge", "nuwa-skill", undefined],
    ["学习我的操作习惯并形成工作流", "knowledge", "nuwa-workflow", "workflow_learning"],
    ["按上次流程做这份材料", "knowledge", "nuwa-workflow", "workflow_learning"],
    ["根据我的日记创建数字分身", "knowledge", "cognitive-profile", undefined],
  ] as const)("%s routes to %s/%s", (input, agent, skill, tool) => {
    const result = routeXiaoxueTask(input)
    expect(result.agent).toBe(agent)
    expect(result.available).toBe(true)
    expect(result.skill).toBe(skill)
    expect(result.tool).toBe(tool)
    expect(result.confidence).toBe("deterministic")
  })

  test.each([
    ["审核这份Word并给我标注版和最终修改版", "office-document-revision"],
    ["检查这个Excel并直接生成修改后的XLSX", "office-document-revision"],
    ["审查这份PPT并输出标注版", "office-document-revision"],
    ["修改这份PDF并保留批注", "office-document-revision"],
    ["报告审核并生成最终修改版", "office-document-revision"],
  ])("%s routes to the office revision workflow", (input, skill) => {
    const result = routeXiaoxueTask(input)
    expect(result.agent).toBe("document")
    expect(result.skill).toBe(skill)
    expect(result.tool).toBe("office_document_revise")
  })

  test.each([
    ["把这段录音转写成文字", "当前办公网版本未包含本地音频转写运行时。"],
    ["识别截图中的文字", "当前办公网版本未包含本地图片 OCR 运行时。"],
    ["把这份Word转换为Markdown", "当前办公网版本未包含通用本地文件转 Markdown 运行时。"],
  ])("%s reports the unavailable office-network capability", (input, message) => {
    const result = routeXiaoxueTask(input)
    expect(result.available).toBe(false)
    expect(result.confidence).toBe("suggested")
    expect(result.reason).toContain(message)
    expect(result.skill).not.toBe("markitdown-skill")
  })

  test("specific tracked-review routes win over generic business routes", () => {
    expect(routeXiaoxueTask("用花叔留痕方式审查这份合同并保留修订痕迹").skill).toBe("document-review-tracked")
    expect(routeXiaoxueTask("给这份地质录井报告添加批注并保留原格式").skill).toBe("document-review-tracked")
  })

  test("consolidated business families use one public entry", () => {
    expect(routeXiaoxueTask("编制投标文件的技术标章节").skill).toBe("tender-management")
    expect(routeXiaoxueTask("审核这份投标文件并列出废标风险").skill).toBe("tender-management")
    expect(routeXiaoxueTask("编制招标文件的技术规范").skill).toBe("tender-management")
    expect(routeXiaoxueTask("对比两份合同并整理谈判备忘").skill).toBe("contract-management")
    expect(routeXiaoxueTask("编写油田信息化项目周报").skill).toBe("oilfield-it-project-management")
  })

  test("weekly report routing separates fixed official formats from project status reports", () => {
    expect(routeXiaoxueTask("整理本周工作，出院里的联席会汇报").skill).toBe("weekly-report")
    expect(routeXiaoxueTask("出项目部信息化周报").skill).toBe("weekly-report")
    expect(routeXiaoxueTask("生成个人周报").skill).toBe("weekly-report")
    expect(routeXiaoxueTask("出院里的汇报").skill).toBe("weekly-report")
    expect(routeXiaoxueTask("汇总成院里的材料").skill).toBe("weekly-report")
    expect(routeXiaoxueTask("生成红黄绿灯七板块项目周报").skill).toBe("oilfield-it-project-management")
    expect(routeXiaoxueTask("编写信息化项目周报").skill).toBe("oilfield-it-project-management")
  })

  test("daily report routing stays separate from weekly report workflows", () => {
    expect(routeXiaoxueTask("出今天的日报").skill).toBe("daily-report")
    expect(routeXiaoxueTask("把今天的报整一下").skill).toBe("daily-report")
    expect(routeXiaoxueTask("生成每日汇报").skill).toBe("daily-report")
    expect(routeXiaoxueTask("从填报系统导出的日报.xls生成三张表").skill).toBe("daily-report")
    expect(routeXiaoxueTask("帮我写本周周报").skill).toBe("weekly-report")
    expect(routeXiaoxueTask("编写信息化项目周报").skill).toBe("oilfield-it-project-management")
  })

  test("network and GitHub skills are not routable", () => {
    const removed = new Set([
      "aihot",
      "browser-use",
      "deep-research",
      "github",
      "github-trending-cn",
      "image-well",
      "nano-banana-pro",
      "openai-whisper-api",
      "tencent-esign-contract",
      "tencent-meeting-skill",
      "tencentcloud-ocr",
      "web-access",
      "wpscli",
    ])
    XIAOXUE_AGENT_ROUTES.forEach((route) => expect(removed.has(route.skill)).toBe(false))
    expect(routeXiaoxueTask("帮我检查 GitHub PR 和 Actions").confidence).toBe("suggested")
    expect(routeXiaoxueTask("抓取这个登录态动态网页").confidence).toBe("suggested")
  })

  test("ambiguous tasks use an office-network fallback", () => {
    const result = routeXiaoxueTask("帮我处理一下这个事情")
    expect(result.agent).toBe("office")
    expect(result.available).toBe(true)
    expect(result.confidence).toBe("suggested")
    expect(result.reason).toContain("办公网")
  })
})
