export function matchesGateAHead(actual: string, expected: string) {
  return actual === expected
}

export function configuredApiKeyName(env: NodeJS.ProcessEnv) {
  return ["XIAOXUE_API_KEY", "XIAOXUE_DEFAULT_API_KEY"].find((name) => env[name]?.trim())
}
