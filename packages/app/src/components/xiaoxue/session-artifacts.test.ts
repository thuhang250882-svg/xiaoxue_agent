import { describe, expect, test } from "bun:test"
import type { Part } from "@opencode-ai/sdk/v2"
import { collectSessionArtifacts } from "./session-artifacts"

const completed = (output: unknown) => ({ type: "tool", state: { status: "completed", output: JSON.stringify(output) } }) as Part

describe("session artifact collection", () => {
  test("collects supported generated files from structured tool results and deduplicates paths", () => {
    const parts = [
      completed({ exportedFiles: [
        { filePath: "C:\\exports\\report.docx", fileName: "report.docx", size: 123 },
        { filePath: "C:\\exports\\slides.pptx", fileName: "slides.pptx" },
        { filePath: "relative.pdf" },
      ] }),
      completed({ type: "office_artifact_result", filePath: "C:\\exports\\report.docx", paragraphs: [{ location: "p1", text: "正文" }] }),
      completed({ exportedFile: { filePath: "/tmp/results.xlsx", fileName: "results.xlsx" } }),
      completed({ exportedFile: { filePath: "/tmp/unsupported.txt" } }),
    ]
    const artifacts = collectSessionArtifacts(parts)
    expect(artifacts.map((artifact) => artifact.fileName)).toEqual(["report.docx", "slides.pptx", "results.xlsx"])
    expect(artifacts[0]?.paragraphs).toEqual([{ location: "p1", text: "正文" }])
  })
})
