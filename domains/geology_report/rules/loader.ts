import { parse } from "yaml"
import { readFile } from "node:fs/promises"
import type { ParsedDocument, ReviewIssue, ReviewSeverity } from "../../../document_engine"
import { RuleExecutionError } from "../../shared"

type RuleCategory =
  | "structure"
  | "well_basic_info"
  | "terminology"
  | "stratigraphy"
  | "lithology"
  | "oil_gas_show"
  | "gas_logging"
  | "consistency"

type YamlRule = {
  id: string
  category?: RuleCategory
  name?: string
  severity?: string
  checks?: string[]
  fields?: string[]
  required_fields?: string[]
  required_parts?: string[]
  required_keywords?: string[]
  field_aliases?: Record<string, string[]>
  preferred_terms?: Record<string, { forbidden?: string[] }>
  compare_pairs?: [string, string][]
  compare_sources?: string[]
  evidence?: string
}

type RuleFile = {
  terms?: string[]
  preferred_terms?: Record<string, { forbidden?: string[] }>
  rules: YamlRule[]
}

export type RuleEvaluator = (document: ParsedDocument) => ReviewIssue[]

const severityMap: Record<string, ReviewSeverity> = {
  high: "高",
  medium: "中",
  low: "低",
  高: "高",
  中: "中",
  低: "低",
}

export async function loadRulesFromYaml(rulePaths: string[]): Promise<RuleEvaluator[]> {
  return loadRulesFromYamlContents(
    await Promise.all(
      rulePaths.map(async (rulePath) => ({
        rulePath,
        content: await readFile(rulePath, "utf8").catch((error) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT")
            throw new RuleExecutionError(`规则文件不存在: ${rulePath}`)
          throw error
        }),
      })),
    ),
  )
}

export function loadRulesFromYamlContents(sources: Array<{ rulePath: string; content: string }>): RuleEvaluator[] {
  return sources.flatMap((source) => {
    const parsed = parseRuleFile(source.content, source.rulePath)
    return parsed.rules.map((rule) => createEvaluator(rule, parsed, source.rulePath))
  })
}

export function executeRules(evaluators: RuleEvaluator[], document: ParsedDocument): ReviewIssue[] {
  return evaluators.flatMap((evaluator) => {
    try {
      return evaluator(document)
    } catch (error) {
      throw new RuleExecutionError("规则执行失败", { cause: error })
    }
  })
}

export function parseRuleFile(content: string, rulePath = "<inline>"): RuleFile {
  try {
    const parsed = parse(content) as unknown
    if (!parsed || typeof parsed !== "object") {
      throw new Error("YAML 根节点必须是对象")
    }
    const file = parsed as Partial<RuleFile>
    if (!Array.isArray(file.rules)) {
      throw new Error("YAML 必须包含且只能包含一个 rules 数组根节点")
    }
    return {
      terms: Array.isArray(file.terms) ? file.terms : [],
      preferred_terms: isRecord(file.preferred_terms) ? file.preferred_terms : {},
      rules: file.rules.map((rule, index) => normalizeRule(rule, index, rulePath)),
    }
  } catch (error) {
    throw new RuleExecutionError(`规则文件解析失败: ${rulePath}`, { cause: error })
  }
}

function normalizeRule(rule: unknown, index: number, rulePath: string): YamlRule {
  if (!rule || typeof rule !== "object") {
    throw new Error(`${rulePath} 第 ${index + 1} 条规则不是对象`)
  }
  const item = rule as Partial<YamlRule>
  if (!item.id) throw new Error(`${rulePath} 第 ${index + 1} 条规则缺少 id`)
  return {
    ...item,
    id: String(item.id),
    category: item.category ?? inferCategory(String(item.id)),
    severity: item.severity ?? "medium",
  }
}

function createEvaluator(rule: YamlRule, file: RuleFile, rulePath: string): RuleEvaluator {
  if (rule.category === "well_basic_info") return (document) => evaluateWellBasicInfo(rule, document)
  if (rule.category === "terminology") return (document) => evaluateTerminology(rule, file, document)
  if (rule.category === "stratigraphy") return (document) => evaluateStratigraphy(rule, document)
  if (rule.category === "oil_gas_show") return (document) => evaluateOilGasShow(rule, document)
  if (rule.category === "consistency") return (document) => evaluateConsistency(rule, document)
  return (document) => evaluateGenericRule(rule, document, rulePath)
}

function evaluateWellBasicInfo(rule: YamlRule, document: ParsedDocument): ReviewIssue[] {
  const requiredFields = rule.required_fields ?? rule.fields ?? []
  const missingFields = requiredFields.filter((field) => !hasField(document, field, rule.field_aliases?.[field] ?? []))
  const issues = missingFields.map((field, index) =>
    issue(rule, index, {
      type: "missing_required_field",
      location: "井基础信息",
      originalText: "",
      issue: `缺少关键字段“${field}”。`,
      suggestion: `补充“${field}”信息，并与地质设计、完井卡片、录井综合记录保持一致。`,
      basis: `${rule.name ?? rule.id}: required_fields`,
      needHumanConfirm: true,
    }),
  )

  if (rule.id === "WELL-002") {
    const wellNames = extractWellNames(document)
    if (wellNames.length > 1) {
      issues.push(
        issue(rule, issues.length, {
          type: "multiple_well_names",
          location: "全文",
          originalText: wellNames.join("、"),
          issue: "报告中出现多个不同井号，可能存在复制粘贴或引用错误。",
          suggestion: "核对封面、正文、表格和附件中的井号，统一为本井井号。",
          basis: `${rule.name ?? rule.id}: 井号一致性`,
          needHumanConfirm: true,
        }),
      )
    }
  }

  return issues
}

function evaluateTerminology(rule: YamlRule, file: RuleFile, document: ParsedDocument): ReviewIssue[] {
  return Object.entries(file.preferred_terms ?? {}).flatMap(([preferred, config], entryIndex) =>
    (config.forbidden ?? [])
      .filter((term) => document.rawText.includes(term))
      .map((term, index) =>
        issue(rule, entryIndex * 100 + index, {
          type: "forbidden_term",
          location: locateText(document, term),
          originalText: term,
          issue: `发现不规范术语“${term}”。`,
          suggestion: `建议统一改为规范术语“${preferred}”。`,
          basis: `${rule.name ?? rule.id}: preferred_terms.${preferred}.forbidden`,
          needHumanConfirm: false,
        }),
      ),
  )
}

function evaluateStratigraphy(rule: YamlRule, document: ParsedDocument): ReviewIssue[] {
  if (rule.id !== "STRAT-001") return evaluateGenericRule(rule, document, "stratigraphy")
  const intervals = extractDepthIntervals(document)
  const invalid = intervals.filter((interval) => interval.top >= interval.bottom)
  const sorted = [...intervals].sort((a, b) => a.top - b.top || a.bottom - b.bottom)
  const overlaps = sorted.flatMap((current, index) => {
    const next = sorted[index + 1]
    if (!next || next.top >= current.bottom) return []
    return [{ current, next }]
  })

  return [
    ...invalid.map((interval, index) =>
      issue(rule, index, {
        type: "invalid_stratigraphy_depth",
        location: interval.location,
        originalText: interval.text,
        issue: "地层井段顶深不小于底深。",
        suggestion: "核对该层顶深、底深数据，确保顶深小于底深。",
        basis: `${rule.name ?? rule.id}: 顶深小于底深`,
        needHumanConfirm: true,
      }),
    ),
    ...overlaps.map((overlap, index) =>
      issue(rule, invalid.length + index, {
        type: "overlap_stratigraphy_interval",
        location: `${overlap.current.location}; ${overlap.next.location}`,
        originalText: `${overlap.current.text} / ${overlap.next.text}`,
        issue: "地层井段存在重叠。",
        suggestion: "核对相邻地层分层界线，消除重叠井段或说明重复划分依据。",
        basis: `${rule.name ?? rule.id}: 无重叠井段`,
        needHumanConfirm: true,
      }),
    ),
  ]
}

function evaluateOilGasShow(rule: YamlRule, document: ParsedDocument): ReviewIssue[] {
  const keywords = rule.required_keywords ?? ["油气显示", "显示井段", "荧光", "气测"]
  const missingKeywords = keywords.filter((keyword) => !document.rawText.includes(keyword))
  if (missingKeywords.length === 0) return []
  return [
    issue(rule, 0, {
      type: "missing_oil_gas_show_detail",
      location: "油气显示",
      originalText: "",
      issue: `油气显示描述缺少关键内容：${missingKeywords.join("、")}。`,
      suggestion: "补充显示井段、岩性、荧光、含油性、气测异常和综合解释结论。",
      basis: `${rule.name ?? rule.id}: required_keywords`,
      needHumanConfirm: true,
    }),
  ]
}

function evaluateConsistency(rule: YamlRule, document: ParsedDocument): ReviewIssue[] {
  const pairIssues = (rule.compare_pairs ?? []).flatMap(([left, right], index) => {
    const hasLeft = document.rawText.includes(left)
    const hasRight = document.rawText.includes(right)
    if (!hasLeft || !hasRight) return []
    return [
      issue(rule, index, {
        type: "keyword_consistency",
        location: "全文",
        originalText: hasLeft ? left : right,
        issue: `“${left}”与“${right}”引用不一致。`,
        suggestion: "核对正文、附表和结论中的对应字段或资料来源，确保前后引用一致。",
        basis: `${rule.name ?? rule.id}: compare_pairs`,
        needHumanConfirm: true,
      }),
    ]
  })

  const unitIssue = rule.id === "CONS-002" ? checkDepthUnitMix(rule, document) : []
  return [...pairIssues, ...unitIssue]
}

/** 描述性短語关键词，出现这些词的 check 是规则描述而非报告应包含的字面文本 */
const DESCRIPTIVE_MARKERS = ["描述", "合理", "支持", "依据", "应", "需要", "要求", "建议", "包含", "齐全", "准确", "完整"]

function isDescriptiveCheck(check: string): boolean {
  return DESCRIPTIVE_MARKERS.some((marker) => check.includes(marker))
}

function evaluateGenericRule(rule: YamlRule, document: ParsedDocument, rulePath: string): ReviewIssue[] {
  const checks = rule.checks ?? rule.required_parts ?? []
  return checks
    .filter((check) => !isDescriptiveCheck(check) && !document.rawText.includes(check))
    .map((check, index) =>
      issue(rule, index, {
        type: `${rule.category ?? inferCategory(rule.id)}_check`,
        location: "全文",
        originalText: "",
        issue: `未识别到"${check}"相关内容。`,
        suggestion: `请核对并补充"${check}"相关内容。`,
        basis: `${rule.name ?? rule.id}: ${rulePath}`,
        needHumanConfirm: true,
      }),
    )
}

function checkDepthUnitMix(rule: YamlRule, document: ParsedDocument): ReviewIssue[] {
  const units = Array.from(document.rawText.matchAll(/\d+(?:\.\d+)?\s*(m|米|M)(?=[\s,，。；;、\n]|$)/g)).map((match) => match[1])
  const uniqueUnits = Array.from(new Set(units))
  if (uniqueUnits.length <= 1) return []
  return [
    issue(rule, 50, {
      type: "mixed_depth_units",
      location: "全文",
      originalText: uniqueUnits.join("、"),
      issue: "报告中存在 m、米、M 等深度单位混用。",
      suggestion: "统一深度单位写法，建议全文采用 m。",
      basis: `${rule.name ?? rule.id}: 深度单位统一`,
      needHumanConfirm: false,
    }),
  ]
}

function hasField(document: ParsedDocument, field: string, aliases: string[]) {
  const names = [field, ...aliases]
  return names.some((name) => document.rawText.includes(name) || document.tables.some((table) => table.rows.some((row) => row.some((cell) => cell.includes(name)))))
}

const nonWellNameWords = new Set(["定向井", "水平井", "直井", "斜井", "评价井", "探井", "开发井", "丛式井", "调整井", "生产井", "钻井", "完井", "录井", "测井", "固井", "试油井", "本井", "该井", "邻井", "老井", "新井", "主井", "分支井", "导眼井", "入窗井"])

export function extractWellNames(document: ParsedDocument): string[] {
  const tableNames = document.tables.flatMap((table) =>
    table.rows.flatMap((row) =>
      row.flatMap((cell, index) => {
        if (!/(井号|井名|井名称)/.test(cell)) return []
        return row
          .slice(index + 1, index + 3)
          .flatMap((value) => Array.from(value.matchAll(/[\u4e00-\u9fa5A-Za-z0-9-]{1,24}?井/g)).map((match) => match[0]))
      }),
    ),
  )
  const labelNames = Array.from(document.rawText.matchAll(/(?:井号|井名|井名称)\s*[:：]\s*([\u4e00-\u9fa5A-Za-z0-9-]{1,24}?井)/g)).map((match) => match[1])
  const fileNames = Array.from(document.fileName.matchAll(/[\u4e00-\u9fa5A-Za-z0-9-]{1,24}?井/g)).map((match) => match[0])
  const broadNames = Array.from(document.rawText.matchAll(/[\u4e00-\u9fa5A-Za-z0-9-]{1,24}?井/g))
    .map((match) => match[0])
    .filter((name) => /\d/.test(name))
  return Array.from(new Set([...tableNames, ...labelNames, ...fileNames, ...broadNames].filter((name) => /\d/.test(name) && !nonWellNameWords.has(name))))
}

function extractDepthIntervals(document: ParsedDocument) {
  const lines = [
    ...document.paragraphs.map((paragraph) => ({ text: paragraph.text, location: paragraph.location ?? `P${paragraph.index}` })),
    ...document.tables.flatMap((table) =>
      table.rows.map((row, index) => ({ text: row.join(" "), location: `${table.location ?? `Table ${table.index}`} R${index + 1}` })),
    ),
  ]

  return lines
    .filter((line) => /地层|层位|[\u4e00-\u9fff]+(?:组|系|统|段|层)/.test(line.text) && !/油气|显示|气测|荧光/.test(line.text))
    .flatMap((line) =>
    Array.from(line.text.matchAll(/(\d+(?:\.\d+)?)\s*(m|米)?\s*(?:-|~|—|至|到)\s*(\d+(?:\.\d+)?)\s*(m|米)?/g))
      .filter((match) => Boolean(match[2] || match[4]))
      .map((match) => ({
        top: Number(match[1]),
        bottom: Number(match[3]),
        text: match[0],
        location: line.location,
      })),
  )
}

function locateText(document: ParsedDocument, text: string) {
  const paragraph = document.paragraphs.find((item) => item.text.includes(text))
  return paragraph?.location ?? "全文"
}

function issue(rule: YamlRule, index: number, input: Omit<ReviewIssue, "id" | "severity"> & { severity?: ReviewSeverity }): ReviewIssue {
  return {
    id: `${rule.id}-${String(index + 1).padStart(3, "0")}`,
    severity: input.severity ?? parseSeverity(rule.severity),
    ...input,
  }
}

function parseSeverity(severity?: string): ReviewSeverity {
  return severityMap[(severity ?? "medium").toLowerCase()] ?? "中"
}

function inferCategory(ruleID: string): RuleCategory {
  if (ruleID.startsWith("WELL")) return "well_basic_info"
  if (ruleID.startsWith("TERM")) return "terminology"
  if (ruleID.startsWith("STRAT")) return "stratigraphy"
  if (ruleID.startsWith("OGS")) return "oil_gas_show"
  if (ruleID.startsWith("CONS")) return "consistency"
  if (ruleID.startsWith("LITH")) return "lithology"
  if (ruleID.startsWith("GAS")) return "gas_logging"
  return "structure"
}

function isRecord(value: unknown): value is Record<string, { forbidden?: string[] }> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}
