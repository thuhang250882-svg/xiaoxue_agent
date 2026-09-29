import { describe, expect, test } from "bun:test"
import type { Part } from "@opencode-ai/sdk/v2"
import { collectSessionArtifacts } from "./session-artifacts"

const completed = (output: unknown) => ({ type: "tool", state: { status: "completed", output: JSON.stringify(output) } }) as Part
const bashOutput = (output: string) => ({ type: "tool", tool: "bash", state: { status: "completed", output } }) as unknown as Part

describe("session artifact collection", () => {
  test("collects supported generated files from structured tool results and deduplicates paths", () => {
    const parts = [
      completed({ exportedFiles: [
        { filePath: "C:\\exports\\report.docx", fileName: "report.docx", size: 123 },
        { filePath: "C:\\exports\\slides.pptx", fileName: "slides.pptx" },
        { filePath: "C:\\exports\\legacy.doc", fileName: "legacy.doc" },
        { filePath: "C:\\exports\\old.xls", fileName: "old.xls" },
        { filePath: "C:\\exports\\old.ppt", fileName: "old.ppt" },
        { filePath: "C:\\exports\\data.mdb", fileName: "data.mdb" },
        { filePath: "C:\\exports\\notes.md", fileName: "notes.md" },
        { filePath: "relative.pdf" },
      ] }),
      completed({ type: "office_artifact_result", filePath: "C:\\exports\\report.docx", paragraphs: [{ location: "p1", text: "正文" }] }),
      completed({ exportedFile: { filePath: "/tmp/results.xlsx", fileName: "results.xlsx" } }),
      completed({ exportedFile: { filePath: "/tmp/unsupported.txt" } }),
    ]
    const artifacts = collectSessionArtifacts(parts)
    expect(artifacts.map((artifact) => artifact.fileName)).toEqual(["report.docx", "slides.pptx", "legacy.doc", "old.xls", "old.ppt", "data.mdb", "notes.md", "results.xlsx"])
    expect(artifacts[0]?.paragraphs).toEqual([{ location: "p1", text: "正文" }])
  })

  test("collects docx files written by bash-run scripts from stdout text", () => {
    const output = [
      "已用 python-docx 处理文本框正文。",
      "生成: E:\\小雪输出\\雪狼合同-最终修改版.docx",
      "核对完成 E:/小雪输出/雪狼合同-标注版.docx。",
      "引号路径 \"E:\\my docs\\report final.xlsx\" 校验通过",
    ].join("\n")
    const artifacts = collectSessionArtifacts([bashOutput(output)])
    expect(artifacts.map((artifact) => artifact.filePath)).toEqual([
      "E:\\my docs\\report final.xlsx",
      "E:\\小雪输出\\雪狼合同-最终修改版.docx",
      "E:/小雪输出/雪狼合同-标注版.docx",
    ])
    expect(artifacts[1]?.fileName).toBe("雪狼合同-最终修改版.docx")
  })

  test("bash stdout without artifact paths or non-bash text output yields nothing", () => {
    expect(collectSessionArtifacts([bashOutput("ok")])).toEqual([])
    expect(collectSessionArtifacts([{ type: "tool", tool: "read", state: { status: "completed", output: "内容引用 C:\\exports\\report.docx" } } as unknown as Part])).toEqual([])
    // stdout cannot distinguish generated files from merely mentioned ones;
    // we deliberately surface both rather than miss real artifacts.
    expect(collectSessionArtifacts([bashOutput("脚本引用了输入文件 E:\\refs\\source.doc")]).map((artifact) => artifact.fileName)).toEqual(["source.doc"])
  })
})
