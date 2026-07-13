import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, rm } from "node:fs/promises"
import path from "node:path"
import {
  importKnowledgeAttachments,
  listKnowledgeRecords,
  removeKnowledgeRecord,
  updateKnowledgeAttachment,
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
  test("imports a real text attachment and writes an index", async () => {
    const result = await importKnowledgeAttachments(root, "standard", [attachment("录井标准.txt", "井号和完钻井深应保持一致。")])
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
})

function attachment(fileName: string, content: string) {
  return {
    filename: fileName,
    mime: "text/plain",
    url: `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`,
  }
}
