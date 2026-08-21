// Shared helpers for model registry tests. Every test sandboxes the global
// config directory via OPENCODE_CONFIG_DIR so the registry file, the legacy
// opencode.json and agent markdown files never touch the real user config.
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

export type RegistryFileFixture = {
  version: 1
  models: unknown[]
  disabledBuiltin: string[]
  unresolved: unknown[]
  tombstones: string[]
}

export async function sandbox(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "model-registry-test-"))
  process.env.OPENCODE_CONFIG_DIR = dir
  return dir
}

export async function cleanup(dir: string) {
  delete process.env.OPENCODE_CONFIG_DIR
  await rm(dir, { recursive: true, force: true })
}

export async function writeJSON(dir: string, file: string, content: unknown) {
  await writeFile(path.join(dir, file), JSON.stringify(content, null, 2), "utf8")
}

export function registryFixture(models: unknown[] = [], extra?: Partial<RegistryFileFixture>): RegistryFileFixture {
  return {
    version: 1,
    models,
    disabledBuiltin: [],
    unresolved: [],
    tombstones: [],
    ...extra,
  }
}

export function modelFixture(overrides: Record<string, unknown> = {}) {
  const now = Date.now()
  return {
    key: "mdl_fixture",
    providerId: "local-llm",
    modelId: "model-fixture",
    displayName: "Fixture Model",
    source: "custom",
    enabled: true,
    hidden: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}
