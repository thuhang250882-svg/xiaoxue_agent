import { describe, expect, test } from "bun:test"
import path from "node:path"
import { createParsedDocument } from "../../../../document_engine"
import { searchKnowledgeDocuments, type KnowledgeCategory } from "../../src/tool/knowledge-search"

type Fixture = {
  documents: Array<{ id: string; title: string; category: KnowledgeCategory; section: string; text: string }>
  cases: Array<{ query: string; expectedSourceId: string; expectedSection: string }>
}

describe("knowledge retrieval quality", () => {
  test("reports Top1, Top3 and Top5 against a fixed de-identified evaluation set", async () => {
    const fixture = (await Bun.file(
      path.join(import.meta.dir, "../fixtures/knowledge/retrieval-eval.json"),
    ).json()) as Fixture
    const documents = fixture.documents.map((item) =>
      createParsedDocument({
        fileId: item.id,
        fileName: item.title + ".txt",
        fileType: "txt",
        rawText: item.text,
        paragraphs: [{ index: 1, text: item.text, section: item.section, location: item.section + "，正文第 1 段" }],
        metadata: {
          sourceId: item.id,
          title: item.title,
          version: 1,
          active: true,
          importedAt: "2026-07-13T00:00:00.000Z",
          sourcePath: "knowledge/" + categoryPath(item.category) + "/" + item.title + ".txt",
        },
      }),
    )
    const ranks = fixture.cases.map((item) => {
      const result = searchKnowledgeDocuments(item.query, documents, { limit: 5 })
      const rank = result.hits.findIndex((hit) => hit.sourceId === item.expectedSourceId) + 1
      const expected = result.hits.find((hit) => hit.sourceId === item.expectedSourceId)
      expect(expected?.section).toBe(item.expectedSection)
      expect(expected?.documentNumber).toBe(item.expectedSourceId)
      expect(expected?.archived).toBe(false)
      expect(expected?.excerpt.length).toBeGreaterThan(0)
      return rank
    })
    const rate = (limit: number) => ranks.filter((rank) => rank > 0 && rank <= limit).length / ranks.length
    console.info("knowledge retrieval eval", { cases: ranks.length, top1: rate(1), top3: rate(3), top5: rate(5) })
    expect(rate(1)).toBeGreaterThanOrEqual(0.8)
    expect(rate(3)).toBe(1)
    expect(rate(5)).toBe(1)
  })

  test("excludes archived documents and returns the fixed no-source notice", () => {
    const archived = createParsedDocument({
      fileId: "OLD-001",
      fileName: "旧版制度.txt",
      fileType: "txt",
      rawText: "旧版井号审核要求。",
      metadata: { active: false, sourcePath: "knowledge/company_rules/旧版制度.txt" },
    })
    const result = searchKnowledgeDocuments("井号审核", [archived])
    expect(result.hits).toEqual([])
    expect(result.unsupportedNotice).toContain("未检索到能够直接支持该结论的依据")
  })
})

function categoryPath(category: KnowledgeCategory) {
  if (category === "company_rule") return "company_rules"
  if (category === "template") return "report_templates"
  if (category === "excellent_report") return "excellent_reports"
  if (category === "expert_experience") return "expert_experience"
  if (category === "tender_case") return "tender_cases"
  if (category === "contract_case") return "contract_cases"
  return "standards"
}
