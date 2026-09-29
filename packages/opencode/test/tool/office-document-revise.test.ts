import { afterEach, describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Document, Packer, Paragraph, TextRun } from "docx"
import JSZip from "jszip"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { exportOfficeRevisionSet } from "../../src/tool/office-document-revise"
import { previewOfficeArtifact } from "../../src/tool/office-artifact-preview"
import { recentUserAttachments } from "../../src/tool/xiaoxue-attachments"

const python = path.resolve(import.meta.dir, "../../../desktop/resources/python/python.exe")
const workspaces: string[] = []

afterEach(async () => {
  delete process.env.XIAOXUE_PYTHON
  delete process.env.XIAOXUE_BUNDLED_SKILLS_DIR
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })))
})

describe("Office revision export", () => {
  test("finds an earlier uploaded workbook after a follow-up message", () => {
    const messages = [
      {
        info: { role: "user", sessionID: "ses_test" },
        parts: [{ type: "file", filename: "统计表.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", url: "data:application/octet-stream;base64,AA==" }],
      },
      { info: { role: "assistant", sessionID: "ses_test" }, parts: [] },
      { info: { role: "user", sessionID: "ses_test" }, parts: [{ type: "text", text: "继续" }] },
    ] as unknown as SessionV1.WithParts[]

    expect(recentUserAttachments(messages).map((attachment) => attachment.filename)).toEqual(["统计表.xlsx"])
  })

  test.skipIf(!existsSync(python))("creates annotated and final DOCX copies", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "xiaoxue-office-revision-test-"))
    workspaces.push(workspace)
    process.env.XIAOXUE_PYTHON = python
    process.env.XIAOXUE_BUNDLED_SKILLS_DIR = path.resolve(import.meta.dir, "../../../../.opencode/skills")
    const data = new Uint8Array(
      await Packer.toBuffer(
        new Document({
          sections: [{ children: [new Paragraph({ children: [new TextRun("付款期限为验收后30日。")] })] }],
        }),
      ),
    )

    const result = await exportOfficeRevisionSet({
      data,
      fileName: "合同.docx",
      outputPath: workspace,
      edits: [
        {
          id: "CONTRACT-001",
          matchText: "验收后30日",
          replacement: "验收合格后30个自然日",
          comment: "明确付款期限口径。",
        },
      ],
    })

    expect(result.changes).toEqual({
      annotated: { applied: 1, unmatched: 0 },
      final: { applied: 1, unmatched: 0 },
    })
    const annotated = await JSZip.loadAsync(await readFile(result.annotated.filePath))
    const final = await JSZip.loadAsync(await readFile(result.final.filePath))
    expect(await annotated.file("word/comments.xml")!.async("text")).toContain('w:author="AI审核"')
    const preview = await previewOfficeArtifact(result.annotated.filePath)
    expect(preview.annotations).toHaveLength(1)
    expect(preview.annotations[0].author).toBe("AI审核")
    expect(preview.annotations[0].anchor).toBe("验收后30日")
    expect(preview.annotations[0].comment).toContain("明确付款期限口径。")
    const finalXml = await final.file("word/document.xml")!.async("text")
    expect(finalXml).toContain("验收合格后30个自然日")
    expect(finalXml).not.toContain("验收后30日")
  })

  test.skipIf(!existsSync(python))("rejects the revision set when any requested edit is unmatched", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "xiaoxue-office-revision-unmatched-"))
    workspaces.push(workspace)
    process.env.XIAOXUE_PYTHON = python
    process.env.XIAOXUE_BUNDLED_SKILLS_DIR = path.resolve(import.meta.dir, "../../../../.opencode/skills")
    const data = new Uint8Array(
      await Packer.toBuffer(
        new Document({ sections: [{ children: [new Paragraph("正文没有目标文本。")]}] }),
      ),
    )

    await expect(
      exportOfficeRevisionSet({
        data,
        fileName: "合同.docx",
        outputPath: workspace,
        edits: [{ id: "CONTRACT-404", matchText: "不存在的条款", replacement: "新条款" }],
      }),
    ).rejects.toThrow("OFFICE_REVISION_UNMATCHED")
    expect((await Array.fromAsync(new Bun.Glob("*.docx").scan({ cwd: workspace })))).toEqual([])
  })
})
