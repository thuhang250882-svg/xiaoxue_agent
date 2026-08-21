export * as XiaoxueEnterprisePolicy from "./enterprise-policy"

import { existsSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

type Resource = "provider" | "model" | "mcp" | "skill" | "plugin" | "connector" | "archive"

type Policy = {
  managed: boolean
  valid: boolean
  offline: boolean
  allowedExternalHosts: string[]
  allowedSkillSources: string[]
  allowedPluginSources: string[]
  allowedProviders: string[]
  allowedModels: string[]
  allowedMcpServers: string[]
  allowedSkills: string[]
  allowedPlugins: string[]
  allowedConnectors: string[]
  allowedArchiveModes: string[]
}

const unrestricted: Policy = {
  managed: false,
  valid: true,
  offline: false,
  allowedExternalHosts: [],
  allowedSkillSources: ["*"],
  allowedPluginSources: ["*"],
  allowedProviders: ["*"],
  allowedModels: ["*"],
  allowedMcpServers: ["*"],
  allowedSkills: ["*"],
  allowedPlugins: ["*"],
  allowedConnectors: ["*"],
  allowedArchiveModes: ["*"],
}

let cached: { source: string; modified: number; policy: Policy } | undefined

export function get() {
  const inline = process.env.XIAOXUE_ENTERPRISE_POLICY_CONTENT?.trim()
  if (inline) return decode(inline)
  const file = process.env.XIAOXUE_ENTERPRISE_POLICY_PATH?.trim()
  if (!file || !path.isAbsolute(file) || !existsSync(file)) return unrestricted
  const modified = statSync(file).mtimeMs
  if (cached?.source === file && cached.modified === modified) return cached.policy
  const policy = decode(readFileSync(file, "utf8"))
  cached = { source: file, modified, policy }
  return policy
}

export function allows(resource: Resource, value: string) {
  const policy = get()
  if (!policy.managed) return true
  if (!policy.valid) return false
  return patterns(policy[listKey(resource)], value)
}

export function require(resource: Resource, value: string) {
  if (allows(resource, value)) return
  throw new Error(`企业托管策略禁止使用 ${resource}: ${value}`)
}

export function allowsSource(kind: "skill" | "plugin", source: string) {
  const policy = get()
  if (!policy.managed) return true
  if (!policy.valid) return false
  return patterns(kind === "skill" ? policy.allowedSkillSources : policy.allowedPluginSources, source)
}

export function allowsNetwork(value?: string) {
  const policy = get()
  if (!policy.managed) return true
  if (!policy.valid || !value) return false
  const url = (() => {
    try {
      return new URL(value)
    } catch {
      return undefined
    }
  })()
  if (!url || !["http:", "https:"].includes(url.protocol)) return false
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (["127.0.0.1", "localhost", "::1"].includes(hostname)) return true
  if (isPrivateAddress(hostname)) return true
  if (policy.allowedExternalHosts.some((host) => hostnameMatches(hostname, host))) return true
  if (policy.offline) return false
  return policy.allowedExternalHosts.length === 0
}

function isPrivateAddress(hostname: string) {
  const ipv4 = hostname.split(".").map(Number)
  if (ipv4.length === 4 && ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    if (ipv4[0] === 10 || ipv4[0] === 127) return true
    if (ipv4[0] === 169 && ipv4[1] === 254) return true
    if (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) return true
    return ipv4[0] === 192 && ipv4[1] === 168
  }
  if (!hostname.includes(":")) return false
  const normalized = hostname.toLowerCase()
  return (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  )
}

function hostnameMatches(hostname: string, pattern: string) {
  const normalized = pattern.trim().toLowerCase()
  if (!normalized) return false
  if (normalized.startsWith("*.")) {
    const suffix = normalized.slice(1)
    return hostname.endsWith(suffix) && hostname.length > suffix.length
  }
  return hostname === normalized || hostname.endsWith(`.${normalized}`)
}

function decode(content: string): Policy {
  const value = (() => {
    try {
      return JSON.parse(content) as unknown
    } catch {
      return undefined
    }
  })()
  if (!isRecord(value)) {
    return {
      ...unrestricted,
      managed: true,
      valid: false,
      offline: true,
      allowedExternalHosts: [],
      allowedSkillSources: [],
      allowedPluginSources: [],
      allowedProviders: [],
      allowedModels: [],
      allowedMcpServers: [],
      allowedSkills: [],
      allowedPlugins: [],
      allowedConnectors: [],
      allowedArchiveModes: [],
    }
  }
  return {
    managed: true,
    valid: true,
    offline: boolean(value, "offline"),
    allowedExternalHosts: strings(value, "allowedExternalHosts", []),
    allowedSkillSources: strings(value, "allowedSkillSources", ["bundled", "user"]),
    allowedPluginSources: strings(value, "allowedPluginSources", ["bundled"]),
    allowedProviders: strings(value, "allowedProviders"),
    allowedModels: strings(value, "allowedModels"),
    allowedMcpServers: strings(value, "allowedMcpServers"),
    allowedSkills: strings(value, "allowedSkills"),
    allowedPlugins: strings(value, "allowedPlugins"),
    allowedConnectors: strings(value, "allowedConnectors"),
    allowedArchiveModes: strings(value, "allowedArchiveModes"),
  }
}

function listKey(
  resource: Resource,
):
  | "allowedProviders"
  | "allowedModels"
  | "allowedMcpServers"
  | "allowedSkills"
  | "allowedPlugins"
  | "allowedConnectors"
  | "allowedArchiveModes" {
  if (resource === "provider") return "allowedProviders"
  if (resource === "model") return "allowedModels"
  if (resource === "mcp") return "allowedMcpServers"
  if (resource === "skill") return "allowedSkills"
  if (resource === "plugin") return "allowedPlugins"
  if (resource === "connector") return "allowedConnectors"
  return "allowedArchiveModes"
}

function patterns(list: string[], value: string) {
  return list.some((pattern) => {
    if (pattern === "*") return true
    if (!pattern.includes("*")) return pattern === value
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*")
    return new RegExp(`^${escaped}$`, "i").test(value)
  })
}

function strings(value: Record<string, unknown>, key: string, fallback = ["*"]) {
  const item = value[key]
  if (!Array.isArray(item)) return fallback
  return item.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
}

function boolean(value: Record<string, unknown>, key: string) {
  return value[key] === true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
