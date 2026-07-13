export type KnowledgeSourceCategory =
  | "standard"
  | "company_rule"
  | "template"
  | "excellent_report"
  | "expert_experience"

export type KnowledgeSource = {
  id: string
  title: string
  category: KnowledgeSourceCategory
  filePath: string
  section?: string
  page?: number
  excerpt?: string
}

export type KnowledgeSourceRef = {
  sourceId: string
  title: string
  category: KnowledgeSourceCategory
  section?: string
  page?: number
}

// Sources are populated only from real imported files. Do not add demonstration
// records whose paths do not exist: callers must be able to open every source.
export const REGISTERED_KNOWLEDGE_SOURCES: KnowledgeSource[] = []
export function getSourceById(id: string): KnowledgeSource | undefined {
  return REGISTERED_KNOWLEDGE_SOURCES.find((source) => source.id === id)
}

export function getSourcesByCategory(category: KnowledgeSourceCategory): KnowledgeSource[] {
  return REGISTERED_KNOWLEDGE_SOURCES.filter((source) => source.category === category)
}

export function formatSourceRef(source: KnowledgeSource): string {
  const parts = [source.title]
  if (source.section) parts.push(`第${source.section}节`)
  if (source.page) parts.push(`P${source.page}`)
  return parts.join(" - ")
}

export function createSourceRef(source: KnowledgeSource): KnowledgeSourceRef {
  return {
    sourceId: source.id,
    title: source.title,
    category: source.category,
    section: source.section,
    page: source.page,
  }
}
