import type { ParsedDocument } from "../types"

export type WellBasicInfo = {
  wellName?: string
  wellType?: string
  wellShape?: string
  designDepth?: string
  completedDepth?: string
  completedFormation?: string
  spudDate?: string
  completionDate?: string
  drillingCompany?: string
  loggingCompany?: string
  geographicLocation?: string
  structuralLocation?: string
}

type ExtractionPattern = {
  field: keyof WellBasicInfo
  patterns: RegExp[]
  aliases?: string[]
}

const EXTRACTION_PATTERNS: ExtractionPattern[] = [
  {
    field: "wellName",
    patterns: [
      /井\s*号[：:]\s*([\u4e00-\u9fa5A-Za-z0-9-]+井)/,
      /([\u4e00-\u9fa5A-Za-z0-9-]+井)\s*(?:地质|录井|完井)/,
    ],
    aliases: ["井名", "井名称"],
  },
  {
    field: "wellType",
    patterns: [
      /井\s*别[：:]\s*([\u4e00-\u9fa5]+)/,
      /井\s*型[：:]\s*([\u4e00-\u9fa5]+)/,
    ],
    aliases: ["井类别"],
  },
  {
    field: "wellShape",
    patterns: [
      /井\s*型[：:]\s*(直井|定向井|水平井|丛式井|多底井)/,
    ],
    aliases: [],
  },
  {
    field: "designDepth",
    patterns: [
      /设计井深[：:]\s*(\d+(?:\.\d+)?)\s*(m|米)/,
      /设计深度[：:]\s*(\d+(?:\.\d+)?)\s*(m|米)/,
    ],
    aliases: ["设计深"],
  },
  {
    field: "completedDepth",
    patterns: [
      /完钻井深[：:]\s*(\d+(?:\.\d+)?)\s*(m|米)/,
      /完钻深度[：:]\s*(\d+(?:\.\d+)?)\s*(m|米)/,
      /完井井深[：:]\s*(\d+(?:\.\d+)?)\s*(m|米)/,
    ],
    aliases: ["完钻深", "完井深"],
  },
  {
    field: "completedFormation",
    patterns: [
      /完钻层位[：:]\s*([\u4e00-\u9fa5]+)/,
      /完井层位[：:]\s*([\u4e00-\u9fa5]+)/,
    ],
    aliases: ["完钻层", "完井层"],
  },
  {
    field: "spudDate",
    patterns: [
      /开钻日期[：:]\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/,
      /开钻时间[：:]\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/,
    ],
    aliases: ["开钻"],
  },
  {
    field: "completionDate",
    patterns: [
      /完钻日期[：:]\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/,
      /完井日期[：:]\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/,
      /完钻时间[：:]\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/,
    ],
    aliases: ["完钻日", "完井日"],
  },
  {
    field: "drillingCompany",
    patterns: [
      /施工单位[：:]\s*([\u4e00-\u9fa5]+)/,
      /钻井单位[：:]\s*([\u4e00-\u9fa5]+)/,
      /钻井公司[：:]\s*([\u4e00-\u9fa5]+)/,
    ],
    aliases: ["施工方", "钻井方"],
  },
  {
    field: "loggingCompany",
    patterns: [
      /录井单位[：:]\s*([\u4e00-\u9fa5]+)/,
      /录井公司[：:]\s*([\u4e00-\u9fa5]+)/,
      /录井施工单位[：:]\s*([\u4e00-\u9fa5]+)/,
    ],
    aliases: ["录井方"],
  },
  {
    field: "geographicLocation",
    patterns: [
      /地理位置[：:]\s*([\u4e00-\u9fa5A-Za-z0-9]+)/,
      /地理[：:]\s*([\u4e00-\u9fa5A-Za-z0-9]+)/,
    ],
    aliases: ["地理位置"],
  },
  {
    field: "structuralLocation",
    patterns: [
      /构造位置[：:]\s*([\u4e00-\u9fa5A-Za-z0-9]+)/,
      /构造[：:]\s*([\u4e00-\u9fa5A-Za-z0-9]+)/,
    ],
    aliases: ["构造"],
  },
]

export function extractWellBasicInfo(document: ParsedDocument): WellBasicInfo {
  const text = document.rawText
  const info: WellBasicInfo = {}

  for (const extraction of EXTRACTION_PATTERNS) {
    for (const pattern of extraction.patterns) {
      const match = text.match(pattern)
      if (match) {
        info[extraction.field] = match[1] as string
        break
      }
    }
  }

  // Try to extract from tables if not found in text
  if (!info.wellName || !info.completedDepth) {
    extractFromTables(document, info)
  }

  return info
}

function extractFromTables(document: ParsedDocument, info: WellBasicInfo): void {
  for (const table of document.tables) {
    for (const row of table.rows) {
      for (let i = 0; i < row.length - 1; i++) {
        const cell = row[i]
        const value = row[i + 1]

        if (!cell || !value) continue

        // Check for well name
        if (cell.includes("井号") && !info.wellName) {
          const wellMatch = value.match(/([\u4e00-\u9fa5A-Za-z0-9-]+井)/)
          if (wellMatch) {
            info.wellName = wellMatch[1]
          }
        }

        // Check for completed depth
        if ((cell.includes("完钻井深") || cell.includes("完钻深度")) && !info.completedDepth) {
          const depthMatch = value.match(/(\d+(?:\.\d+)?)/)
          if (depthMatch) {
            info.completedDepth = depthMatch[1]
          }
        }

        // Check for design depth
        if ((cell.includes("设计井深") || cell.includes("设计深度")) && !info.designDepth) {
          const depthMatch = value.match(/(\d+(?:\.\d+)?)/)
          if (depthMatch) {
            info.designDepth = depthMatch[1]
          }
        }
      }
    }
  }
}

export function formatWellInfo(info: WellBasicInfo): string {
  const parts: string[] = []

  if (info.wellName) parts.push(`井号：${info.wellName}`)
  if (info.wellType) parts.push(`井别：${info.wellType}`)
  if (info.wellShape) parts.push(`井型：${info.wellShape}`)
  if (info.designDepth) parts.push(`设计井深：${info.designDepth}m`)
  if (info.completedDepth) parts.push(`完钻井深：${info.completedDepth}m`)
  if (info.completedFormation) parts.push(`完钻层位：${info.completedFormation}`)
  if (info.spudDate) parts.push(`开钻日期：${info.spudDate}`)
  if (info.completionDate) parts.push(`完钻日期：${info.completionDate}`)
  if (info.drillingCompany) parts.push(`施工单位：${info.drillingCompany}`)
  if (info.loggingCompany) parts.push(`录井单位：${info.loggingCompany}`)
  if (info.geographicLocation) parts.push(`地理位置：${info.geographicLocation}`)
  if (info.structuralLocation) parts.push(`构造位置：${info.structuralLocation}`)

  return parts.join("\n")
}
