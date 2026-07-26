import { homedir } from "node:os"

export function redactLogText(value: string) {
  return value
    .replaceAll(homedir(), "<USER_HOME>")
    .replace(/\b(sk-[a-z0-9_-]{12,})\b/gi, "<REDACTED_API_KEY>")
    .replace(
      /(authorization\s*[:=]\s*)(["']?)(?:(?:bearer|basic)\s+)?[^"',}\]\r\n]+/gi,
      "$1$2<REDACTED>",
    )
    .replace(
      /((?:api[-_]?key|access[-_]?token|refresh[-_]?token|password|secret)\s*[:=]\s*)(["']?)[^"',\s}\]]+/gi,
      "$1$2<REDACTED>",
    )
    .replace(/\b(Bearer|Basic)\s+[a-z0-9._~+/=-]+/gi, "$1 <REDACTED>")
}

export function redactLogValue(value: unknown, key?: string): unknown {
  if (key && /authorization|api.?key|access.?token|refresh.?token|password|secret/i.test(key)) {
    return "<REDACTED>"
  }
  if (typeof value === "string") return redactLogText(value)
  if (Array.isArray(value)) return value.map((item) => redactLogValue(item))
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redactLogValue(item, name)]))
}
