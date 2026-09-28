import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import JSZip from "jszip"
import { readEditableDocx, saveEditableDocx } from "./docx-local-editor"

const directory = await mkdtemp(path.join(tmpdir(), "xiaoxue-docx-editor-"))
afterAll(() => rm(directory, { recursive: true, force: true }))

describe("local DOCX paragraph editing", () => {
  test("writes a separate copy and preserves unrelated OOXML parts", async () => {
    const zip = new JSZip()
    zip.file("word/document.xml", '<w:document xmlns:w="x"><w:body><w:p><w:r><w:t>甲 &amp; 乙</w:t></w:r></w:p><w:p><w:r><w:t>原文</w:t></w:r></w:p></w:body></w:document>')
    zip.file("word/media/image1.png", new Uint8Array([1, 2, 3]))
    const filePath = path.join(directory, "sample.docx")
    await writeFile(filePath, await zip.generateAsync({ type: "nodebuffer" }))
    const original = await readFile(filePath)
    const source = await readEditableDocx(filePath)
    expect(source.paragraphs).toEqual([{ index: 0, text: "甲 & 乙" }, { index: 1, text: "原文" }])

    const saved = await saveEditableDocx({ filePath, expectedSha256: source.sha256, edits: [{ index: 0, text: "新 <正文> & 内容" }] })
    expect(saved.filePath).not.toBe(filePath)
    expect(await readFile(filePath)).toEqual(original)
    expect((await readEditableDocx(saved.filePath)).paragraphs[0]?.text).toBe("新 <正文> & 内容")
    const copy = await JSZip.loadAsync(await readFile(saved.filePath))
    expect(await copy.file("word/media/image1.png")?.async("uint8array")).toEqual(new Uint8Array([1, 2, 3]))
    expect((await copy.file("word/document.xml")?.async("string"))?.includes("<w:t>原文</w:t>")).toBe(true)

    await expect(saveEditableDocx({ filePath, expectedSha256: "stale", edits: [{ index: 0, text: "覆盖" }] })).rejects.toThrow("原文件已发生变化")
  })
})
