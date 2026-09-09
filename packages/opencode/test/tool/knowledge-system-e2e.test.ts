import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, rm } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import {
  importKnowledgeAttachments,
  listKnowledgeRecords,
  removeKnowledgeRecord,
  userMentionedPaths,
  executeKnowledgeManage,
} from "../../src/tool/knowledge-manage"
import { SessionID } from "../../src/session/schema"
import { loadKnowledgeDocuments, searchKnowledgeDocuments } from "../../src/tool/knowledge-search"

const root = path.join(import.meta.dir, ".tmp-knowledge-e2e")
const fixtures = path.join(import.meta.dir, "..", "fixtures", "knowledge")
const REAL_ROOT = "C:/Users/Administrator/.local/share/opencode/knowledge"

beforeEach(async () => {
  await rm(root, { recursive: true, force: true })
  await mkdir(root, { recursive: true })
})

afterAll(() => rm(root, { recursive: true, force: true }))

/* =========================================================================
 * TM-1 资料检索准确性
 * ========================================================================= */
describe("TM-1 资料检索准确性", () => {
  test("TM-1.1 精确关键词命中：标准术语可检索并返回原文摘录", async () => {
    await importKnowledgeAttachments(root, "standard", [
      txt("术语标准.txt", "综合录井仪应记录全烃与组分数据。\n钻时录井按米记录参数。"),
    ])
    const hits = searchKnowledgeDocuments("全烃", (await loadKnowledgeDocuments([root])).documents).hits
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].excerpt).toContain("全烃")
  })

  test("TM-1.2 中文自然语句模糊查询：无空格长句可命中（二元组分词）", async () => {
    await importKnowledgeAttachments(root, "standard", [
      txt("气测规范.txt", "综合录井仪每日记录全烃、甲烷、乙烷组分。"),
    ])
    const hits = searchKnowledgeDocuments(
      "录井仪应该记录哪些气体组分",
      (await loadKnowledgeDocuments([root])).documents,
    ).hits
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].excerpt).toContain("组分")
  })

  test("TM-1.3 无命中时返回空结果并附免责声明", async () => {
    await importKnowledgeAttachments(root, "standard", [txt("无关.txt", "内容与查询无关。")])
    const result = searchKnowledgeDocuments("量子计算机超导材料", (await loadKnowledgeDocuments([root])).documents)
    expect(result.hits).toHaveLength(0)
    expect(result.unsupportedNotice).toBeDefined()
  })

  test("TM-1.4 标题含关键词的资料排序权重高于正文命中", async () => {
    await importKnowledgeAttachments(root, "standard", [
      txt("井控技术规程.txt", "常规正文内容，术语仅出现一次：井控。"),
      txt("综合材料.txt", "井控。井控。井控。井控。"),
    ])
    const hits = searchKnowledgeDocuments("井控", (await loadKnowledgeDocuments([root])).documents).hits
    expect(hits.length).toBeGreaterThanOrEqual(2)
    expect(hits[0].title).toBe("井控技术规程.txt")
  })

  test("TM-1.5 limit 参数限制返回条数", async () => {
    await importKnowledgeAttachments(root, "standard", [
      txt("a.txt", "井控条款一。"),
      txt("b.txt", "井控条款二。"),
      txt("c.txt", "井控条款三。"),
    ])
    const hits = searchKnowledgeDocuments("井控", (await loadKnowledgeDocuments([root])).documents, { limit: 2 }).hits
    expect(hits.length).toBeLessThanOrEqual(2)
  })

  test("TM-1.6 扫描件 OCR 副本可被检索并定位页码", async () => {
    const pdfPath = path.join(root, "..", "e2e-scan.pdf")
    await Bun.write(pdfPath, textlessPdf())
    const ocrPath = path.join(root, "..", "e2e-ocr.txt")
    await Bun.write(ocrPath, "--- Page 3 ---\n第 3.2.1 条 综合录井仪应连续记录全烃值。")
    const imported = await importKnowledgeAttachments(root, "standard", [], [pdfPath], {
      text: await Bun.file(ocrPath).text(),
    })

    const hits = searchKnowledgeDocuments("全烃", (await loadKnowledgeDocuments([root])).documents).hits
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].sourceId).toBe(imported.records[0].id)
    await rm(pdfPath, { force: true })
    await rm(ocrPath, { force: true })
  })
})

/* =========================================================================
 * TM-2 权限与访问控制（映射到系统实际安全机制）
 * ========================================================================= */
describe("TM-2 权限与访问控制", () => {
  test("TM-2.1 路径信任锚：智能体捏造的路径被拒绝入库", () => {
    const messages = [
      { info: { role: "user" }, parts: [{ type: "text", text: "请导入 D:\\资料\\规范.pdf" }] },
    ] as unknown as Parameters<typeof userMentionedPaths>[0]
    expect(userMentionedPaths(messages, ["D:\\资料\\规范.pdf"])).toEqual(["D:\\资料\\规范.pdf"])
    expect(userMentionedPaths(messages, ["C:\\secrets\\密码表.xlsx"])).toEqual([])
  })

  test("TM-2.2 路径逃逸防护：索引指向管理目录外的文件时删除被拒绝", async () => {
    const outside = path.join(root, "..", "outside-secret.txt")
    await Bun.write(outside, "秘密内容")
    await Bun.write(
      path.join(root, "index.json"),
      JSON.stringify([
        {
          id: "KN-ESCAPE",
          title: "越界",
          category: "standard",
          fileName: "outside-secret.txt",
          filePath: outside,
          importedAt: new Date().toISOString(),
          size: 10,
          sha256: "x",
          fileType: "txt",
          paragraphCount: 1,
          tableCount: 0,
          version: 1,
          active: true,
        },
      ]),
    )
    expect(removeKnowledgeRecord(root, "KN-ESCAPE")).rejects.toThrow("超出管理目录")
    await rm(outside, { force: true })
  })

  test("TM-2.3 OCR 文本校验：非 .txt 文件被拒绝", async () => {
    const pdfPath = path.join(root, "..", "e2e-scan2.pdf")
    await Bun.write(pdfPath, textlessPdf())
    const fakeOcr = path.join(root, "..", "fake.exe")
    await Bun.write(fakeOcr, "malicious")
    await expect(
      executeKnowledgeManage(
        root,
        { action: "import", category: "standard", paths: [pdfPath], ocr_text_path: fakeOcr },
        { sessionID: SessionID.make("ses_legacy"), messages: [], abort: new AbortController().signal },
      ),
    ).rejects.toThrow("不接受自由")
    await rm(pdfPath, { force: true })
    await rm(fakeOcr, { force: true })
  })

  test("TM-2.4 OCR 文本校验：空文本文件被拒绝", async () => {
    const pdfPath = path.join(root, "..", "e2e-scan3.pdf")
    await Bun.write(pdfPath, textlessPdf())
    const emptyOcr = path.join(root, "..", "empty.txt")
    await Bun.write(emptyOcr, "   ")
    await expect(
      importKnowledgeAttachments(root, "standard", [], [pdfPath], { text: await Bun.file(emptyOcr).text() }),
    ).rejects.toThrow("为空")
    await rm(pdfPath, { force: true })
    await rm(emptyOcr, { force: true })
  })

  test("TM-2.5 OCR 文本校验：不存在的路径被拒绝", async () => {
    const pdfPath = path.join(root, "..", "e2e-scan4.pdf")
    await Bun.write(pdfPath, textlessPdf())
    await expect(
      executeKnowledgeManage(
        root,
        { action: "import", category: "standard", paths: [pdfPath], ocr_text_path: path.join(root, "no-such-ocr.txt") },
        { sessionID: SessionID.make("ses_legacy"), messages: [], abort: new AbortController().signal },
      ),
    ).rejects.toThrow("不接受自由")
    await rm(pdfPath, { force: true })
  })

  test("TM-2.6 内容防篡改：自带文字层的 PDF 拒绝注入外部 OCR 文本", async () => {
    const ocrPath = path.join(root, "..", "inject.txt")
    await Bun.write(ocrPath, "被伪造的检索内容：假装是扫描件正文。")
    await expect(
      importKnowledgeAttachments(root, "standard", [txt("正常.txt", "正常内容。")], [], {
        text: await Bun.file(ocrPath).text(),
      }),
    ).rejects.toThrow("不需要 OCR 文本")
    await rm(ocrPath, { force: true })
  })

  test("TM-2.7 归档版本防静默复活：同一内容不能重新上架为“新资料”", async () => {
    const original = txt("制度.txt", "旧版制度内容。")
    const first = await importKnowledgeAttachments(root, "company_rule", [original])
    const { updateKnowledgeAttachment } = await import("../../src/tool/knowledge-manage")
    await updateKnowledgeAttachment(root, first.records[0].id, [txt("制度.txt", "新版制度内容。")])
    await expect(importKnowledgeAttachments(root, "company_rule", [original])).rejects.toThrow("已归档版本")
  })
})

/* =========================================================================
 * TM-3 分类导航逻辑
 * ========================================================================= */
describe("TM-3 分类导航逻辑", () => {
  test("TM-3.1 清单按分类过滤正确", async () => {
    await importKnowledgeAttachments(root, "standard", [txt("标准.txt", "标准内容。")])
    await importKnowledgeAttachments(root, "company_rule", [txt("制度.txt", "制度内容。")])
    const onlyStandard = await listKnowledgeRecords(root, ["standard"])
    expect(onlyStandard.records).toHaveLength(1)
    expect(onlyStandard.records[0].category).toBe("standard")
  })

  test("TM-3.2 检索按分类过滤：仅命中指定分类的资料", async () => {
    await importKnowledgeAttachments(root, "standard", [txt("录井标准.txt", "全烃记录要求。")])
    await importKnowledgeAttachments(root, "company_rule", [txt("公司制度.txt", "全烃上报制度。")])
    const docs = (await loadKnowledgeDocuments([root])).documents
    const inCategory = searchKnowledgeDocuments("全烃", docs, { categories: ["company_rule"] })
    expect(inCategory.hits.length).toBeGreaterThan(0)
    expect(inCategory.hits.every((hit) => hit.category === "company_rule")).toBe(true)
    const wrongCategory = searchKnowledgeDocuments("全烃", docs, { categories: ["tender_case"] })
    expect(wrongCategory.hits).toHaveLength(0)
  })

  test("TM-3.3 检索结果携带正确的分类标签", async () => {
    await importKnowledgeAttachments(root, "company_rule", [txt("审核制度.txt", "报告需三级审核。")])
    const hits = searchKnowledgeDocuments("审核", (await loadKnowledgeDocuments([root])).documents).hits
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].category).toBe("company_rule")
  })

  test("TM-3.4 清单按入库时间倒序排列", async () => {
    await importKnowledgeAttachments(root, "standard", [txt("先入库.txt", "内容一。")])
    await new Promise((resolve) => setTimeout(resolve, 20))
    await importKnowledgeAttachments(root, "standard", [txt("后入库.txt", "内容二。")])
    const listed = await listKnowledgeRecords(root)
    expect(listed.records[0].title).toBe("后入库.txt")
  })
})

/* =========================================================================
 * TM-4 内容预览与格式兼容
 * ========================================================================= */
describe("TM-4 内容预览与格式兼容", () => {
  test("TM-4.1 DOCX 解析入库并可检索正文", async () => {
    const result = await importKnowledgeAttachments(root, "standard", [], [path.join(fixtures, "sample-logging.docx")])
    expect(result.records[0].fileType).toBe("docx")
    const hits = searchKnowledgeDocuments("全烃", (await loadKnowledgeDocuments([root])).documents).hits
    expect(hits.length).toBeGreaterThan(0)
  })

  test("TM-4.2 XLSX 解析入库并可检索单元格数据", async () => {
    const result = await importKnowledgeAttachments(
      root,
      "expert_experience",
      [],
      [path.join(fixtures, "sample-gas.xlsx")],
    )
    expect(result.records[0].fileType).toBe("xlsx")
    expect(result.records[0].tableCount).toBeGreaterThan(0)
    const hits = searchKnowledgeDocuments("全烃", (await loadKnowledgeDocuments([root])).documents).hits
    expect(hits.length).toBeGreaterThan(0)
  })

  test("TM-4.3 文字层 PDF 解析入库并带页码定位", async () => {
    const result = await importKnowledgeAttachments(root, "standard", [], [path.join(fixtures, "sample-text.pdf")])
    expect(result.records[0].fileType).toBe("pdf")
    const hits = searchKnowledgeDocuments("standard", (await loadKnowledgeDocuments([root])).documents).hits
    expect(hits[0].page).toBe(1)
    expect(hits[0].location).toContain("第 1 页")
  })

  test("TM-4.4 加密 PDF 明确报错并引导解密", async () => {
    await expect(
      importKnowledgeAttachments(root, "standard", [], [path.join(fixtures, "sample-encrypted.pdf")]),
    ).rejects.toThrow("加密")
  })

  test("TM-4.5 损坏文件明确报错而非静默入库", async () => {
    await expect(
      importKnowledgeAttachments(root, "standard", [], [path.join(fixtures, "sample-corrupt.pdf")]),
    ).rejects.toThrow()
  })

  test("TM-4.6 摘录长度受控（≤360 字符）", async () => {
    const long = "录井规范条款：" + "超长内容".repeat(200)
    await importKnowledgeAttachments(root, "standard", [txt("长文.txt", long)])
    const hits = searchKnowledgeDocuments("录井规范", (await loadKnowledgeDocuments([root])).documents).hits
    expect(hits[0].excerpt.length).toBeLessThanOrEqual(360)
  })
})

/* =========================================================================
 * TM-5 文件服务稳定性
 * ========================================================================= */
describe("TM-5 文件服务稳定性", () => {
  test("TM-5.1 落盘文件 SHA256 与索引记录一致（完整性校验）", async () => {
    const source = path.join(root, "..", "integrity-src.txt")
    await Bun.write(source, "完整性测试内容。")
    const result = await importKnowledgeAttachments(root, "standard", [], [source])
    const stored = await Bun.file(result.records[0].filePath).arrayBuffer()
    const hash = createHash("sha256").update(new Uint8Array(stored)).digest("hex")
    expect(hash).toBe(result.records[0].sha256)
    await rm(source, { force: true })
  })

  test("TM-5.2 删除后原始文件与 OCR 副本均无残留", async () => {
    const pdfPath = path.join(root, "..", "cleanup-scan.pdf")
    await Bun.write(pdfPath, textlessPdf())
    const ocrPath = path.join(root, "..", "cleanup-ocr.txt")
    await Bun.write(ocrPath, "清理测试 OCR 内容。")
    const result = await importKnowledgeAttachments(root, "standard", [], [pdfPath], {
      text: await Bun.file(ocrPath).text(),
    })
    const { filePath, textPath } = result.records[0]
    await removeKnowledgeRecord(root, result.records[0].id)
    expect(await Bun.file(filePath).exists()).toBe(false)
    expect(await Bun.file(textPath!).exists()).toBe(false)
    const listed = await listKnowledgeRecords(root)
    expect(listed.records).toHaveLength(0)
    await rm(pdfPath, { force: true })
    await rm(ocrPath, { force: true })
  })

  test("TM-5.3 重复导入幂等：同内容不产生重复记录", async () => {
    const input = txt("同一份.txt", "相同内容。")
    await importKnowledgeAttachments(root, "standard", [input])
    await importKnowledgeAttachments(root, "standard", [input])
    expect((await listKnowledgeRecords(root)).records).toHaveLength(1)
  })

  test("TM-5.4 索引文件损坏时检索降级到文件系统扫描而非整体失败", async () => {
    await importKnowledgeAttachments(root, "standard", [txt("降级测试.txt", "索引损坏后仍应可检索全烃内容。")])
    // 人为破坏索引（模拟磁盘损坏 / 半截写入）
    await Bun.write(path.join(root, "index.json"), '{"broken": tru')
    const loaded = await loadKnowledgeDocuments([root])
    const hits = searchKnowledgeDocuments("全烃", loaded.documents).hits
    expect(hits.length).toBeGreaterThan(0)
  })

  test("TM-5.5 索引指向的文件丢失时不阻断其他资料检索", async () => {
    await importKnowledgeAttachments(root, "standard", [txt("存在.txt", "全烃正常内容。")])
    // 注入一条指向已丢失文件的记录
    const index = await Bun.file(path.join(root, "index.json")).json()
    index.push({
      ...index[0],
      id: "KN-GHOST",
      title: "幽灵记录.txt",
      filePath: path.join(root, "standard", "KN-GHOST-ghost.txt"),
    })
    await Bun.write(path.join(root, "index.json"), JSON.stringify(index))
    const loaded = await loadKnowledgeDocuments([root])
    const hits = searchKnowledgeDocuments("全烃", loaded.documents).hits
    expect(hits.length).toBeGreaterThan(0)
  })
})

/* =========================================================================
 * TM-REAL 真实数据回归（仅当本机存在真实知识库时执行）
 * ========================================================================= */
describe("TM-REAL 真实知识库数据回归", () => {
  const realIndexExists = existsSync(path.join(REAL_ROOT, "index.json"))
  test.skipIf(!realIndexExists)("TM-R.1 上架清单可加载且包含扫描件标准", async () => {
    const listed = await listKnowledgeRecords(REAL_ROOT)
    expect(listed.records.length).toBeGreaterThan(0)
    const qsy = listed.records.find((r) => r.title.includes("QSY01018.3"))
    expect(qsy).toBeDefined()
    expect(qsy!.textPath).toBeDefined()
    expect(await Bun.file(qsy!.textPath!).exists()).toBe(true)
  })

  test.skipIf(!realIndexExists)("TM-R.2 真实扫描件内容可检索（OCR 链路）", async () => {
    const loaded = await loadKnowledgeDocuments([REAL_ROOT])
    const hits = searchKnowledgeDocuments("综合录井仪 全烃", loaded.documents).hits
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].title).toContain("QSY01018.3")
  })
})

/* ------------------------- helpers ------------------------- */

function txt(fileName: string, content: string) {
  return {
    filename: fileName,
    mime: "text/plain",
    url: `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`,
  }
}

function textlessPdf(): Buffer {
  const stream = "0 0 1 rg 72 72 100 100 re f"
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 5 0 R >>",
    "<< >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]
  let pdf = "%PDF-1.4\n"
  const offsets: number[] = []
  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(pdf, "latin1")
}
