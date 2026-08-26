// Client for the server-side model registry (global raw endpoints). The
// registry is the single source of truth for locally managed models; these
// helpers keep the fetch plumbing in one place.

import { authTokenFromCredentials } from "@/utils/server"

export type ManagedModel = {
  key: string
  providerId: string
  modelId: string
  displayName: string
  source: "builtin" | "discovered" | "custom"
  enabled: boolean
  hidden: boolean
  capabilities?: { reasoning?: boolean; vision?: boolean; tools?: boolean; streaming?: boolean }
  contextWindow?: number
  createdAt: number
  updatedAt: number
}

export type ModelReference = {
  kind: "agent" | "default"
  agent?: string
  file: string
}

export type RegistryList = {
  models: ManagedModel[]
  disabledBuiltin: string[]
  unresolved: { reference: string; locations: string[] }[]
}

export type RegistryError = Error & { code?: string }

export type ModelRegistryClient = ReturnType<typeof createModelRegistryClient>

export function createModelRegistryClient(baseUrl: string, auth?: { username?: string; password?: string }) {
  const base = baseUrl.replace(/\/+$/, "")
  const authorization = auth?.password
    ? `Basic ${authTokenFromCredentials({ username: auth.username, password: auth.password })}`
    : undefined

  async function request(path: string, init?: RequestInit) {
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
      ) as RegistryError
      error.code = typeof body.error === "string" ? body.error : undefined
      throw error
    }
    return body
  }

  const item = (key: string) => `/global/models/${encodeURIComponent(key)}`

  return {
    async list(): Promise<RegistryList> {
      const body = await request("/global/models")
      return {
        models: (body.models as ManagedModel[]) ?? [],
        disabledBuiltin: (body.disabledBuiltin as string[]) ?? [],
        unresolved: (body.unresolved as RegistryList["unresolved"]) ?? [],
      }
    },
    async create(input: { providerId: string; modelId: string; displayName?: string; contextWindow?: number }): Promise<ManagedModel> {
      const body = await request("/global/models", { method: "POST", body: JSON.stringify(input) })
      return body.model as ManagedModel
    },
    async createMany(
      models: Array<{ providerId: string; modelId: string; displayName?: string; contextWindow?: number }>,
    ): Promise<ManagedModel[]> {
      const body = await request("/global/models", { method: "POST", body: JSON.stringify({ models }) })
      return (body.models as ManagedModel[]) ?? []
    },
    async update(
      key: string,
      patch: Partial<{
        modelId: string
        displayName: string
        contextWindow: number
        capabilities: ManagedModel["capabilities"]
        enabled: boolean
        hidden: boolean
      }>,
    ): Promise<ManagedModel> {
      const body = await request(item(key), { method: "PATCH", body: JSON.stringify(patch) })
      return body.model as ManagedModel
    },
    async remove(key: string, replaceKey?: string): Promise<void> {
      await request(`${item(key)}/delete`, { method: "POST", body: JSON.stringify(replaceKey ? { replaceKey } : {}) })
    },
    async references(key: string): Promise<ModelReference[]> {
      const body = await request(`${item(key)}/references`)
      return (body.references as ModelReference[]) ?? []
    },
    async test(key: string, input: { timeoutMs?: number } = {}): Promise<
      { ok: true; latencyMs: number } | { ok: false; error: string; message: string }
    > {
      const body = await request(`${item(key)}/test`, { method: "POST", body: JSON.stringify(input) })
      return body.result as never
    },
  }
}

