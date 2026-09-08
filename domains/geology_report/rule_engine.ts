import type { ParsedDocument, ReviewIssue, ReviewSeverity } from "../../document_engine"
import { RuleExecutionError } from "../shared"
import { executeRules, extractWellNames, loadRulesFromYaml, loadRulesFromYamlContents } from "./rules/loader"
import structureRules from "./rules/structure_rules.yaml" with { type: "text" }
import wellBasicInfoRules from "./rules/well_basic_info_rules.yaml" with { type: "text" }
import stratigraphyRules from "./rules/stratigraphy_rules.yaml" with { type: "text" }
import lithologyRules from "./rules/lithology_rules.yaml" with { type: "text" }
import oilGasShowRules from "./rules/oil_gas_show_rules.yaml" with { type: "text" }
import gasLoggingRules from "./rules/gas_logging_rules.yaml" with { type: "text" }
import terminologyRules from "./rules/terminology_rules.yaml" with { type: "text" }
import consistencyRules from "./rules/consistency_rules.yaml" with { type: "text" }

const DEFAULT_RULE_SOURCES = [
  { rulePath: "structure_rules.yaml", content: structureRules },
  { rulePath: "well_basic_info_rules.yaml", content: wellBasicInfoRules },
  { rulePath: "stratigraphy_rules.yaml", content: stratigraphyRules },
  { rulePath: "lithology_rules.yaml", content: lithologyRules },
  { rulePath: "oil_gas_show_rules.yaml", content: oilGasShowRules },
  { rulePath: "gas_logging_rules.yaml", content: gasLoggingRules },
  { rulePath: "terminology_rules.yaml", content: terminologyRules },
  { rulePath: "consistency_rules.yaml", content: consistencyRules },
]

export async function reviewGeologyReportRulesAsync(
  document: ParsedDocument,
  rulePaths?: string[],
): Promise<ReviewIssue[]> {
  try {
    const evaluators = rulePaths ? await loadRulesFromYaml(rulePaths) : loadRulesFromYamlContents(DEFAULT_RULE_SOURCES)
    return normalizeIssueIds(executeRules(evaluators, document))
  } catch (error) {
    throw new RuleExecutionError("加载或执行地质录井报告规则失败", { cause: error })
  }
}

export function reviewGeologyReportRules(document: ParsedDocument): ReviewIssue[] {
  return normalizeIssueIds([
    ...checkWellName(document),
    ...checkCompletionDepth(document),
    ...checkDepthUnitMix(document),
    ...checkTemplateResidue(document),
  ])
}

function checkWellName(document: ParsedDocument): ReviewIssue[] {
  const wellNames = extractWellNames(document)

  if (wellNames.length === 0) {
    return [
      createIssue("LEGACY-WELL", 0, {
        type: "missing_well_name",
        location: "全文",
        originalText: "",
        issue: "未识别到明确井号。",
        severity: "高",
        suggestion: "在报告封面、基本情况和正文关键位置补充统一井号。",
        basis: "基础信息规则：地质录井报告必须能识别唯一井号。",
        needHumanConfirm: true,
      }),
    ]
  }

  if (wellNames.length <= 1) return []

  return [
    createIssue("LEGACY-WELL", 1, {
      type: "multiple_well_names",
      location: "全文",
      originalText: wellNames.join("、"),
      issue: "报告中出现多个不同井号，可能存在复制粘贴或引用错误。",
      severity: "高",
      suggestion: "核对报告封面、正文、表格和附件中的井号，统一为本井井号。",
      basis: "一致性规则：同一份报告中的井号应保持一致。",
      needHumanConfirm: true,
    }),
  ]
}

function checkCompletionDepth(document: ParsedDocument): ReviewIssue[] {
  const match = findCompletionDepth(document)
  if (match) return []
  return [
    createIssue("LEGACY-DEPTH", 0, {
      type: "missing_completion_depth",
      location: "全文",
      originalText: "",
      issue: "未识别到完钻井深。",
      severity: "高",
      suggestion: "补充完钻井深，并与井史、完井资料、录井综合记录保持一致，单位统一为 m。",
      basis: "基础信息规则：地质录井报告应明确完钻井深。",
      needHumanConfirm: true,
    }),
  ]
}

export function findCompletionDepth(document: ParsedDocument): { value: number; unit: "m"; location: string; text: string } | undefined {
  const rows = [
    ...document.paragraphs.map((paragraph) => ({ text: paragraph.text, location: paragraph.location ?? `P${paragraph.index}` })),
    ...document.tables.flatMap((table) =>
      table.rows.map((row, index) => ({ text: row.join(" "), location: `${table.location ?? `Table ${table.index}`} R${index + 1}` })),
    ),
  ]

  for (const row of rows) {
    const match = row.text.match(/(?:完钻井深|完钻深度|完井井深)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(m|米)?(?![\s\S]*\n)/i)
    if (match) return { value: Number(match[1]), unit: "m", location: row.location, text: match[0] }
  }
  return undefined
}

function checkDepthUnitMix(document: ParsedDocument): ReviewIssue[] {
  const units = Array.from(document.rawText.matchAll(/\d+(?:\.\d+)?\s*(m|米|M)(?=[\s,，。；;、\n]|$)/g)).map((match) => match[1])
  const uniqueUnits = Array.from(new Set(units))
  if (uniqueUnits.length <= 1) return []
  return [
    createIssue("LEGACY-UNIT", 0, {
      type: "mixed_depth_units",
      location: "全文",
      originalText: uniqueUnits.join("、"),
      issue: "报告中存在 m、米、M 等深度单位混用。",
      severity: "低",
      suggestion: "统一深度单位写法，建议全文采用 m。",
      basis: "格式一致性规则：同类计量单位应在同一报告内保持一致。",
      needHumanConfirm: false,
    }),
  ]
}

function checkTemplateResidue(document: ParsedDocument): ReviewIssue[] {
  return ["待补充", "此处填写", "XXX", "TODO"].flatMap((term, index) => {
    if (!document.rawText.includes(term)) return []
    return [
      createIssue("LEGACY-TEMPLATE", index, {
        type: "template_residue",
        location: locateText(document, term),
        originalText: term,
        issue: `发现模板残留词“${term}”。`,
        severity: "中",
        suggestion: "删除模板占位内容，补充本井实际资料。",
        basis: "文档完整性规则：正式报告不得保留占位词或待填项。",
        needHumanConfirm: false,
      }),
    ]
  })
}

function locateText(document: ParsedDocument, text: string) {
  const paragraph = document.paragraphs.find((item) => item.text.includes(text))
  return paragraph?.location ?? "全文"
}

function createIssue(prefix: string, index: number, issue: Omit<ReviewIssue, "id">): ReviewIssue {
  return { id: `${prefix}-${String(index + 1).padStart(3, "0")}`, ...issue }
}

function normalizeIssueIds(issues: ReviewIssue[]): ReviewIssue[] {
  const seen = new Set<string>()
  return issues.map((issue, index) => {
    const id = issue.id && !seen.has(issue.id) ? issue.id : `GR-${String(index + 1).padStart(3, "0")}`
    seen.add(id)
    return { ...issue, id, severity: normalizeSeverity(issue.severity) }
  })
}

function normalizeSeverity(severity: ReviewSeverity): ReviewSeverity {
  if (severity === "高" || severity === "中" || severity === "低") return severity
  return "中"
}
