import type { ParsedDocument } from "../../document_engine/types"
import type { ReviewIssue } from "../../document_engine/review_result"
import { MDB_STANDARD, observedTableName } from "./mdb-standard"

export type MdbSnapshot = {
  fileName: string
  size: number
  sha256: string
  tables: Array<{
    name: string
    rowCount: number
    columns: string[]
    records: Record<string, string | number | boolean | null>[]
  }>
}

type ReportValue = { value: string; location: string; unit?: string }
export type MdbCheck = {
  label: string
  field: string
  status: "一致" | "差异待复核" | "无法核验"
  report: ReportValue[]
  databaseValue: string | number | boolean | null
  databaseLocation: string
  reason: string
}

export type MdbAudit = {
  source: { fileName: string; sha256: string; size: number }
  profile: string
  mappingStatus: "标准字段映射，兼容实库扩展"
  standard: { code: string; confirmation: string; title: string }
  tableCount: number
  recordCount: number
  checks: MdbCheck[]
  issues: ReviewIssue[]
  dataQuality: {
    status: "已执行"
    standardTableCount: number
    matchedStandardTableCount: number
    extensionTableCount: number
    issues: ReviewIssue[]
  }
}

const fields = [
  { column: "JH", label: "井号", aliases: ["井号", "井名"], kind: "well", standard: true },
  { column: "JB", label: "井别", aliases: ["井别"], kind: "text", standard: false },
  { column: "WZJS", label: "完钻井深", aliases: ["完钻井深", "完钻深度"], kind: "depth", standard: true },
  { column: "WZCS", label: "完钻垂深", aliases: ["完钻垂深"], kind: "depth", standard: true },
  { column: "BXG", label: "补心高", aliases: ["补心高"], kind: "depth", standard: true },
  { column: "KZRQ", label: "开钻日期", aliases: ["开钻日期", "开钻时间"], kind: "date", standard: true },
  { column: "WZRQ", label: "完钻日期", aliases: ["完钻日期", "完钻时间"], kind: "date", standard: true },
  { column: "WJRQ", label: "完井日期", aliases: ["完井日期", "完井时间"], kind: "date", standard: true },
  { column: "WZCW", label: "完钻层位", aliases: ["完钻层位"], kind: "text", standard: true },
  { column: "WJFF", label: "完井方法", aliases: ["完井方法", "完井方式"], kind: "text", standard: true },
] as const

export function reviewMdbBasicData(document: ParsedDocument, snapshot: MdbSnapshot): MdbAudit {
  const table = snapshot.tables.find((table) => table.name === "ADLJ01" || table.name === "AJLJ01")
  // A report may include neighboring-well comparison tables. Anchor identity to its
  // basic-information table (well label plus another mapped basic field), not every 井号 cell.
  const basicTables = document.tables.filter((table) => {
    const labels = new Set(table.rows.flatMap((row) => row.map((cell) => cell.replace(/\s/g, "").split(/[，,（(]/)[0])))
    return (
      fields[0].aliases.some((label) => labels.has(label)) &&
      fields.filter((field) => field.aliases.some((label) => labels.has(label))).length >= 2
    )
  })
  const scoped = basicTables.length ? { ...document, tables: basicTables, paragraphs: [] } : document
  const wells = reportValues(scoped, fields[0].aliases)
  const names = [
    ...new Set(wells.map((item) => normalize(item.value, "well")).filter((value): value is string => typeof value === "string")),
  ]
  const matches =
    table?.records.flatMap((record, index) =>
      names.length === 1 && normalize(record.JH, "well") === names[0] ? [{ record, index }] : [],
    ) ?? []
  const blocked = !table
    ? "缺少 ADLJ01 基础表，当前 MDB 结构没有已适配的字段映射。"
    : names.length !== 1
      ? "主报告未识别到唯一、明确标注的井号，不能按文件名猜测所属井。"
      : !matches.length
        ? `MDB 基础表中没有与主报告井号 ${names[0]} 匹配的记录，禁止混用邻井数据。`
        : matches.length !== 1
          ? "MDB 基础表存在多条同井记录，需明确有效版本，不能任取一条。"
          : undefined
  const checks: MdbCheck[] = fields.map((field) => {
    const report = reportValues(scoped, field.aliases)
    const raw = matches.length === 1 ? (matches[0].record[field.column] ?? null) : null
    const expected = normalize(raw, field.kind, "m")
    const values = report.map((item) => normalize(item.value, field.kind, item.unit))
    const unavailable =
      blocked ??
      (expected === undefined
        ? "MDB 字段缺失、为空或值格式无法识别。"
        : !values.length
          ? "主报告中没有可明确定位的字段和值。"
          : values.some((value) => value === undefined)
            ? "报告值的格式或单位不明确。"
            : undefined)
    const equal =
      !unavailable &&
      values.every((value) =>
        typeof value === "number" && typeof expected === "number"
          ? Math.abs(value - expected) <= 0.005
          : value === expected,
      )
    return {
      label: field.label,
      field: `ADLJ01.${field.column}`,
      status: unavailable ? "无法核验" : equal ? "一致" : "差异待复核",
      report,
      databaseValue: raw,
      databaseLocation: `${snapshot.fileName} / ADLJ01 / ${matches.length === 1 ? `记录 ${matches[0].index + 1}，JH=${matches[0].record.JH}` : "记录未确定"} / ${field.column}`,
      reason:
        unavailable ??
        (equal
          ? field.standard
            ? `按 ${MDB_STANDARD.code} 表1字段定义核对一致。`
            : "按实库扩展字段核对一致；该字段不属于标准表1定义。"
          : field.standard
            ? `报告与 MDB 原值不一致；字段定义依据 ${MDB_STANDARD.code} 表1，仍需确认数据版本及实际情况。`
            : "报告与 MDB 实库扩展字段不一致，需确认扩展字段口径、数据版本及实际情况。"),
    }
  })
  const source = { fileName: snapshot.fileName, sha256: snapshot.sha256, size: snapshot.size }
  const issues: ReviewIssue[] = checks
    .filter((check) => check.status === "差异待复核")
    .map((check) => ({
      id: `MDB-${check.field}`,
      type: "MDB 基础数据交叉核对",
      location: check.report.map((item) => item.location).join("；"),
      originalText: `报告：${check.report.map((item) => item.value).join("；")}；MDB：${check.databaseValue}`,
      issue: `${check.label}存在差异。${check.reason}`,
      severity: "中",
      suggestion: "请核对原始录井数据库、报告基础表与最终施工记录，确认后统一；不要自动改写原始值。",
      basis: `${check.databaseLocation}；SHA-256=${snapshot.sha256}；字段依据 ${MDB_STANDARD.code} 表1；JB 为实库扩展字段。`,
      needHumanConfirm: true,
      sources: [
        {
          sourceId: snapshot.sha256,
          title: snapshot.fileName,
          category: "MDB基础数据库",
          section: check.databaseLocation,
        },
      ],
    }))
  issues.push({
    id: "MDB-COVERAGE",
    type: "MDB 核验范围与待确认事项",
    location: snapshot.fileName,
    originalText: checks.map((check) => `${check.label}：${check.status}`).join("；"),
    issue: blocked ?? "报告交叉核对按标准表1及实库 ADLJ01 别名执行；数据质量岗的结构与原始记录检查单独汇总，不能与报告质量结论混为一项。",
    severity: blocked ? "高" : "低",
    needHumanConfirm: true,
    suggestion: `标准数值字段按表1规定的米核对。无法核验：${
      checks
        .filter((check) => check.status === "无法核验")
        .map((check) => `${check.label}（${check.reason}）`)
        .join("；") || "无"
    }。跨表专业语义与最终解释结论仍需数据质量岗人工复核。`,
    basis: `${MDB_STANDARD.code}《${MDB_STANDARD.title}》（${MDB_STANDARD.confirmation}）；${snapshot.fileName}；SHA-256=${snapshot.sha256}；共 ${snapshot.tables.length} 表；日期按日比较，开钻、完钻、完井分别核对；数值绝对容差 0.005m。`,
  })
  const dataQuality = reviewMdbDataQuality(snapshot, names.length === 1 ? names[0] : undefined)
  return {
    source,
    profile: "QSY-XJ-0222-2009-v1",
    mappingStatus: "标准字段映射，兼容实库扩展",
    standard: { code: MDB_STANDARD.code, confirmation: MDB_STANDARD.confirmation, title: MDB_STANDARD.title },
    tableCount: snapshot.tables.length,
    recordCount: snapshot.tables.reduce((sum, table) => sum + table.rowCount, 0),
    checks,
    issues,
    dataQuality,
  }
}

function reviewMdbDataQuality(snapshot: MdbSnapshot, expectedWell?: string): MdbAudit["dataQuality"] {
  const standardNames = new Set(MDB_STANDARD.tables.flatMap(([name]) => [name, observedTableName(name)]))
  const matched = MDB_STANDARD.tables.filter(([name]) =>
    snapshot.tables.some((table) => table.name === name || table.name === observedTableName(name)),
  )
  const extensions = snapshot.tables.filter((table) => !standardNames.has(table.name))
  const basic = snapshot.tables.find((table) => table.name === "ADLJ01" || table.name === "AJLJ01")
  const missingBasicColumns = MDB_STANDARD.basicTable.requiredColumns.filter(
    (column) => !basic?.columns.includes(column),
  )
  const issues: ReviewIssue[] = []
  if (!basic) {
    issues.push(dataIssue(snapshot, "MDB-DATA-BASIC-TABLE", "缺少标准完井基础数据表 AJLJ01（兼容实库别名 ADLJ01）。", "高"))
  } else if (missingBasicColumns.length) {
    issues.push(
      dataIssue(
        snapshot,
        "MDB-DATA-BASIC-COLUMNS",
        `完井基础数据表缺少标准非空/关键字段：${missingBasicColumns.join("、")}。`,
        "高",
      ),
    )
  }
  for (const [name, title] of MDB_STANDARD.tables) {
    if (snapshot.tables.some((table) => table.name === name || table.name === observedTableName(name))) continue
    issues.push(
      dataIssue(snapshot, `MDB-DATA-TABLE-${name}`, `未发现标准表 ${name}（${title}）；如该井确无此类业务数据，需由数据质量岗确认“不适用”。`, "低"),
    )
  }
  if (basic) {
    basic.records.forEach((record, index) => {
      const location = `${basic.name} / 记录 ${index + 1}`
      const dates = [record.KZRQ, record.WZRQ, record.WJRQ].map(validDate)
      if (dates[0] && dates[1] && dates[0] > dates[1])
        issues.push(dataIssue(snapshot, `MDB-DATA-DATE-KZ-WZ-${index + 1}`, `${location}：开钻日期晚于完钻日期。`, "高"))
      if (dates[1] && dates[2] && dates[1] > dates[2])
        issues.push(dataIssue(snapshot, `MDB-DATA-DATE-WZ-WJ-${index + 1}`, `${location}：完钻日期晚于完井日期。`, "高"))
      const depth = finiteNumber(record.WZJS)
      const vertical = finiteNumber(record.WZCS)
      const height = finiteNumber(record.BXG)
      if (depth !== undefined && (depth < 50 || depth > 10_000))
        issues.push(dataIssue(snapshot, `MDB-DATA-WZJS-${index + 1}`, `${location}：WZJS=${record.WZJS} 超出标准 [50,10000] m。`, "高"))
      if (vertical !== undefined && depth !== undefined && vertical > depth)
        issues.push(dataIssue(snapshot, `MDB-DATA-WZCS-${index + 1}`, `${location}：WZCS=${record.WZCS} 大于 WZJS=${record.WZJS}。`, "高"))
      if (height !== undefined && (height < 0 || height > 20))
        issues.push(dataIssue(snapshot, `MDB-DATA-BXG-${index + 1}`, `${location}：BXG=${record.BXG} 超出标准 [0,20] m。`, "中"))
    })
  }
  for (const [standardName] of MDB_STANDARD.tables) {
    const table = snapshot.tables.find(
      (candidate) => candidate.name === standardName || candidate.name === observedTableName(standardName),
    )
    if (!table || table.rowCount === 0) continue
    if (table.records.length !== table.rowCount) {
      issues.push(
        dataIssue(
          snapshot,
          `MDB-DATA-INCOMPLETE-${standardName}`,
          `${table.name} 共 ${table.rowCount} 条，但本次只读取 ${table.records.length} 条，不能给出完整数据质量结论。`,
          "高",
        ),
      )
      continue
    }
    if (table.columns.includes("JH")) {
      const missingWell = table.records.filter((record) => normalize(record.JH, "well") === undefined).length
      if (missingWell)
        issues.push(
          dataIssue(snapshot, `MDB-DATA-JH-EMPTY-${standardName}`, `${table.name} 有 ${missingWell} 条记录的 JH 为空。`, "高"),
        )
      const otherWells = [
        ...new Set(
          table.records
            .map((record) => normalize(record.JH, "well"))
            .filter((well): well is string => well !== undefined && !!expectedWell && well !== expectedWell),
        ),
      ]
      if (otherWells.length)
        issues.push(
          dataIssue(
            snapshot,
            `MDB-DATA-JH-MISMATCH-${standardName}`,
            `${table.name} 含有与主报告井号不一致的记录：${otherWells.slice(0, 10).join("、")}${otherWells.length > 10 ? "等" : ""}。`,
            "高",
          ),
        )
    }
    if (table.columns.includes("DJSD1") && table.columns.includes("DJSD2")) {
      const invalid = table.records.filter((record) => {
        const top = finiteNumber(record.DJSD1)
        const bottom = finiteNumber(record.DJSD2)
        return top !== undefined && bottom !== undefined && top > bottom
      }).length
      if (invalid)
        issues.push(
          dataIssue(
            snapshot,
            `MDB-DATA-DEPTH-ORDER-${standardName}`,
            `${table.name} 有 ${invalid} 条记录的顶界深度 DJSD1 大于底界深度 DJSD2。`,
            "高",
          ),
        )
    }
  }
  return {
    status: "已执行",
    standardTableCount: MDB_STANDARD.tables.length,
    matchedStandardTableCount: matched.length,
    extensionTableCount: extensions.length,
    issues,
  }
}

function dataIssue(snapshot: MdbSnapshot, id: string, issue: string, severity: ReviewIssue["severity"]): ReviewIssue {
  return {
    id,
    type: "MDB 数据质量审核",
    location: snapshot.fileName,
    originalText: issue,
    issue,
    severity,
    suggestion: "由数据质量审核岗结合井况、业务适用性和源系统记录确认；不得自动补造或覆盖原始数据。",
    basis: `${MDB_STANDARD.code}《${MDB_STANDARD.title}》（${MDB_STANDARD.confirmation}）；SHA-256=${snapshot.sha256}。`,
    needHumanConfirm: true,
  }
}

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function validDate(value: unknown) {
  if (value === null || value === undefined || value === "") return
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value))
  return match ? String(value) : undefined
}

function reportValues(document: ParsedDocument, aliases: readonly string[]): ReportValue[] {
  const cells = document.tables.flatMap((table) =>
    table.rows.flatMap((row, rowIndex) =>
      row.flatMap((cell, column) => {
        const label = cell.replace(/\s/g, "").split(/[，,（(]/)[0]
        if (!aliases.includes(label) || !row[column + 1]?.trim()) return []
        return [
          {
            value: row[column + 1].trim(),
            location: `${document.fileName} / 表格 ${table.index} 第 ${rowIndex + 1} 行第 ${column + 2} 列`,
            unit: /(?:，|,|\(|（)\s*(km|m|米)(?:\s*[)）])?\s*$/i.exec(cell)?.[1].toLowerCase(),
          },
        ]
      }),
    ),
  )
  const paragraphs = document.paragraphs.flatMap((paragraph) => {
    const match = new RegExp(`^\\s*(?:${aliases.join("|")})\\s*[:：]\\s*(.+)$`).exec(paragraph.text)
    return match
      ? [
          {
            value: match[1].trim(),
            location: `${document.fileName} / ${paragraph.location ?? `段落 ${paragraph.index}`}`,
          },
        ]
      : []
  })
  return [...cells, ...paragraphs]
}

function normalize(value: unknown, kind: string, unit?: string): string | number | undefined {
  if (value === null || value === undefined || String(value).trim() === "") return
  const text = String(value).trim()
  if (kind === "well") return text.replace(/\s/g, "").replace(/井$/, "")
  if (kind === "text") return text.replace(/\s/g, "")
  if (kind === "date") {
    const match = /^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})(?:日|T.*|\s.*)?$/.exec(text)
    if (!match) return
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    if (date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) return
    return date.toISOString().slice(0, 10)
  }
  const match = /^([+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?)\s*(km|m|米)?$/i.exec(text)
  const resolvedUnit = match?.[2]?.toLowerCase() ?? unit
  if (!match || !resolvedUnit) return
  const number = Number(match[1].replace(/,/g, "")) * (resolvedUnit === "km" ? 1000 : 1)
  return Number.isFinite(number) && number >= 0 ? number : undefined
}
