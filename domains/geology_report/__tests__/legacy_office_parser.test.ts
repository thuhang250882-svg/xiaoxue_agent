import { expect, test } from "bun:test"
import { write, utils } from "xlsx"
import { detectDocumentType, parseDocument } from "../../../document_engine"

test("detectDocumentType recognizes legacy Word and Excel formats", () => {
  expect(detectDocumentType("呼北2井录井报告.doc", "application/msword")).toBe("doc")
  expect(detectDocumentType("完井卡片.XLS")).toBe("xls")
})

test("legacy DOC extracted text keeps tabular evidence", async () => {
  const parsed = await parseDocument({
    fileName: "呼北2井录井报告.doc",
    content: "呼北2井录井报告\n\n井号\t呼北2井\n完钻井深\t7130.00m",
    mimeType: "application/msword",
  })

  expect(parsed.fileType).toBe("doc")
  expect(parsed.rawText).toContain("7130.00m")
  expect(parsed.tables).toHaveLength(1)
  expect(parsed.tables[0]?.rows[0]).toEqual(["井号", "呼北2井"])
})

test("legacy XLS workbooks use the spreadsheet parser", async () => {
  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([["井号", "呼北2井"], ["完钻井深", 7130]]), "基本数据")
  const parsed = await parseDocument({
    fileName: "完井卡片.xls",
    content: write(workbook, { type: "buffer", bookType: "biff8" }),
    mimeType: "application/vnd.ms-excel",
  })

  expect(parsed.fileType).toBe("xls")
  expect(parsed.tables[0]?.sheetName).toBe("基本数据")
  expect(parsed.rawText).toContain("呼北2井")
})
