import { expect, test } from "bun:test"
import path from "node:path"
import { Document, Packer, Paragraph, Table, TableCell, TableRow } from "docx"
import { parseDocument, exportReviewResultToDocx, packReviewResultToDocxBlob } from "../../../document_engine"
import { reviewGeologyReport } from "../reviewer"

async function createSampleDocx() {
  return Packer.toBuffer(
    new Document({
      sections: [
        {
          children: [
            new Paragraph("XX1井地质录井报告"),
            new Paragraph("井号：XX1井"),
            new Paragraph("完钻井深：3500m"),
            new Paragraph("地层划分"),
            new Paragraph("100-200m 190-300m"),
            new Paragraph("油气表现：待补充"),
            new Table({
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("井号")] }),
                    new TableCell({ children: [new Paragraph("XX1井")] }),
                  ],
                }),
              ],
            }),
          ],
        },
      ],
    }),
  )
}

test("parseDocument extracts text and tables from a real DOCX buffer", async () => {
  const parsed = await parseDocument({
    fileName: "XX1井报告.docx",
    content: await createSampleDocx(),
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  })

  expect(parsed.fileType).toBe("docx")
  expect(parsed.rawText).toContain("XX1井")
  expect(parsed.rawText).toContain("完钻井深")
  expect(parsed.paragraphs.length).toBeGreaterThan(3)
  expect(parsed.tables.length).toBe(1)
})

test("reviewer produces ReviewResult from parsed DOCX content", async () => {
  const parsed = await parseDocument({
    fileName: "XX1井报告.docx",
    content: await createSampleDocx(),
  })
  const result = await reviewGeologyReport({ document: parsed })

  expect(result.fileName).toBe("XX1井报告.docx")
  expect(result.summary.totalIssues).toBe(result.issues.length)
  expect(
    result.issues.some((issue) => issue.issue.includes("油气显示") || issue.originalText.includes("油气表现")),
  ).toBe(true)
})

test("exportReviewResultToDocx writes a valid OOXML file", async () => {
  const parsed = await parseDocument({
    fileName: "XX1井报告.docx",
    content: await createSampleDocx(),
  })
  const result = await reviewGeologyReport({ document: parsed })
  const exported = await exportReviewResultToDocx(result, {
    outputPath: path.join(import.meta.dir, ".tmp-docx_parser_exporter.test"),
  })
  const bytes = new Uint8Array(await Bun.file(exported.filePath).arrayBuffer())

  expect(exported.format).toBe("docx")
  expect(exported.size).toBeGreaterThan(1000)
  expect(bytes[0]).toBe(0x50)
  expect(bytes[1]).toBe(0x4b)
})
test("packReviewResultToDocxBlob creates a downloadable OOXML blob", async () => {
  const parsed = await parseDocument({
    fileName: "XX1井报告.docx",
    content: await createSampleDocx(),
  })
  const result = await reviewGeologyReport({ document: parsed })
  const exported = await packReviewResultToDocxBlob(result)
  const bytes = new Uint8Array(await exported.blob.arrayBuffer())

  expect(exported.fileName.endsWith(".docx")).toBe(true)
  expect(exported.blob.size).toBeGreaterThan(1000)
  expect(bytes[0]).toBe(0x50)
  expect(bytes[1]).toBe(0x4b)
})
