import { afterEach, describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Document, Packer, Paragraph, TextRun } from "docx"
import JSZip from "jszip"
import { exportAnnotatedDocx } from "../../src/tool/docx-annotation"

const python = path.resolve(import.meta.dir, "../../../desktop/resources/python/python.exe")
const workspaces: string[] = []

afterEach(async () => {
  delete process.env.XIAOXUE_PYTHON
  delete process.env.XIAOXUE_BUNDLED_SKILLS_DIR
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })))
})

describe("DOCX native comment export", () => {
  test.skipIf(!existsSync(python))("preserves the document and adds precise Word comments", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "xiaoxue-docx-test-"))
    workspaces.push(workspace)
    process.env.XIAOXUE_PYTHON = python
    process.env.XIAOXUE_BUNDLED_SKILLS_DIR = path.resolve(import.meta.dir, "../../../../.opencode/skills")
    const data = new Uint8Array(
      await Packer.toBuffer(
        new Document({
          sections: [
            {
              children: [new Paragraph({ children: [new TextRun("付款应当在验收后30日内完成。")] })],
            },
          ],
        }),
      ),
    )

    const exported = await exportAnnotatedDocx({
      data,
      fileName: "合同.docx",
      outputPath: workspace,
      annotations: [
        { id: "CONTRACT-001", matchText: "验收后30日", comment: "建议明确最迟付款日期。" },
        { id: "CONTRACT-002", matchText: "不存在的原文", comment: "不应阻断其他批注。" },
      ],
    })

    expect(exported.annotations).toEqual({ added: 1, unmatched: 1 })
    const archive = await JSZip.loadAsync(await readFile(exported.filePath))
    const documentXml = await archive.file("word/document.xml")!.async("text")
    expect(documentXml).toContain("付款应当在")
    expect(documentXml).toContain("验收后30日")
    expect(documentXml).toContain("内完成。")
    const commentsXml = await archive.file("word/comments.xml")!.async("text")
    expect(commentsXml).toContain("[CONTRACT-001] 建议明确最迟付款日期")
    expect(commentsXml).toContain('w:author="AI审核"')
  })
})
