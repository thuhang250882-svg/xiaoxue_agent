import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, rm } from "node:fs/promises"
import path from "node:path"
import {
  importKnowledgeAttachments,
  listKnowledgeRecords,
  removeKnowledgeRecord,
  updateKnowledgeAttachment,
  userMentionedPaths,
  type KnowledgeRecord,
} from "../../src/tool/knowledge-manage"
import { loadKnowledgeDocuments, searchKnowledgeDocuments } from "../../src/tool/knowledge-search"

const root = path.join(import.meta.dir, ".tmp-knowledge-manage")

beforeEach(async () => {
  await rm(root, { recursive: true, force: true })
  await mkdir(root, { recursive: true })
})

afterAll(() => rm(root, { recursive: true, force: true }))

describe("knowledge_manage", () => {
  test("imports a text PDF and finds it via both index and recursive fallback", async () => {
    const stream = "BT /F1 12 Tf 72 720 Td (Well pressure standard) Tj ET"
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
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
    const imported = await importKnowledgeAttachments(root, "standard", [
      {
        filename: "pressure.pdf",
        mime: "application/pdf",
        url: `data:application/pdf;base64,${Buffer.from(pdf).toString("base64")}`,
      },
    ])
    expect(imported.records[0].fileType).toBe("pdf")
    const indexed = await loadKnowledgeDocuments([root])
    expect(indexed.warnings).toEqual([])
    expect(searchKnowledgeDocuments("pressure", indexed.documents).hits[0]?.page).toBe(1)
    await rm(path.join(root, "index.json"))
    const fallback = await loadKnowledgeDocuments([root])
    expect(fallback.warnings).toEqual([])
    expect(searchKnowledgeDocuments("pressure", fallback.documents).hits[0]?.excerpt).toContain("Well pressure")
  })

  test("imports a real text attachment and writes an index", async () => {
    const result = await importKnowledgeAttachments(root, "standard", [
      attachment("录井标准.txt", "井号和完钻井深应保持一致。"),
    ])
    const record = result.records[0]

    expect(result.action).toBe("import")
    expect(record.id).toStartWith("KN-")
    expect(record.category).toBe("standard")
    expect(record.paragraphCount).toBeGreaterThan(0)
    expect(await Bun.file(record.filePath).exists()).toBe(true)
    expect(await Bun.file(path.join(root, "index.json")).exists()).toBe(true)
  })

  test("newly imported content is available to knowledge search", async () => {
    await importKnowledgeAttachments(root, "standard", [
      attachment("气测录井要求.txt", "气测录井异常井段应记录全烃和组分变化。"),
    ])
    const loaded = await loadKnowledgeDocuments([root])
    const result = searchKnowledgeDocuments("气测全烃异常", loaded.documents)

    expect(loaded.warnings).toEqual([])
    expect(result.hits.some((hit) => hit.excerpt.includes("全烃"))).toBe(true)
  })
  test("updates a source, archives the old version, and searches only the active version", async () => {
    const first = await importKnowledgeAttachments(root, "company_rule", [
      attachment("审核制度.txt", "旧版要求：报告审核使用纸质清单。"),
    ])
    const updated = await updateKnowledgeAttachment(root, first.records[0].id, [
      attachment("审核制度.txt", "新版要求：报告审核使用结构化问题清单。"),
    ])
    const listed = await listKnowledgeRecords(root)
    const loaded = await loadKnowledgeDocuments([root])
    const oldSearch = searchKnowledgeDocuments("纸质", loaded.documents)
    const newSearch = searchKnowledgeDocuments("结构化问题清单", loaded.documents)

    expect(updated.records[0].version).toBe(2)
    expect(updated.records[0].supersedes).toBe(first.records[0].id)
    expect(listed.records).toHaveLength(1)
    expect(listed.records[0].active).toBe(true)
    expect(oldSearch.hits).toHaveLength(0)
    expect(newSearch.hits.length).toBeGreaterThan(0)
  })
  test("does not silently reactivate an archived version during import", async () => {
    const original = attachment("制度.txt", "旧版制度内容。")
    const first = await importKnowledgeAttachments(root, "company_rule", [original])
    await updateKnowledgeAttachment(root, first.records[0].id, [attachment("制度.txt", "新版制度内容。")])

    expect(importKnowledgeAttachments(root, "company_rule", [original])).rejects.toThrow("已归档版本")
  })
  test("reuses the same SHA-256 record instead of duplicating", async () => {
    const input = attachment("制度.txt", "同一份制度内容。")
    const first = await importKnowledgeAttachments(root, "company_rule", [input])
    const second = await importKnowledgeAttachments(root, "company_rule", [input])
    const listed = await listKnowledgeRecords(root)

    expect(second.records[0].id).toBe(first.records[0].id)
    expect(listed.records).toHaveLength(1)
  })

  test("lists by category and removes by source id", async () => {
    const standard = await importKnowledgeAttachments(root, "standard", [attachment("标准.txt", "标准内容。")])
    await importKnowledgeAttachments(root, "template", [attachment("模板.txt", "模板内容。")])
    const listed = await listKnowledgeRecords(root, ["standard"])

    expect(listed.records).toHaveLength(1)
    expect(listed.records[0].category).toBe("standard")

    const removed = await removeKnowledgeRecord(root, standard.records[0].id)
    expect(removed.records[0].id).toBe(standard.records[0].id)
    expect(await Bun.file(standard.records[0].filePath).exists()).toBe(false)
  })

  test("rejects an indexed file outside the managed root", async () => {
    const record: KnowledgeRecord = {
      id: "KN-OUTSIDE",
      title: "越界文件",
      category: "standard",
      fileName: "outside.txt",
      filePath: path.resolve(root, "..", "outside.txt"),
      importedAt: new Date().toISOString(),
      size: 1,
      sha256: "outside",
      fileType: "txt",
      paragraphCount: 1,
      tableCount: 0,
      version: 1,
      active: true,
    }
    await Bun.write(path.join(root, "index.json"), JSON.stringify([record]))

    expect(removeKnowledgeRecord(root, record.id)).rejects.toThrow("超出管理目录")
  })

  test("imports a user-mentioned local file path without attachments", async () => {
    const sourcePath = path.join(root, "..", "录井规范-QSY.txt")
    await Bun.write(sourcePath, "录井资料采集应记录迟到时间。")

    const result = await importKnowledgeAttachments(root, "standard", [], [sourcePath])
    const record = result.records[0]

    expect(record.title).toBe("录井规范-QSY.txt")
    expect(record.fileType).toBe("txt")
    expect(await Bun.file(record.filePath).exists()).toBe(true)

    await rm(sourcePath, { force: true })
  })

  test("userMentionedPaths only allows paths that appear verbatim in the user message", () => {
    const messages = [
      {
        info: { role: "user" },
        parts: [{ type: "text", text: "请导入 G:\\标准\\QSY 01128-2020.pdf 到知识库" }],
      },
    ] as unknown as Parameters<typeof userMentionedPaths>[0]

    expect(userMentionedPaths(messages, ["G:\\标准\\QSY 01128-2020.pdf"])).toEqual(["G:\\标准\\QSY 01128-2020.pdf"])
    // 用户没提过的路径（智能体捏造）必须被拒绝
    expect(userMentionedPaths(messages, ["C:\\Windows\\system32\\config.sam"])).toEqual([])
    expect(userMentionedPaths(messages, undefined)).toEqual([])
  })

  test("imports a scanned PDF with ocr_text_path and searches the OCR text", async () => {
    const pdfPath = path.join(root, "..", "扫描标准-QSY01018.pdf")
    await Bun.write(pdfPath, textlessPdf())
    const ocrPath = path.join(root, "..", "qsy01018-ocr.txt")
    await Bun.write(ocrPath, "勘探与生产数据规格 第3部分：录井。\n综合录井仪应记录全烃与组分数据。")

    const result = await importKnowledgeAttachments(root, "standard", [], [pdfPath], ocrPath)
    const record = result.records[0]

    expect(record.textPath).toBeDefined()
    expect(await Bun.file(record.filePath).exists()).toBe(true)
    expect(await Bun.file(record.textPath!).exists()).toBe(true)

    // 检索走 OCR 文本副本，且元数据（标题）正确挂载
    const loaded = await loadKnowledgeDocuments([root])
    expect(loaded.warnings).toEqual([])
    const hits = searchKnowledgeDocuments("全烃组分", loaded.documents).hits
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].title).toBe("扫描标准-QSY01018.pdf")
    expect(hits[0].filePath).toBe(record.filePath)

    // 删除时原始 PDF 与 OCR 副本一并清理
    await removeKnowledgeRecord(root, record.id)
    expect(await Bun.file(record.filePath).exists()).toBe(false)
    expect(await Bun.file(record.textPath!).exists()).toBe(false)

    await rm(pdfPath, { force: true })
    await rm(ocrPath, { force: true })
  })

  test("rejects a scanned PDF without ocr_text_path with actionable guidance", async () => {
    const pdfPath = path.join(root, "..", "扫描件-无文本.pdf")
    await Bun.write(pdfPath, textlessPdf())

    expect(importKnowledgeAttachments(root, "standard", [], [pdfPath])).rejects.toThrow("ocr_fallback")

    await rm(pdfPath, { force: true })
  })

  test("rejects ocr_text_path when the PDF has its own text layer", async () => {
    const ocrPath = path.join(root, "..", "多余-ocr.txt")
    await Bun.write(ocrPath, "不该被接受的 OCR 文本。")

    expect(
      importKnowledgeAttachments(root, "standard", [attachment("气测录井要求.txt", "气测内容。")], [], ocrPath),
    ).rejects.toThrow("不需要 OCR 文本")

    await rm(ocrPath, { force: true })
  })

  test("rejects ocr_text_path with multiple sources", async () => {
    const ocrPath = path.join(root, "..", "批量-ocr.txt")
    await Bun.write(ocrPath, "文本。")

    expect(
      importKnowledgeAttachments(
        root,
        "standard",
        [attachment("a.txt", "内容A。"), attachment("b.txt", "内容B。")],
        [],
        ocrPath,
      ),
    ).rejects.toThrow("单份资料")

    await rm(ocrPath, { force: true })
  })
})

describe("knowledge delivery regressions", () => {
  test("a failed batch leaves no searchable unindexed files", async () => {
    await expect(
      importKnowledgeAttachments(root, "standard", [
        attachment("good.txt", "不能提前上架的资料"),
        attachment("bad.pdf", "broken PDF"),
      ]),
    ).rejects.toThrow()
    expect((await listKnowledgeRecords(root)).records).toHaveLength(0)
    expect((await loadKnowledgeDocuments([root])).documents).toHaveLength(0)
  })

  test("failed index publication restores imports, updates and deletes", async () => {
    const first = await importKnowledgeAttachments(root, "standard", [attachment("policy.txt", "应当保留的原始制度")])
    const originalIndex = await Bun.file(path.join(root, "index.json")).text()
    await mkdir(path.join(root, "index.json.tmp"))
    await expect(
      importKnowledgeAttachments(root, "standard", [attachment("new.txt", "不应发布的新资料")]),
    ).rejects.toThrow()
    await expect(
      updateKnowledgeAttachment(root, first.records[0].id, [attachment("policy.txt", "不应发布的新版制度")]),
    ).rejects.toThrow()
    await expect(removeKnowledgeRecord(root, first.records[0].id)).rejects.toThrow()
    expect(await Bun.file(first.records[0].filePath).text()).toBe("应当保留的原始制度")
    expect(await Bun.file(path.join(root, "index.json")).text()).toBe(originalIndex)
    await rm(path.join(root, "index.json.tmp"), { recursive: true })
    const updated = await updateKnowledgeAttachment(root, first.records[0].id, [
      attachment("policy.txt", "修复磁盘问题后可更新"),
    ])
    expect(updated.records[0].version).toBe(2)
  })

  test("reimporting a restored active version remains idempotent", async () => {
    const original = attachment("policy.txt", "恢复后的制度")
    const first = await importKnowledgeAttachments(root, "standard", [original])
    const second = await updateKnowledgeAttachment(root, first.records[0].id, [attachment("policy.txt", "临时版本")])
    const restored = await updateKnowledgeAttachment(root, second.records[0].id, [original])
    const reused = await importKnowledgeAttachments(root, "standard", [original])
    expect(reused.records[0].id).toBe(restored.records[0].id)
    expect((await listKnowledgeRecords(root)).records).toHaveLength(1)
  })

  test("concurrent imports preserve every acknowledged record", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        importKnowledgeAttachments(root, "standard", [attachment(`parallel-${index}.txt`, `并发资料内容 ${index}`)]),
      ),
    )
    const listed = await listKnowledgeRecords(root)
    expect(listed.records).toHaveLength(5)
    expect(new Set(listed.records.map((record) => record.id))).toEqual(
      new Set(results.map((result) => result.records[0].id)),
    )
  })

  test("OCR page markers yield original PDF page numbers", async () => {
    const ocrPath = path.join(root, "ocr.txt")
    await Bun.write(ocrPath, "--- Page 0 ---\n首页井控要求。\n--- Page 2 ---\n全烃异常记录。后续组分记录。")
    const imported = await importKnowledgeAttachments(
      root,
      "standard",
      [
        {
          filename: "scan.pdf",
          mime: "application/pdf",
          url: `data:application/pdf;base64,${textlessPdf().toString("base64")}`,
        },
      ],
      [],
      ocrPath,
    )
    const loaded = await loadKnowledgeDocuments([root])
    const hits = searchKnowledgeDocuments("全烃", loaded.documents).hits
    expect(hits[0].page).toBe(3)
    expect(hits[0].filePath).toBe(imported.records[0].filePath)
    expect(hits[0].excerpt).not.toContain("--- Page")
    expect(searchKnowledgeDocuments("组分", loaded.documents).hits[0].page).toBe(3)
    expect(searchKnowledgeDocuments("井控", loaded.documents).hits[0].page).toBe(1)
  })

  test("attachments take precedence over local paths", async () => {
    const result = await importKnowledgeAttachments(
      root,
      "standard",
      [attachment("attached.txt", "附件内容")],
      [path.join(root, "missing.txt")],
    )
    expect(result.records).toHaveLength(1)
  })

  test("different files with the same name are not silently discarded", async () => {
    const result = await importKnowledgeAttachments(root, "standard", [
      attachment("same.txt", "第一份内容"),
      attachment("same.txt", "第二份内容"),
    ])
    expect(result.records).toHaveLength(2)
    expect((await listKnowledgeRecords(root)).records).toHaveLength(2)
  })

  test("updating to existing content cannot duplicate source IDs", async () => {
    const first = await importKnowledgeAttachments(root, "standard", [attachment("first.txt", "第一版内容")])
    const second = await importKnowledgeAttachments(root, "standard", [attachment("second.txt", "另一份内容")])
    await expect(
      updateKnowledgeAttachment(root, first.records[0].id, [attachment("first.txt", "另一份内容")]),
    ).rejects.toThrow("已存在")
    expect((await listKnowledgeRecords(root)).records).toHaveLength(2)
    expect(await Bun.file(first.records[0].filePath).text()).toBe("第一版内容")
    expect(await Bun.file(second.records[0].filePath).text()).toBe("另一份内容")
  })

  test("reverting content creates a distinct version identity", async () => {
    const original = attachment("policy.txt", "原始制度内容")
    const first = await importKnowledgeAttachments(root, "standard", [original])
    const second = await updateKnowledgeAttachment(root, first.records[0].id, [
      attachment("policy.txt", "新版制度内容"),
    ])
    const third = await updateKnowledgeAttachment(root, second.records[0].id, [original])
    expect(third.records[0].version).toBe(3)
    expect(third.records[0].id).not.toBe(first.records[0].id)
    await removeKnowledgeRecord(root, third.records[0].id)
    expect((await listKnowledgeRecords(root)).records).toHaveLength(0)
  })

  test("invalid OCR copy paths are rejected before deleting the original", async () => {
    const imported = await importKnowledgeAttachments(root, "standard", [attachment("policy.txt", "应当保留的内容")])
    const record = imported.records[0]
    await Bun.write(
      path.join(root, "index.json"),
      JSON.stringify([{ ...record, textPath: path.resolve(root, "..", "outside.txt") }]),
    )
    await expect(removeKnowledgeRecord(root, record.id)).rejects.toThrow("超出管理目录")
    expect(await Bun.file(record.filePath).exists()).toBe(true)
  })

  test("one invalid index does not suppress healthy knowledge roots", async () => {
    const healthy = path.join(root, "healthy")
    const broken = path.join(root, "broken")
    await importKnowledgeAttachments(healthy, "standard", [attachment("policy.txt", "全烃有效资料")])
    await Bun.write(path.join(broken, "index.json"), "{}")
    const loaded = await loadKnowledgeDocuments([broken, healthy])
    expect(searchKnowledgeDocuments("全烃", loaded.documents).hits).toHaveLength(1)
    expect(loaded.warnings.length).toBeGreaterThan(0)
  })
})

// 构造无文字层的合法 PDF（内容流只画一个矩形，无文本算子）
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

function attachment(fileName: string, content: string) {
  return {
    filename: fileName,
    mime: "text/plain",
    url: `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`,
  }
}
