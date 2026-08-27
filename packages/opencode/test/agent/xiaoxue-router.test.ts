import { describe, expect, test } from "bun:test"
import { routeXiaoxueTask, XIAOXUE_AGENT_ROUTES } from "../../src/agent/xiaoxue-router"

describe("xiaoxue agent router", () => {
  test.each([
    ["请审核这份XX井地质录井报告", "report", "geolog-logging-review", "geology_report_review"],
    ["解析招标文件并检查废标风险", "tender", "tender-management", "tender_review"],
    ["编制一份完整的投标响应文件", "tender", "tender-management", "tender_review"],
    ["审查技术服务合同的付款和违约条款", "contract", "contract-management", "contract_review"],
    ["起草一份录井技术服务合同", "contract", "contract-management", "contract_review"],
    ["查询地质录井标准和公司制度依据", "knowledge", "geology-knowledge", "knowledge_search"],
    ["把这份制度导入知识库", "knowledge", "knowledge-management", "knowledge_manage"],
    ["使用 LLM Wiki 检查知识库中的矛盾和孤立页面", "knowledge", "knowledge-management", "knowledge_manage"],
    ["整理周例会纪要并提取会议待办", "office", "office-assistant", "office_document"],
    ["把这段录音转写成文字", "document", "markitdown-skill", undefined],
    ["把这个PDF拆分并压缩", "document", "pdfkit-py", undefined],
    ["识别扫描件中的文字", "document", "markitdown-skill", undefined],
    ["请治理并合并这些重复 Skill", "knowledge", "skill-governance", undefined],
    ["根据我的日记创建数字分身", "knowledge", "cognitive-profile", undefined],
  ] as const)("%s routes to %s/%s", (input, agent, skill, tool) => {
    const result = routeXiaoxueTask(input)
    expect(result.agent).toBe(agent)
    expect(result.skill).toBe(skill)
    expect(result.tool).toBe(tool)
    expect(result.confidence).toBe("deterministic")
  })

  test("specific tracked-review routes win over generic business routes", () => {
    expect(routeXiaoxueTask("用花叔留痕方式审查这份合同并保留修订痕迹").skill).toBe(
      "document-review-tracked",
    )
    expect(routeXiaoxueTask("给这份地质录井报告添加批注并保留原格式").skill).toBe(
      "document-review-tracked",
    )
  })

  test("consolidated business families use one public entry", () => {
    expect(routeXiaoxueTask("编制投标文件的技术标章节").skill).toBe("tender-management")
    expect(routeXiaoxueTask("审核这份投标文件并列出废标风险").skill).toBe("tender-management")
    expect(routeXiaoxueTask("编制招标文件的技术规范").skill).toBe("tender-management")
    expect(routeXiaoxueTask("对比两份合同并整理谈判备忘").skill).toBe("contract-management")
    expect(routeXiaoxueTask("编写油田信息化项目周报").skill).toBe("oilfield-it-project-management")
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
    expect(result.confidence).toBe("suggested")
    expect(result.reason).toContain("办公网")
  })
})
