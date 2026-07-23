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
