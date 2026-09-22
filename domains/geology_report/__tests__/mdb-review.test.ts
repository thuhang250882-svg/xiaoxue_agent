import { expect, test } from "bun:test"
import { createParsedDocument } from "../../../document_engine/types"
import { reviewMdbBasicData } from "../mdb-review"
import type { MdbSnapshot } from "../mdb-review"
import { reviewUploadedAttachments } from "../upload_review"

function snapshot(
  records: MdbSnapshot["tables"][number]["records"] = [
    { JH: "测试1", WZJS: 4820, WJFF: "裸眼完井", KZRQ: "2026-06-08", WZRQ: "2026-08-22", WJRQ: "2026-09-06" },
  ],
): MdbSnapshot {
  return {
    fileName: "测试1.mdb",
    size: 8192,
    sha256: "a".repeat(64),
    tables: [{ name: "ADLJ01", rowCount: records.length, columns: Object.keys(records[0] ?? {}), records }],
  }
}

function document(
  rows = [
    ["井号", "测试1井"],
    ["完钻井深，m", "4820.00"],
    ["完井方法", "尾管完井"],
    ["开钻日期", "2026年06月08日", "完钻日期", "2026年08月22日", "完井日期", "2026年09月06日"],
  ],
) {
  return createParsedDocument({
    fileName: "测试1井录井报告.docx",
    fileType: "docx",
    rawText: "测试1井录井报告",
    tables: [{ index: 8, rows }],
  })
}

test("matches well and depth, keeps completion dates distinct and cites method conflict", () => {
  const audit = reviewMdbBasicData(document(), snapshot())
  expect(audit.checks.find((check) => check.field === "ADLJ01.WZJS")?.status).toBe("一致")
  for (const field of ["KZRQ", "WZRQ", "WJRQ"])
    expect(audit.checks.find((check) => check.field.endsWith(`.${field}`))?.status).toBe("一致")
  const conflict = audit.issues.find((issue) => issue.id === "MDB-ADLJ01.WJFF")
  expect(conflict?.originalText).toContain("尾管完井")
  expect(conflict?.originalText).toContain("裸眼完井")
  expect(conflict?.basis).toContain("记录 1，JH=测试1")
  expect(conflict?.basis).toContain("a".repeat(64))
  expect(conflict?.needHumanConfirm).toBe(true)
  expect(audit.mappingStatus).toContain("标准字段映射")
  expect(audit.standard.code).toBe("Q/SY XJ 0222-2009")
})

test("wrong well and duplicate same-well records block comparisons", () => {
  for (const records of [
    [{ JH: "邻井2", WZJS: 4820 }],
    [
      { JH: "测试1", WZJS: 4820 },
      { JH: "测试1", WZJS: 4800 },
    ],
  ]) {
    const result = reviewMdbBasicData(document(), snapshot(records))
    expect(result.checks.every((check) => check.status === "无法核验")).toBe(true)
    expect(result.issues.find((issue) => issue.id === "MDB-COVERAGE")?.severity).toBe("高")
  }
})

test("neighboring-well comparison tables do not override primary basic-table identity", () => {
  const report = document()
  report.tables.push({ index: 9, rows: [["井号", "邻井2井", "GR", "80"]] })
  const result = reviewMdbBasicData(report, snapshot())
  expect(result.checks.find((check) => check.field === "ADLJ01.JH")?.status).toBe("一致")
  expect(result.checks.find((check) => check.field === "ADLJ01.JH")?.report).toHaveLength(1)
  expect(result.issues.some((issue) => issue.id === "MDB-ADLJ01.WJFF")).toBe(true)
})

test("unsupported schema or missing field never becomes a passing comparison", () => {
  expect(
    reviewMdbBasicData(document(), { ...snapshot(), tables: [] }).checks.every((check) => check.status === "无法核验"),
  ).toBe(true)
  const result = reviewMdbBasicData(document(), snapshot([{ JH: "测试1", WZJS: null }]))
  expect(result.checks.find((check) => check.field === "ADLJ01.WZJS")?.status).toBe("无法核验")
})

test("does not confuse design depth with actual final depth or infer missing units", () => {
  for (const row of [
    ["设计完钻井深，m", "4820"],
    ["完钻井深", "4820"],
    ["完钻井深，m", "-9999"],
  ]) {
    const result = reviewMdbBasicData(document([["井号", "测试1"], row]), snapshot())
    expect(result.checks.find((check) => check.field === "ADLJ01.WZJS")?.status).toBe("无法核验")
  }
})

test("explicit km units convert and conflicting repeated values are reported", () => {
  expect(
    reviewMdbBasicData(
      document([
        ["井号", "测试1"],
        ["完钻井深，km", "4.820"],
      ]),
      snapshot(),
    ).checks.find((check) => check.field === "ADLJ01.WZJS")?.status,
  ).toBe("一致")
  const result = reviewMdbBasicData(
    document([
      ["井号", "测试1"],
      ["完钻井深，m", "4820"],
      ["完钻井深，m", "4800"],
    ]),
    snapshot(),
  )
  expect(result.checks.find((check) => check.field === "ADLJ01.WZJS")?.status).toBe("差异待复核")
})

test("upload review includes MDB checks and hash in the final result", async () => {
  const result = await reviewUploadedAttachments({
    sessionId: "mdb-test",
    mdb: snapshot(),
    attachments: [
      {
        filename: "测试1井录井报告.txt",
        mime: "text/plain",
        url: `data:text/plain;base64,${Buffer.from("井号：测试1井\n\n完钻井深：4800m\n\n完井方式：尾管完井").toString("base64")}`,
      },
    ],
  })
  expect(result.mdbAudit?.checks.find((check) => check.field === "ADLJ01.WZJS")?.status).toBe("差异待复核")
  expect(result.result.issues.some((issue) => issue.id === "MDB-ADLJ01.WZJS")).toBe(true)
  expect(
    result.resolvedSources?.some((source) => source.fileName === "测试1.mdb" && source.sha256 === "a".repeat(64)),
  ).toBe(true)
  expect(result.qualityTracks.reportQuality.status).toBe("已完成")
  expect(result.qualityTracks.dataQuality.status).toBe("已完成")
})

test("separates database quality findings from report quality and keeps report review available without MDB", async () => {
  const invalid = snapshot([
    {
      JH: "测试1",
      KZRQ: "2026-08-23",
      WZRQ: "2026-08-22",
      WJRQ: "2026-08-21",
      BXG: 21,
      WZJS: 48,
      WZCS: 49,
    },
  ])
  const audit = reviewMdbBasicData(document(), invalid)
  expect(audit.dataQuality.issues.some((issue) => issue.id === "MDB-DATA-DATE-KZ-WZ-1")).toBe(true)
  expect(audit.dataQuality.issues.some((issue) => issue.id === "MDB-DATA-WZJS-1")).toBe(true)
  expect(audit.issues.some((issue) => issue.id.startsWith("MDB-DATA-"))).toBe(false)

  const reportOnly = await reviewUploadedAttachments({
    sessionId: "report-only-test",
    attachments: [{ filename: "测试1井录井报告.txt", mime: "text/plain", url: "data:text/plain,井号：测试1井" }],
  })
  expect(reportOnly.qualityTracks.reportQuality.status).toBe("已完成")
  expect(reportOnly.qualityTracks.dataQuality.status).toBe("未执行")
  if (reportOnly.qualityTracks.dataQuality.status === "未执行")
    expect(reportOnly.qualityTracks.dataQuality.reason).toContain("未提供 MDB")
})

test("a requested report cannot silently fall back to another attachment", async () => {
  await expect(
    reviewUploadedAttachments({
      sessionId: "mdb-test",
      primaryReport: "missing.txt",
      attachments: [{ filename: "other.txt", mime: "text/plain", url: "data:text/plain,hello" }],
    }),
  ).rejects.toThrow("不在本次读取资料中")
})
