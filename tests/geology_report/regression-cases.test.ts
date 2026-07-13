import { expect, test } from "bun:test"
import { Document, Packer, Paragraph, Table, TableCell, TableRow } from "docx"
import { utils, write } from "xlsx"
import { reviewUploadedAttachments } from "../../domains/geology_report"

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

async function docx(lines: string[], fields: Array<[string, string]> = []) {
  return Packer.toBuffer(new Document({ sections: [{ children: [
    ...lines.map((line) => new Paragraph(line)),
    ...(fields.length ? [new Table({ rows: fields.map(([key, value]) => new TableRow({ children: [
      new TableCell({ children: [new Paragraph(key)] }),
      new TableCell({ children: [new Paragraph(value)] }),
    ] })) })] : []),
  ] }] }))
}

function xlsx(rows: Array<Array<string | number>>, sheetName: string) {
  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, utils.aoa_to_sheet(rows), sheetName)
  return write(workbook, { type: "buffer", bookType: "xlsx" })
}

function attachment(filename: string, mime: string, bytes: Uint8Array) {
  return { filename, mime, url: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}` }
}

const completeSections = [
  "封面", "目录", "基本数据", "地质概况", "录井施工情况", "地层划分", "岩性描述", "油气显示", "结论与建议", "附表", "签字盖章",
]

test("case A: complete report bundle avoids high-risk well conflicts", async () => {
  const report = await docx([
    "塔里木XX1井地质录井报告", ...completeSections,
    "井号：塔里木XX1井", "井别：评价井", "井型：直井", "设计井深：3500m", "完钻井深：3480m", "完钻层位：奥陶系",
    "开钻日期：2026-01-01", "完钻日期：2026-02-01", "施工单位：钻井一队", "录井单位：录井一队", "地理位置：塔里木盆地", "构造位置：测试构造",
    "0-1200m 第四系；1200-3480m 奥陶系", "岩性以灰岩为主。", "显示井段：2200-2210m，荧光无异常，气测无异常，未见明显油气显示。", "资料齐全，建议结合测井资料复核。",
  ], [["井号", "塔里木XX1井"], ["完钻井深", "3480m"]])
  const card = xlsx([["字段", "内容"], ["井号", "塔里木XX1井"], ["完钻井深", 3480]], "完井卡片")
  const shows = xlsx([["井号", "井段", "显示结论"], ["塔里木XX1井", "2200-2210m", "未见明显油气显示"]], "油气显示")
  const result = await reviewUploadedAttachments({
    sessionId: "regression-valid", taskId: "case-valid", primaryReport: "塔里木XX1井地质录井报告.docx",
    attachments: [attachment("塔里木XX1井地质录井报告.docx", DOCX_MIME, report), attachment("塔里木XX1井完井卡片.xlsx", XLSX_MIME, card), attachment("塔里木XX1井油气显示.xlsx", XLSX_MIME, shows)],
  })

  expect(result.result.issues.some((issue) => issue.id === "BUNDLE-WELL-001")).toBe(false)
  expect(result.result.issues.filter((issue) => issue.severity === "高").map((issue) => ({ id: issue.id, type: issue.type, originalText: issue.originalText }))).toEqual([])
  expect(result.result.summary.totalIssues).toBe(result.result.issues.length)
})

test("case B: deliberate report errors trigger professional rules with locations", async () => {
  const report = await docx([
    "塔里木XX1井地质录井报告", "井号：塔里木XX1井", "正文另记塔里木XX2井", "完钻井深：3500M", "地层划分",
    "1000-1200m 奥陶系", "1150-1300米 奥陶系", "油气表现：待补充", "XXX", "TODO", "结论与建议",
  ], [["井号", "塔里木XX1井"], ["完钻井深", "3500m"]])
  const result = await reviewUploadedAttachments({
    sessionId: "regression-errors", taskId: "case-errors", primaryReport: "塔里木XX1井错误报告.docx",
    attachments: [attachment("塔里木XX1井错误报告.docx", DOCX_MIME, report)],
  })
  const issues = result.result.issues

  expect(issues.some((issue) => issue.type.includes("井号") || issue.id.startsWith("WELL-"))).toBe(true)
  expect(issues.some((issue) => issue.type.includes("地层") || issue.id.startsWith("STRAT-"))).toBe(true)
  expect(issues.some((issue) => issue.type.includes("术语") || issue.id.startsWith("TERM-"))).toBe(true)
  expect(issues.every((issue) => issue.location.length > 0)).toBe(true)
  expect(issues.some((issue) => issue.severity === "高")).toBe(true)
})

test("case C: cross-file well conflict identifies both source documents", async () => {
  const report = await docx([
    "塔里木XX1井地质录井报告", ...completeSections, "井号：塔里木XX1井", "完钻井深：3480m", "0-3480m 奥陶系", "未见明显油气显示。",
  ], [["井号", "塔里木XX1井"]])
  const card = xlsx([["字段", "内容"], ["井号", "塔里木XX2井"], ["完钻井深", 3600]], "完井卡片")
  const result = await reviewUploadedAttachments({
    sessionId: "regression-conflict", taskId: "case-conflict", primaryReport: "塔里木XX1井地质录井报告.docx",
    attachments: [attachment("塔里木XX1井地质录井报告.docx", DOCX_MIME, report), attachment("塔里木XX2井完井卡片.xlsx", XLSX_MIME, card)],
  })
  const conflict = result.result.issues.find((issue) => issue.id === "BUNDLE-WELL-001")

  expect(conflict).toBeDefined()
  expect(conflict?.severity).toBe("高")
  expect(conflict?.originalText).toContain("塔里木XX1井")
  expect(conflict?.originalText).toContain("塔里木XX2井")
  expect(conflict?.needHumanConfirm).toBe(true)
})