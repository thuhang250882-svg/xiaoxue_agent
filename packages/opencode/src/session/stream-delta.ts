export function normalizeStreamDelta(current: string, incoming: string, cumulative: boolean) {
  if (!cumulative) return incoming
  if (!current || !incoming) return incoming

  // Some self-hosted OpenAI-compatible servers label the full text-so-far as
  // a delta. Append only the unseen suffix instead of duplicating every prefix.
  if (incoming.length > current.length && incoming.startsWith(current)) return incoming.slice(current.length)

  // A cumulative server can replay the full text-so-far without adding a new
  // token. Only suppress an exact whole-response replay; repeated sentences
  // inside a normal delta stream remain untouched.
  if (incoming === current) return ""
  return incoming
}

export function usesCumulativeStream(input: { endpoint?: string; configured?: boolean }) {
  if (input.configured !== undefined) return input.configured
  if (!input.endpoint) return false
  const url = (() => {
    try {
      return new URL(input.endpoint)
    } catch {
      return undefined
    }
  })()
  if (!url) return false
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (["localhost", "127.0.0.1", "::1"].includes(hostname)) return true
  if (hostname.includes(":")) return hostname.startsWith("fc") || hostname.startsWith("fd")
  const ipv4 = hostname.split(".").map(Number)
  if (ipv4.length !== 4 || !ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) return false
  return (
    ipv4[0] === 10 ||
    (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) ||
    (ipv4[0] === 192 && ipv4[1] === 168)
  )
}
