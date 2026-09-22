import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import JSZip from "jszip"
import { previewOfficeArtifact } from "../../src/tool/office-artifact-preview"

const workspaces: string[] = []

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })))
})

describe("Office artifact preview", () => {
  test("builds a slide-grouped right-panel payload from PPTX", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "xiaoxue-pptx-preview-"))
    workspaces.push(workspace)
    const filePath = path.join(workspace, "修改后.pptx")
    const archive = new JSZip()
    archive.file(
      "ppt/slides/slide1.xml",
      '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><a:p><a:r><a:t>录井汇报</a:t></a:r></a:p><a:tbl><a:tr><a:tc><a:p><a:r><a:t>井号</a:t></a:r></a:p></a:tc><a:tc><a:p><a:r><a:t>XX-1</a:t></a:r></a:p></a:tc></a:tr></a:tbl></p:cSld></p:sld>',
    )
    await writeFile(filePath, await archive.generateAsync({ type: "uint8array" }))

    const result = await previewOfficeArtifact(filePath)

    expect(result.fileType).toBe("pptx")
    expect(
      result.paragraphs.some((paragraph) => paragraph.location === "幻灯片 1" && paragraph.text === "录井汇报"),
    ).toBe(true)
    expect(result.tables[0]).toEqual({ location: "幻灯片 1 表格 1", rows: [["井号", "XX-1"]] })
    expect(result.metadata.slideCount).toBe(1)
    expect(result.modifiedAt).toBeGreaterThan(0)
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(result.annotations).toEqual([])
  })

  test("rejects unsupported outputs", async () => {
    await expect(previewOfficeArtifact(path.resolve("result.ppt"))).rejects.toThrow("仅支持 DOCX、XLSX、PPTX 和 PDF")
  })
})
