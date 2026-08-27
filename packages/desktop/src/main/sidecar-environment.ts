export function applyOfflineSidecarPolicy(env: Record<string, string>, policy: { offline: boolean }) {
  if (policy.offline) env.OPENCODE_DISABLE_MODELS_FETCH = "1"
  return env
}
