import { describe, expect, test } from "bun:test"
import { mkdir, rename, symlink, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { createKnowledgeTrust, userMentionedPaths } from "../../src/tool/knowledge-trust"
import { executeKnowledgeManage } from "../../src/tool/knowledge-manage"
import { loadKnowledgeDocuments, searchKnowledgeDocuments } from "../../src/tool/knowledge-search"
import { SessionID } from "../../src/session/schema"
import { tmpdir } from "../fixture/fixture"

function context(text: string, session = "ses_trust") {
  return {
    sessionID: SessionID.make(session),
    abort: new AbortController().signal,
    messages: [{ info: { role: "user" }, parts: [{ type: "text", text }] }] as unknown as Parameters<
      typeof userMentionedPaths
    >[0],
  }
}

describe("knowledge trust boundary", () => {
  test("path prefix substrings and quoted suffixes are not authorizations", () => {
    expect(userMentionedPaths(context("导入 D:\\data\\report.txt.bak").messages, ["D:\\data\\report.txt"])).toEqual([])
    expect(
      userMentionedPaths(context('导入 "D:\\data\\report.txt backup"').messages, ["D:\\data\\report.txt"]),
    ).toEqual([])
    expect(userMentionedPaths(context("导入 D:\\data\\report.txt").messages, ["D:\\data\\report.txt"])).toEqual([
      "D:\\data\\report.txt",
    ])
    expect(
      userMentionedPaths(context('导入 "D:\\资料 空格\\report.txt"').messages, ["D:\\资料 空格\\report.txt"]),
    ).toEqual(["D:\\资料 空格\\report.txt"])
  })

  test("path request, clarification, category confirmation and import preserve a short reference", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "standard.txt")
    await writeFile(file, "井控要求：全烃记录必须连续。")
    const trust = createKnowledgeTrust(path.join(tmp.path, "data"))
    const root = path.join(tmp.path, "knowledge")
    const prepared = await executeKnowledgeManage(
      root,
      { action: "import", paths: [file] },
      context(`导入 "${file}"`),
      trust,
    )
    expect(prepared.action).toBe("prepare")
    expect(prepared.source_refs).toHaveLength(1)
    // Only the category confirmation is available; no history scan can recover the path.
    const imported = await executeKnowledgeManage(
      root,
      { action: "import", category: "standard", source_refs: prepared.source_refs },
      context("standard"),
      trust,
    )
    expect(imported.records).toHaveLength(1)
    expect(searchKnowledgeDocuments("全烃", (await loadKnowledgeDocuments([root])).documents).hits).toHaveLength(1)
    await expect(
      executeKnowledgeManage(
        root,
        { action: "import", category: "standard", paths: [file] },
        context("standard"),
        trust,
      ),
    ).rejects.toThrow("完整授权")
  })

  test("references reject another session, expiry, changed bytes and replay after restart", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "source.pdf")
    await writeFile(file, "original")
    let time = 1000
    const trust = createKnowledgeTrust(tmp.path, () => time)
    const [ref] = await trust.prepare("ses_a", context(`导入 "${file}"`).messages, [file])
    await expect(trust.resolve("ses_b", [ref.id])).rejects.toThrow("跨会话")
    await expect(createKnowledgeTrust(tmp.path).resolve("ses_a", [ref.id])).rejects.toThrow("无效")
    await writeFile(file, "changed")
    await expect(trust.resolve("ses_a", [ref.id])).rejects.toThrow("内容发生变化")
    time += 10 * 60 * 1000
    await expect(trust.resolve("ses_a", [ref.id])).rejects.toThrow("过期")
  })

  test("arbitrary external OCR txt and forged IDs are rejected by the real tool entrypoint", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "external.txt")
    await writeFile(file, "private text")
    const trust = createKnowledgeTrust(path.join(tmp.path, "data"))
    await expect(
      executeKnowledgeManage(
        tmp.path,
        { action: "import", category: "standard", ocr_text_path: file },
        context("standard"),
        trust,
      ),
    ).rejects.toThrow("不接受自由")
    const [ref] = await trust.prepare("ses_trust", context(`导入 "${file}"`).messages, [file])
    await expect(
      executeKnowledgeManage(
        tmp.path,
        { action: "import", category: "standard", source_refs: [ref.id], ocr_artifact_id: file },
        context("standard"),
        trust,
      ),
    ).rejects.toThrow("artifact 无效")
  })

  test("artifacts are source-bound, session-bound, single-use and TTL-limited", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "source.pdf")
    await writeFile(file, "original PDF fixture bytes")
    let time = 1000
    const trust = createKnowledgeTrust(path.join(tmp.path, "data"), () => time)
    const [ref] = await trust.prepare("ses_a", context(`导入 "${file}"`).messages, [file])
    const [source] = await trust.resolve("ses_a", [ref.id])
    const artifact = await trust.produce("ses_a", ref.id, async (_input, output) => {
      await writeFile(output, "--- Page 0 ---\n井控标准。")
    })
    await expect(trust.consume("ses_b", artifact.id, source.hash)).rejects.toThrow("跨会话")
    await expect(trust.consume("ses_a", artifact.id, "different source")).rejects.toThrow("不匹配")
    const consumed = await Promise.allSettled([
      trust.consume("ses_a", artifact.id, source.hash),
      trust.consume("ses_a", artifact.id, source.hash),
    ])
    expect(consumed.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    expect(consumed.filter((result) => result.status === "rejected")).toHaveLength(1)
    await expect(trust.consume("ses_a", artifact.id, source.hash)).rejects.toThrow("已消费")
    const expiring = await trust.produce("ses_a", ref.id, async (_input, output) => {
      await writeFile(output, "有效正文")
    })
    time += 10 * 60 * 1000
    await expect(trust.consume("ses_a", expiring.id, source.hash)).rejects.toThrow("已过期")
  })

  test("artifact symlink or junction escape is rejected even with identical bytes", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "source.pdf")
    const outside = path.join(tmp.path, "outside.txt")
    await writeFile(file, "pdf")
    await writeFile(outside, "OCR text")
    const trust = createKnowledgeTrust(path.join(tmp.path, "data"))
    const [ref] = await trust.prepare("ses_a", context(`导入 "${file}"`).messages, [file])
    const [source] = await trust.resolve("ses_a", [ref.id])
    const artifact = await trust.produce("ses_a", ref.id, async (_input, output) => {
      await writeFile(output, "OCR text")
    })
    const staged = path.join(tmp.path, "data", "ocr-staging", "ses_a", `${artifact.id}.txt`)
    await unlink(staged)
    if (process.platform === "win32") {
      const directory = path.join(tmp.path, "outside-directory")
      await mkdir(directory)
      await symlink(directory, staged, "junction")
    } else await symlink(outside, staged, "file")
    await expect(trust.consume("ses_a", artifact.id, source.hash)).rejects.toThrow("路径越界")
    expect(await Bun.file(outside).text()).toBe("OCR text")
  })

  test("session staging junction escape is rejected", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "source.pdf")
    await writeFile(file, "pdf")
    const trust = createKnowledgeTrust(path.join(tmp.path, "data"))
    const [ref] = await trust.prepare("ses_a", context(`导入 "${file}"`).messages, [file])
    const [source] = await trust.resolve("ses_a", [ref.id])
    const artifact = await trust.produce("ses_a", ref.id, async (_input, output) => {
      await writeFile(output, "OCR text")
    })
    const staged = path.join(tmp.path, "data", "ocr-staging", "ses_a")
    const outside = path.join(tmp.path, "relocated")
    // Both resolved targets are inside this test's disposable root.
    expect(path.relative(tmp.path, outside).startsWith("..")).toBe(false)
    await rename(staged, outside)
    await symlink(outside, staged, process.platform === "win32" ? "junction" : "dir")
    await expect(trust.consume("ses_a", artifact.id, source.hash)).rejects.toThrow("staging 路径越界")
  })

  test("unregistered staging files and modified artifacts carry no authority", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "source.pdf")
    await writeFile(file, "pdf")
    const trust = createKnowledgeTrust(path.join(tmp.path, "data"))
    const [ref] = await trust.prepare("ses_a", context(`导入 "${file}"`).messages, [file])
    const [source] = await trust.resolve("ses_a", [ref.id])
    const artifact = await trust.produce("ses_a", ref.id, async (_input, output) => {
      await writeFile(output, "OCR text")
    })
    await writeFile(path.join(tmp.path, "data", "ocr-staging", "ses_a", `${artifact.id}.txt`), "tampered")
    await expect(trust.consume("ses_a", artifact.id, source.hash)).rejects.toThrow("内容已变化")
    await expect(trust.consume("ses_a", "invented-token", source.hash)).rejects.toThrow("无效")
  })

  test.skipIf(!process.env.XIAOXUE_PYTHON)(
    "bundled pdfkit OCR produces an artifact that imports and searches",
    async () => {
      await using tmp = await tmpdir()
      const file = path.join(tmp.path, "scan.pdf")
      // Render text to pixels, then build a PDF containing only that image.
      const fixture = Bun.spawn(
        [
          process.env.XIAOXUE_PYTHON!,
          "-s",
          "-B",
          "-c",
          "import fitz,sys; d=fitz.open(); p=d.new_page(); p.insert_text((72,100),'XIAOXUE TRUST OCR 12345',fontsize=24); image=p.get_pixmap(matrix=fitz.Matrix(2,2)); scan=fitz.open(); page=scan.new_page(); page.insert_image(page.rect,stream=image.tobytes('png')); scan.save(sys.argv[1])",
          file,
        ],
        { stdout: "pipe", stderr: "pipe", env: { ...process.env, PYTHONNOUSERSITE: "1" } },
      )
      expect(await fixture.exited).toBe(0)
      const trust = createKnowledgeTrust(path.join(tmp.path, "data"))
      const root = path.join(tmp.path, "knowledge")
      const prepared = await executeKnowledgeManage(
        root,
        { action: "prepare", paths: [file] },
        context(`导入 "${file}"`),
        trust,
      )
      const ocr = await executeKnowledgeManage(
        root,
        { action: "ocr", source_refs: prepared.source_refs },
        context("standard"),
        trust,
      )
      expect(ocr.ocr_artifact_id).toMatch(/^[a-f0-9-]{36}$/)
      const imported = await executeKnowledgeManage(
        root,
        {
          action: "import",
          category: "standard",
          source_refs: prepared.source_refs,
          ocr_artifact_id: ocr.ocr_artifact_id,
        },
        context("standard"),
        trust,
      )
      expect(imported.records).toHaveLength(1)
      expect(imported.records[0].textPath).toBeDefined()
      expect(
        searchKnowledgeDocuments("XIAOXUE", (await loadKnowledgeDocuments([root])).documents).hits.length,
      ).toBeGreaterThan(0)
      await expect(
        executeKnowledgeManage(
          root,
          {
            action: "import",
            category: "standard",
            source_refs: prepared.source_refs,
            ocr_artifact_id: ocr.ocr_artifact_id,
          },
          context("standard"),
          trust,
        ),
      ).rejects.toThrow("已消费")
    },
    120000,
  )
})
