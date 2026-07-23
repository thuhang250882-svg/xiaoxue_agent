import { afterAll, describe, expect, test } from "bun:test"
import { mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { createParsedDocument } from "../../../../document_engine"
import { searchKnowledgeDocuments } from "../../src/tool/knowledge-search"
import { exportTenderReviewResult, reviewTenderDocuments } from "../../src/tool/tender-review"
import { exportContractReviewResult, reviewContractDocument } from "../../src/tool/contract-review"

const outputPath = path.join(import.meta.dir, ".tmp-business-review")
afterAll(() => rm(outputPath, { recursive: true, force: true }))

describe("xiaoxue second batch business tools", () => {
  test("knowledge search returns traceable real-document excerpts", () => {
    const document = createParsedDocument({
      fileId: "STD-TEST-001",
      fileName: "录井资料质量要求.md",
      fileType: "txt",
      rawText: "地质录井报告应确保井号、完钻井深和地层数据前后一致。",
      metadata: { sourcePath: "knowledge/standards/录井资料质量要求.md" },
    })
    const result = searchKnowledgeDocuments("录井报告井号一致", [document])

    expect(result.hits).toHaveLength(1)
    expect(result.hits[0].filePath).toContain("knowledge/standards")
    expect(result.hits[0].location).toContain("正文第")
    expect(result.hits[0].excerpt).toContain("井号")
  })

  test("knowledge search does not fabricate results", () => {
    const result = searchKnowledgeDocuments("不存在的制度条款", [])
    expect(result.hits).toEqual([])
    expect(result.searchedFiles).toBe(0)
  })

  test("tender review identifies rejection and scoring evidence", () => {
    const document = createParsedDocument({
      fileId: "TENDER-TEST-001",
      fileName: "测试招标文件.txt",
      fileType: "txt",
      rawText: "投标人必须提供有效安全生产许可证，否则否决投标。\n\n评分标准：同类业绩每项得2分。\n\n技术要求：提供气测录井设备清单。",
    })
    const result = reviewTenderDocuments([document], "tender-test")

    expect(result.requirements.some((item) => item.category === "rejection" && item.severity === "high")).toBe(true)
    expect(result.requirements.some((item) => item.category === "scoring")).toBe(true)
    expect(result.requirements.every((item) => item.location.includes(document.fileName))).toBe(true)
  })

  test("tender review exports a real DOCX file", async () => {
    await mkdir(outputPath, { recursive: true })
    const document = createParsedDocument({
      fileId: "TENDER-EXPORT-001",
      fileName: "招标文件.txt",
      fileType: "txt",
      rawText: "投标人必须提供有效资质，否则否决投标。",
    })
    const result = reviewTenderDocuments([document], "tender-export")
    const exported = await exportTenderReviewResult(result, outputPath)
    const bytes = new Uint8Array(await Bun.file(exported.filePath).arrayBuffer())

    expect(exported.format).toBe("docx")
    expect(exported.size).toBeGreaterThan(1000)
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK")
  })
  test("contract review is grounded in current contract and stance", () => {
    const document = createParsedDocument({
      fileId: "CONTRACT-TEST-001",
      fileName: "地质录井服务合同.txt",
      fileType: "txt",
      rawText: "付款以甲方最终审计完成后为条件。\n\n验收以甲方认可为准。\n\n项目全部成果及所有知识产权归甲方。",
    })
    const result = reviewContractDocument(document, {
      stance: "party_b",
      contractType: "地质录井技术服务",
      taskId: "contract-test",
    })

    expect(result.stance).toBe("party_b")
    expect(result.issues.some((item) => item.category === "付款条件")).toBe(true)
    expect(result.issues.some((item) => item.category === "成果与知识产权")).toBe(true)
    expect(result.issues.every((item) => item.basis.includes(document.fileName))).toBe(true)
    expect(result.disclaimer).toContain("不构成法律意见")
  })
  test("contract review exports a real DOCX file", async () => {
    await mkdir(outputPath, { recursive: true })
    const document = createParsedDocument({
      fileId: "CONTRACT-EXPORT-001",
      fileName: "服务合同.txt",
      fileType: "txt",
      rawText: "验收以甲方认可为准。",
    })
    const result = reviewContractDocument(document, { stance: "party_b", taskId: "contract-export" })
    const exported = await exportContractReviewResult(result, outputPath)
    const bytes = new Uint8Array(await Bun.file(exported.filePath).arrayBuffer())

    expect(exported.format).toBe("docx")
    expect(exported.size).toBeGreaterThan(1000)
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK")
  })
})