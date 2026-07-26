export function withBundledSkills(content: string | undefined, directory: string) {
  if (!content) return JSON.stringify({ skills: { paths: [directory] } })

  const config = parseConfig(content)
  if (!config) return content

  const skills = isRecord(config.skills) ? config.skills : {}
  const paths = Array.isArray(skills.paths) ? skills.paths.filter((item): item is string => typeof item === "string") : []
  if (paths.includes(directory)) return content

  return JSON.stringify({
    ...config,
    skills: {
      ...skills,
      paths: [directory, ...paths],
    },
  })
}

function parseConfig(content: string) {
  try {
    const value = JSON.parse(content) as unknown
    if (isRecord(value)) return value
  } catch {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
