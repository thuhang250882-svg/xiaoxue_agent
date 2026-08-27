import { readFile } from "node:fs/promises"
import path from "node:path"

import { isRecord } from "@/util/record"

export type SkillCatalogTier = "core" | "optional" | "platform" | "unavailable"

export type SkillCatalogEntry = {
  name: string
  description?: string
  tier: SkillCatalogTier
}

export async function readSkillCatalog(file = process.env.XIAOXUE_SKILL_CATALOG_PATH) {
  if (!file || !path.isAbsolute(file)) return []
  const value: unknown = await readFile(file, "utf8")
    .then(JSON.parse)
    .catch(() => undefined)
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.skills)) return []
  return value.skills.flatMap((item): SkillCatalogEntry[] => {
    if (!isRecord(item) || typeof item.name !== "string" || !isTier(item.tier)) return []
    return [{
      name: item.name,
      description: typeof item.description === "string" ? item.description : undefined,
      tier: item.tier,
    }]
  })
}

function isTier(value: unknown): value is SkillCatalogTier {
  return value === "core" || value === "optional" || value === "platform" || value === "unavailable"
}
