import { expect, test } from "bun:test"
import path from "node:path"
import { Document, Packer, Paragraph, Table, TableCell, TableRow } from "docx"
import { utils, write } from "xlsx"
import { exportReviewResultToDocx, parseDocument } from "../../../document_engine"
import { reviewUploadedAttachments } from "../../../domains/geology_report"
import type { ReportAgentState } from "../../../domains/geology_report"

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

async function reportDocx() {
  return Packer.toBuffer(
    new Document({
      sections: [
        {
          children: [
            new Paragraph("塔里木XX1井地质录井报告"),
            new Paragraph("井号：塔里木XX1井"),
            new Paragraph("基本数据"),
            new Paragraph("完钻井深：3500m"),
            new Paragraph("地层划分"),
            new Paragraph("100-200m 190-300m"),
            new Paragraph("油气显示"),
            new Paragraph("油气表现：待补充"),
            new Paragraph("结论与建议"),
            new Table({
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("井号")] }),
                    new TableCell({ children: [new Paragraph("塔里木XX1井")] }),
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

function completionCardXlsx() {
  const workbook = utils.book_new()
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet([
      ["字段", "内容", "日期"],
      ["井号", "塔里木XX2井", new Date("2026-07-10T00:00:00Z")],
      ["完钻井深", 3600.5, ""],
      ["空值保留", "", ""],
    ]),
    "完井卡片",
  )
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([["说明"], ["测试资料"]]), "附注")
  return write(workbook, { type: "buffer", bookType: "xlsx", cellDates: true })
}

function dataUrl(mime: string, bytes: Uint8Array) {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`
}

test("uploaded DOCX and XLSX follow the real review pipeline", async () => {
  const docx = await reportDocx()
  const xlsx = completionCardXlsx()
  const states: ReportAgentState[] = []
  const envelope = await reviewUploadedAttachments({
    sessionId: "session-e2e",
    taskId: "review-e2e",
    primaryReport: "塔里木XX1井报告.docx",
    attachments: [
      { filename: "塔里木XX1井报告.docx", mime: DOCX_MIME, url: dataUrl(DOCX_MIME, docx) },
      { filename: "完井卡片.xlsx", mime: XLSX_MIME, url: dataUrl(XLSX_MIME, xlsx) },
    ],
    onState: (event) => states.push(event.state),
  })

  expect(states).toEqual(["reading", "reviewing", "thinking", "success"])
  expect(envelope.type).toBe("geology_report_review_result")
  expect(envelope.result.taskId).toBe("review-e2e")
  expect(envelope.result.summary.totalIssues).toBe(envelope.result.issues.length)
  expect(envelope.result.issues).toContainEqual(
    expect.objectContaining({ id: "BUNDLE-WELL-001", severity: "高", needHumanConfirm: true }),
  )

  const parsedXlsx = await parseDocument({ fileName: "完井卡片.xlsx", mimeType: XLSX_MIME, data: xlsx })
  expect(parsedXlsx.tables).toHaveLength(2)
  expect(parsedXlsx.tables[0].sheetName).toBe("完井卡片")
  expect(parsedXlsx.tables[0].rows[3]).toEqual(["空值保留", "", ""])

  const exported = await exportReviewResultToDocx(envelope.result, {
    outputPath: path.join(import.meta.dir, ".tmp-upload_docx_review.test"),
  })
  const bytes = new Uint8Array(await Bun.file(exported.filePath).arrayBuffer())
  expect(exported.format).toBe("docx")
  expect(bytes[0]).toBe(0x50)
  expect(bytes[1]).toBe(0x4b)
  expect(zipEntryNames(bytes)).toContain("word/document.xml")
})

test("invalid attachment emits reading then error and returns no synthetic result", async () => {
  const states: ReportAgentState[] = []
  await expect(
    reviewUploadedAttachments({
      sessionId: "session-error",
      attachments: [{ filename: "损坏报告.docx", mime: DOCX_MIME, url: dataUrl(DOCX_MIME, new Uint8Array([1, 2, 3])) }],
      onState: (event) => states.push(event.state),
    }),
  ).rejects.toThrow("不是有效的 DOCX")
  expect(states).toEqual(["reading", "error"])
})

function zipEntryNames(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const names: string[] = []
  for (let offset = 0; offset + 46 <= bytes.length; offset++) {
    if (view.getUint32(offset, true) !== 0x02014b50) continue
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    names.push(new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength)))
    offset += 45 + nameLength + extraLength + commentLength
  }
  return names
}
