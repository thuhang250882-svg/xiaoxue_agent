import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

export type EnterprisePolicy = {
  offline: boolean
  allowPublicProviders: boolean
  allowedExternalHosts: string[]
  allowedApplications: string[]
  allowedConnectors: string[]
  allowedSkillSources: string[]
  allowedPluginSources: string[]
  allowedProviders: string[]
  allowedModels: string[]
  allowedMcpServers: string[]
  allowedSkills: string[]
  allowedPlugins: string[]
  allowedArchiveModes: string[]
  projectRoots: string[]
  knowledgeRoots: string[]
  retentionDays: number
  dataResidency: "local" | "china" | "custom"
  updateChannel: "stable" | "beta" | "internal"
  updateURL?: string
}

const defaults: EnterprisePolicy = {
  // The packaged logging assistant is local-first. Loopback model endpoints
  // remain available while accidental uploads to public providers fail closed.
  offline: true,
  allowPublicProviders: true,
  allowedExternalHosts: [],
  allowedApplications: [],
  allowedConnectors: ["local-files"],
  // Users may install reviewed local Skills, but project and remote sources
  // remain blocked unless an administrator explicitly enables them.
  allowedSkillSources: ["bundled", "user"],
  allowedPluginSources: ["bundled"],
  allowedProviders: ["*"],
  allowedModels: ["*"],
  allowedMcpServers: ["*"],
  allowedSkills: ["*"],
  allowedPlugins: ["*"],
  allowedArchiveModes: ["*"],
  projectRoots: [],
  knowledgeRoots: [],
  retentionDays: 30,
  dataResidency: "local",
  updateChannel: defaultUpdateChannel(import.meta.env.XIAOXUE_UPDATE_CHANNEL),
}

export function defaultUpdateChannel(value: string | undefined): EnterprisePolicy["updateChannel"] {
  if (value === "internal" || value === "beta") return value
  return "stable"
}

export function enterprisePolicy() {
  const file = enterprisePolicyPath()
  if (!existsSync(file)) return defaults
  const value = (() => {
    try {
      return JSON.parse(readFileSync(file, "utf8")) as unknown
    } catch {
      return undefined
    }
  })()
  if (!isRecord(value)) {
    return {
      ...defaults,
      offline: true,
      allowPublicProviders: false,
      allowedExternalHosts: ["__invalid_managed_policy__"],
      allowedApplications: ["__invalid_managed_policy__"],
      allowedConnectors: [],
    }
  }
  return {
    offline: boolean(value, "offline", defaults.offline),
    allowPublicProviders: boolean(value, "allowPublicProviders", defaults.allowPublicProviders),
    allowedExternalHosts: strings(value, "allowedExternalHosts"),
    allowedApplications: strings(value, "allowedApplications"),
    allowedConnectors: strings(value, "allowedConnectors", defaults.allowedConnectors),
    allowedSkillSources: strings(value, "allowedSkillSources", defaults.allowedSkillSources),
    allowedPluginSources: strings(value, "allowedPluginSources", defaults.allowedPluginSources),
    allowedProviders: strings(value, "allowedProviders", defaults.allowedProviders),
    allowedModels: strings(value, "allowedModels", defaults.allowedModels),
    allowedMcpServers: strings(value, "allowedMcpServers", defaults.allowedMcpServers),
    allowedSkills: strings(value, "allowedSkills", defaults.allowedSkills),
    allowedPlugins: strings(value, "allowedPlugins", defaults.allowedPlugins),
    allowedArchiveModes: strings(value, "allowedArchiveModes", defaults.allowedArchiveModes),
    projectRoots: strings(value, "projectRoots"),
    knowledgeRoots: strings(value, "knowledgeRoots"),
    retentionDays: integer(value, "retentionDays", defaults.retentionDays),
    dataResidency: residency(value),
    updateChannel: updateChannel(value),
    updateURL: string(value, "updateURL"),
  } satisfies EnterprisePolicy
}

export function developmentEnterprisePolicy() {
  return { ...enterprisePolicy(), offline: false }
}

export function enterprisePolicyPath() {
  const configured = process.env.XIAOXUE_ENTERPRISE_POLICY_PATH?.trim()
  if (configured && path.isAbsolute(configured)) return configured
  if (process.platform === "win32") {
    return path.join(process.env.ProgramData || "C:\\ProgramData", "opencode", "enterprise-policy.json")
  }
  if (process.platform === "darwin") return "/Library/Application Support/opencode/enterprise-policy.json"
  return "/etc/opencode/enterprise-policy.json"
}

function strings(value: Record<string, unknown>, key: string, fallback: string[] = []) {
  const item = value[key]
  if (!Array.isArray(item)) return fallback
  return item.filter((entry): entry is string => typeof entry === "string")
}

function boolean(value: Record<string, unknown>, key: string, fallback: boolean) {
  const item = value[key]
  return typeof item === "boolean" ? item : fallback
}

function integer(value: Record<string, unknown>, key: string, fallback: number) {
  const item = value[key]
  return typeof item === "number" && Number.isInteger(item) && item > 0 && item <= 3_650 ? item : fallback
}

function residency(value: Record<string, unknown>): EnterprisePolicy["dataResidency"] {
  const item = value.dataResidency
  return item === "china" || item === "custom" || item === "local" ? item : defaults.dataResidency
}

function updateChannel(value: Record<string, unknown>): EnterprisePolicy["updateChannel"] {
  const item = value.updateChannel
  return item === "beta" || item === "internal" || item === "stable" ? item : defaults.updateChannel
}

function string(value: Record<string, unknown>, key: string) {
  const item = value[key]
  return typeof item === "string" && item.trim() ? item.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
