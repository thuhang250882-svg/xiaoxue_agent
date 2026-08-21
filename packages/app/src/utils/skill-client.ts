// Client for the server-side Skill CRUD endpoints exposed by the experimental
// HttpApi (`PATCH /skill/:name`, `DELETE /skill/:name`). Centralizes the auth
// and fetch plumbing so the renderer doesn't have to repeat it for every
// component that edits skills.

import { authTokenFromCredentials } from "@/utils/server"

export type SkillSource = "bundled" | "user" | "project" | "remote" | "unknown"

export type SkillCapabilities = {
  editable: boolean
  removable: boolean
  enableable: boolean
}

export type SkillDiagnostic = {
  level: "info" | "warning" | "error"
  code: string
  message: string
}

export type SkillHealth = "healthy" | "warning" | "error"

export type SkillImportRisk = {
  level: "info" | "warning" | "error"
  code: string
  message: string
  path?: string
}

export type SkillImportPreview = {
  token: string
  name: string
  description?: string
  format: "markdown" | "directory" | "skill-archive"
  sha256: string
  fileCount: number
  totalBytes: number
  expiresAt: number
  risks: SkillImportRisk[]
  conflicts: string[]
  canInstall: boolean
}

export type SkillConflict = {
  skill: string
  winner: SkillCandidate
  candidates: SkillCandidate[]
  conflictsWith: string[]
  severity: "info" | "warning" | "error"
  override: boolean
  realConflict: boolean
  reason: string
}

export type SkillCandidate = {
  location: string
  source: SkillSource
  priority: number
  selected: boolean
}

export type SkillInfo = {
  name: string
  description?: string
  location: string
  content: string
  source: SkillSource
  capabilities: SkillCapabilities
  enabled: boolean
  health: SkillHealth
  diagnostics: SkillDiagnostic[]
}

export type SkillPatch = {
  name?: string
  description?: string
}

export type SkillClientError = Error & { code?: string; status?: number; details?: Record<string, unknown> }

export type SkillClient = ReturnType<typeof createSkillClient>

const readonlyCapabilities: SkillCapabilities = { editable: false, removable: false, enableable: false }

export function normalizeSkillInfo(input: unknown): SkillInfo {
  const record = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {}
  const source: SkillSource =
    record.source === "bundled" || record.source === "user" || record.source === "project" || record.source === "remote"
      ? record.source
      : "unknown"
  const rawCapabilities =
    typeof record.capabilities === "object" && record.capabilities !== null
      ? (record.capabilities as Record<string, unknown>)
      : undefined
  const capabilities = rawCapabilities
    ? {
        editable: rawCapabilities.editable === true,
        removable: rawCapabilities.removable === true,
        enableable: rawCapabilities.enableable === true,
      }
    : readonlyCapabilities
  const diagnostics: SkillDiagnostic[] = Array.isArray(record.diagnostics)
    ? record.diagnostics.flatMap((item) => {
        if (typeof item !== "object" || item === null) return []
        const diagnostic = item as Record<string, unknown>
        if (
          diagnostic.level !== "info" &&
          diagnostic.level !== "warning" &&
          diagnostic.level !== "error"
        ) {
          return []
        }
        if (typeof diagnostic.code !== "string" || typeof diagnostic.message !== "string") return []
        return [{ level: diagnostic.level, code: diagnostic.code, message: diagnostic.message } satisfies SkillDiagnostic]
      })
    : []
  const health = record.health === "healthy" || record.health === "warning" || record.health === "error"
    ? record.health
    : "warning"
  const normalizedDiagnostics = diagnostics.length > 0
    ? diagnostics
    : [{
        level: "warning" as const,
        code: "SKILL_LEGACY_RECORD",
        message: "Skill metadata is incomplete; destructive actions are disabled until the server refreshes it.",
      }]

  return {
    ...record,
    name: typeof record.name === "string" ? record.name : "",
    description: typeof record.description === "string" ? record.description : undefined,
    location: typeof record.location === "string" ? record.location : "",
    content: typeof record.content === "string" ? record.content : "",
    source,
    capabilities,
    enabled: typeof record.enabled === "boolean" ? record.enabled : false,
    health,
    diagnostics: normalizedDiagnostics,
  }
}

export function normalizeSkillInfos(input: unknown): SkillInfo[] {
  if (!Array.isArray(input)) return []
  return input.map(normalizeSkillInfo).filter((skill) => skill.name.length > 0)
}

export function createSkillClient(baseUrl: string, auth?: { username?: string; password?: string }) {
  const base = baseUrl.replace(/\/+$/, "")
  const authorization = auth?.password
    ? `Basic ${authTokenFromCredentials({ username: auth.username, password: auth.password })}`
    : undefined

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(base + path, {
      headers: {
        "content-type": "application/json",
        ...(authorization ? { authorization } : {}),
      },
      ...init,
    })
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok || body.ok === false) {
      const error = new Error(
        typeof body.message === "string" && body.message ? body.message : `Request failed (${response.status})`,
      ) as SkillClientError
      error.code =
        typeof body.code === "string" ? body.code : typeof body.error === "string" ? body.error : undefined
      error.status = response.status
      error.details = typeof body.details === "object" && body.details !== null ? (body.details as Record<string, unknown>) : undefined
      throw error
    }
    return body as T
  }

  const item = (name: string) => `/skill/${encodeURIComponent(name)}`
  const itemAction = (name: string, action: "enable" | "disable") =>
    `/skill/${encodeURIComponent(name)}/${action}`

  return {
    async update(name: string, patch: SkillPatch): Promise<SkillInfo> {
      const body = await request<unknown>(item(name), {
        method: "PATCH",
        body: JSON.stringify(patch),
      })
      return normalizeSkillInfo(body)
    },
    async remove(name: string): Promise<void> {
      await request<unknown>(item(name), { method: "DELETE" })
    },
    async create(input: { name: string; description?: string; content?: string }): Promise<SkillInfo> {
      return request<unknown>("/skill", {
        method: "POST",
        body: JSON.stringify(input),
      }).then(normalizeSkillInfo)
    },
    async enable(name: string): Promise<SkillInfo> {
      return request<unknown>(itemAction(name, "enable"), { method: "POST" }).then(normalizeSkillInfo)
    },
    async disable(name: string): Promise<SkillInfo> {
      return request<unknown>(itemAction(name, "disable"), { method: "POST" }).then(normalizeSkillInfo)
    },
    async validate(name: string): Promise<SkillDiagnostic[]> {
      return request<SkillDiagnostic[]>(`/skill/${encodeURIComponent(name)}/validate`)
    },
    async health(name: string): Promise<SkillHealth> {
      return request<SkillHealth>(`/skill/${encodeURIComponent(name)}/health`)
    },
    async previewImport(source: string): Promise<SkillImportPreview> {
      return request<SkillImportPreview>("/skill/import/preview", {
        method: "POST",
        body: JSON.stringify({ source }),
      })
    },
    async import(token: string): Promise<SkillInfo> {
      return request<unknown>("/skill/import", {
        method: "POST",
        body: JSON.stringify({ token }),
      }).then(normalizeSkillInfo)
    },
    async conflicts(): Promise<SkillConflict[]> {
      return request<SkillConflict[]>("/skill/conflicts")
    },
  }
}
