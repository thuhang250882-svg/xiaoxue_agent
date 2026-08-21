export * as ModelRegistry from "./model-registry"

// Unified Model Registry: the single source of truth for locally managed models.
//
// Persistence lives in a dedicated file (Global.Path.config/models-registry.json)
// written directly with node:fs so entries can actually be removed. The shared
// Config.updateGlobal channel is mergeDeep-based and cannot delete keys, which is
// exactly why deleted models used to reappear after restart.
//
// Only cross-runtime safe APIs are used here (node:fs/promises, node:path,
// node:crypto, global fetch): the desktop sidecar runs under Node via
// Electron utilityProcess.fork while dev/CLI runs under Bun.

import { createHash, randomUUID } from "node:crypto"
import { mkdir, open, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Global } from "@opencode-ai/core/global"
import { Schema } from "effect"
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser"

export type ModelSource = "builtin" | "discovered" | "custom"

export type ModelCapabilities = {
  reasoning?: boolean
  vision?: boolean
  tools?: boolean
  streaming?: boolean
}

export type ManagedModel = {
  key: string
  providerId: string
  modelId: string
  displayName: string
  source: ModelSource
  enabled: boolean
  hidden: boolean
  capabilities?: ModelCapabilities
  contextWindow?: number
  // original "providerId/modelId" when imported from legacy opencode.json config,
  // so provider builds can strip the stale legacy definition even after edits
  legacyRef?: string
  createdAt: number
  updatedAt: number
}

export type ModelErrorCode =
  | "MODEL_NOT_FOUND"
  | "MODEL_DISABLED"
  | "MODEL_NOT_CONFIGURED"
  | "MODEL_ID_DUPLICATE"
  | "MODEL_IN_USE"
  | "MODEL_PROVIDER_UNAVAILABLE"
  | "MODEL_VALIDATION_FAILED"
  | "MODEL_REFERENCE_UNRESOLVED"
  | "MODEL_REGISTRY_CORRUPT"
  | "MODEL_REGISTRY_RECOVERY_REQUIRED"

export class ModelRegistryError extends Schema.TaggedErrorClass<ModelRegistryError>()("ModelRegistryError", {
  code: Schema.String as Schema.Schema<ModelErrorCode>,
  message: Schema.String,
}) {
  static isInstance(input: unknown): input is ModelRegistryError {
    return input instanceof ModelRegistryError
  }
}

export type ModelReference = {
  kind: "agent" | "default"
  agent?: string
  file: string
}

type UnresolvedReference = {
  reference: string
  locations: string[]
}

type RegistryFile = {
  version: 1
  models: ManagedModel[]
  // builtin models the user disabled (builtins cannot be deleted, only disabled)
  disabledBuiltin: string[]
  unresolved: UnresolvedReference[]
  // deleted "providerId/modelId" pairs that must never be re-imported from the
  // legacy opencode.json provider config (mergeDeep cannot remove keys there)
  tombstones: string[]
}

export type RegistryDiagnosis =
  | { status: "missing"; registryPath: string }
  | { status: "healthy"; registryPath: string }
  | {
      status: "corrupt"
      registryPath: string
      backupPath: string
      detectedAt: number
      reason: string
      sourceHash: string
    }
  | { status: "recovery_required"; registryPath: string; journalPath: string; operation: string }

type CorruptionState = Extract<RegistryDiagnosis, { status: "corrupt" }>

export type CreateInput = {
  providerId: string
  modelId: string
  displayName?: string
  capabilities?: ModelCapabilities
  contextWindow?: number
}

export type UpdateInput = Partial<Omit<CreateInput, "providerId">> & {
  enabled?: boolean
  hidden?: boolean
}

// OPENCODE_CONFIG_DIR redirects the global config location (mirrors
// Config loading), which also lets tests sandbox every file this module touches.
function configDir() {
  return Flag.OPENCODE_CONFIG_DIR ?? Global.Path.config
}

function registryPath() {
  return path.join(configDir(), "models-registry.json")
}

function corruptionStatePath() {
  return path.join(configDir(), "models-registry.recovery.json")
}

function journalPath() {
  return path.join(configDir(), "models-registry.journal.json")
}

function globalConfigCandidates() {
  return ["opencode.jsonc", "opencode.json", "config.json"].map((file) => path.join(configDir(), file))
}

async function fileExists(file: string) {
  try {
    await readFile(file)
    return true
  } catch {
    return false
  }
}

export async function globalConfigFile(): Promise<string | undefined> {
  for (const file of globalConfigCandidates()) {
    if (await fileExists(file)) return file
  }
  return undefined
}

export async function load(): Promise<RegistryFile> {
  await recoverUnfinishedJournal()
  try {
    return parseRegistry(await readFile(registryPath()))
  } catch (error) {
    if (isMissingFile(error)) return emptyRegistry()
    if (ModelRegistryError.isInstance(error)) throw error
    const state = await preserveCorruptRegistry(error)
    throw new ModelRegistryError({
      code: "MODEL_REGISTRY_CORRUPT",
      message: `Model registry is corrupt; original bytes preserved at ${state.backupPath}: ${state.reason}`,
    })
  }
}

function emptyRegistry(): RegistryFile {
  return { version: 1, models: [], disabledBuiltin: [], unresolved: [], tombstones: [] }
}

function isMissingFile(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}

function parseRegistry(raw: Uint8Array): RegistryFile {
  const parsed = JSON.parse(Buffer.from(raw).toString("utf8")) as unknown
  if (!isRecord(parsed) || parsed.version !== 1) throw new Error("version must equal 1")
  if (!Array.isArray(parsed.models) || !parsed.models.every(isManagedModel)) throw new Error("models has invalid schema")
  if (!isStringArray(parsed.disabledBuiltin)) throw new Error("disabledBuiltin has invalid schema")
  if (!Array.isArray(parsed.unresolved) || !parsed.unresolved.every(isUnresolvedReference)) {
    throw new Error("unresolved has invalid schema")
  }
  if (!isStringArray(parsed.tombstones)) throw new Error("tombstones has invalid schema")
  return {
    version: 1,
    models: parsed.models,
    disabledBuiltin: parsed.disabledBuiltin,
    unresolved: parsed.unresolved,
    tombstones: parsed.tombstones,
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
}

function isStringArray(input: unknown): input is string[] {
  return Array.isArray(input) && input.every((item) => typeof item === "string")
}

function isUnresolvedReference(input: unknown): input is UnresolvedReference {
  return isRecord(input) && typeof input.reference === "string" && isStringArray(input.locations)
}

function isManagedModel(input: unknown): input is ManagedModel {
  if (!isRecord(input)) return false
  if (!isStringArray([input.key, input.providerId, input.modelId, input.displayName])) return false
  if (!(["builtin", "discovered", "custom"] as unknown[]).includes(input.source)) return false
  if (typeof input.enabled !== "boolean" || typeof input.hidden !== "boolean") return false
  if (typeof input.createdAt !== "number" || typeof input.updatedAt !== "number") return false
  if (input.legacyRef !== undefined && typeof input.legacyRef !== "string") return false
  if (input.contextWindow !== undefined && (!Number.isInteger(input.contextWindow) || input.contextWindow <= 0)) return false
  if (input.capabilities !== undefined && !isCapabilities(input.capabilities)) return false
  return true
}

function isCapabilities(input: unknown) {
  if (!isRecord(input)) return false
  return [input.reasoning, input.vision, input.tools, input.streaming].every(
    (value) => value === undefined || typeof value === "boolean",
  )
}

function hash(content: Uint8Array | string) {
  return createHash("sha256").update(content).digest("hex")
}

async function preserveCorruptRegistry(error: unknown): Promise<CorruptionState> {
  const raw = await readFile(registryPath())
  const sourceHash = hash(raw)
  try {
    const state = JSON.parse(await readFile(corruptionStatePath(), "utf8")) as CorruptionState
    if (state.status === "corrupt" && state.sourceHash === sourceHash && await fileExists(state.backupPath)) return state
  } catch {
    // A missing or invalid diagnosis is replaced only after the source bytes are preserved.
  }
  const detectedAt = Date.now()
  const stamp = new Date(detectedAt).toISOString().replace(/[.:]/g, "-")
  const backupPath = path.join(configDir(), `models-registry.corrupt-${stamp}.json`)
  await atomicWrite(backupPath, raw, { exclusive: true })
  const state: CorruptionState = {
    status: "corrupt",
    registryPath: registryPath(),
    backupPath,
    detectedAt,
    reason: error instanceof Error ? error.message : String(error),
    sourceHash,
  }
  await atomicWrite(corruptionStatePath(), JSON.stringify(state, null, 2))
  return state
}

async function save(file: RegistryFile) {
  await atomicWrite(registryPath(), JSON.stringify(file, null, 2))
  await rm(corruptionStatePath(), { force: true })
}

// Atomic write: tmp file -> fsync -> rename. Registry and recovery metadata use
// the same durability boundary, while the model-specific journal coordinates
// the few operations that also update config or agent files.
async function atomicWrite(target: string, content: Uint8Array | string, options?: { exclusive?: boolean }) {
  await mkdir(path.dirname(target), { recursive: true })
  const tmp = `${target}.${randomUUID()}.tmp`
  try {
    const handle = await open(tmp, options?.exclusive ? "wx" : "w")
    try {
      await handle.writeFile(content)
      await handle.sync()
    } finally {
      await handle.close()
    }
    if (options?.exclusive && await fileExists(target)) {
      throw new Error(`Refusing to overwrite recovery backup ${target}`)
    }
    await rename(tmp, target)
  } finally {
    await rm(tmp, { force: true }).catch(() => undefined)
  }
}

async function recoverUnfinishedJournal() {
  // Phase 3 replaces this no-op with deterministic rollback recovery.
  return
}

let writeLock: Promise<unknown> = Promise.resolve()

async function withLock<A>(action: () => Promise<A>): Promise<A> {
  const previous = writeLock
  let release: () => void = () => {}
  writeLock = new Promise<void>((resolve) => {
    release = resolve
  })
  await previous
  try {
    return await action()
  } finally {
    release()
  }
}

export async function list(): Promise<ManagedModel[]> {
  return (await load()).models
}

export async function disabledBuiltinIDs(): Promise<string[]> {
  return (await load()).disabledBuiltin
}

export async function unresolvedReferences(): Promise<UnresolvedReference[]> {
  return (await load()).unresolved
}

export async function get(key: string): Promise<ManagedModel | undefined> {
  return (await load()).models.find((model) => model.key === key)
}

export async function findByModel(providerId: string, modelId: string): Promise<ManagedModel | undefined> {
  return (await load()).models.find((model) => model.providerId === providerId && model.modelId === modelId)
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ModelRegistryError({ code: "MODEL_VALIDATION_FAILED", message: `${field} must be a non-empty string` })
  }
  return value.trim()
}

export function create(input: CreateInput): Promise<ManagedModel> {
  return withLock(async () => (await createEntries([input]))[0])
}

export function createMany(inputs: CreateInput[]): Promise<ManagedModel[]> {
  return withLock(() => createEntries(inputs))
}

async function createEntries(inputs: CreateInput[]): Promise<ManagedModel[]> {
  if (!inputs.length) {
    throw new ModelRegistryError({ code: "MODEL_VALIDATION_FAILED", message: "At least one model is required" })
  }
  const file = await load()
  const now = Date.now()
  const pairs = new Set(file.models.map((model) => referenceString(model)))
  const entries = inputs.map((input) => {
    const providerId = requireText(input.providerId, "providerId")
    const modelId = requireText(input.modelId, "modelId")
    const pair = referenceString({ providerId, modelId })
    if (pairs.has(pair)) {
      throw new ModelRegistryError({
        code: "MODEL_ID_DUPLICATE",
        message: `Model ${pair} already exists`,
      })
    }
    if (input.contextWindow !== undefined && (!Number.isInteger(input.contextWindow) || input.contextWindow <= 0)) {
      throw new ModelRegistryError({
        code: "MODEL_VALIDATION_FAILED",
        message: "contextWindow must be a positive integer",
      })
    }
    pairs.add(pair)
    return {
      key: `mdl_${randomUUID()}`,
      providerId,
      modelId,
      displayName: input.displayName?.trim() || modelId,
      source: "custom" as const,
      enabled: true,
      hidden: false,
      capabilities: input.capabilities,
      contextWindow: input.contextWindow,
      createdAt: now,
      updatedAt: now,
    }
  })
  file.models.push(...entries)
  await save(file)
  return entries
}

export function update(key: string, patch: UpdateInput): Promise<ManagedModel> {
  return withLock(() => updateEntry(key, patch))
}

async function updateEntry(key: string, patch: UpdateInput): Promise<ManagedModel> {
  const file = await load()
  const entry = file.models.find((model) => model.key === key)
  if (!entry) {
    throw new ModelRegistryError({ code: "MODEL_NOT_FOUND", message: `Registry entry ${key} not found` })
  }
  if (entry.source === "builtin") {
    const unsupported = Object.keys(patch).filter((field) => field !== "enabled")
    if (unsupported.length) {
      throw new ModelRegistryError({
        code: "MODEL_VALIDATION_FAILED",
        message: `Builtin models only support enable/disable; rejected fields: ${unsupported.join(", ")}`,
      })
    }
    if (patch.enabled === undefined) return entry
    const id = referenceString(entry)
    file.disabledBuiltin = patch.enabled
      ? file.disabledBuiltin.filter((item) => item !== id)
      : [...new Set([...file.disabledBuiltin, id])]
    entry.enabled = patch.enabled
    entry.updatedAt = Date.now()
    await save(file)
    return entry
  }
  const previous = { providerId: entry.providerId, modelId: entry.modelId }
  if (patch.modelId !== undefined) {
    const modelId = requireText(patch.modelId, "modelId")
    if (file.models.some((model) => model.key !== key && model.providerId === entry.providerId && model.modelId === modelId)) {
      throw new ModelRegistryError({
        code: "MODEL_ID_DUPLICATE",
        message: `Model ${entry.providerId}/${modelId} already exists`,
      })
    }
    entry.modelId = modelId
  }
  if (patch.displayName !== undefined) entry.displayName = requireText(patch.displayName, "displayName")
  if (patch.capabilities !== undefined) entry.capabilities = patch.capabilities
  if (patch.contextWindow !== undefined) entry.contextWindow = patch.contextWindow
  if (patch.enabled !== undefined) entry.enabled = patch.enabled
  if (patch.hidden !== undefined) entry.hidden = patch.hidden
  entry.updatedAt = Date.now()
  // Cascade legacy "providerID/modelID" string references so agents and the
  // default model keep working after a modelId edit without a restart.
  if (patch.modelId !== undefined && patch.modelId !== previous.modelId) {
    await rewriteLegacyReferences(previous, { providerId: entry.providerId, modelId: entry.modelId })
  }
  await save(file)
  return entry
}

export function remove(key: string, options?: { replaceKey?: string }): Promise<void> {
  return withLock(() => removeEntry(key, options))
}

async function removeEntry(key: string, options?: { replaceKey?: string }): Promise<void> {
  const file = await load()
  const index = file.models.findIndex((model) => model.key === key)
  if (index < 0) {
    throw new ModelRegistryError({ code: "MODEL_NOT_FOUND", message: `Registry entry ${key} not found` })
  }
  const entry = file.models[index]
  if (entry.source === "builtin") {
    throw new ModelRegistryError({
      code: "MODEL_VALIDATION_FAILED",
      message: "Builtin models cannot be deleted, disable them instead",
    })
  }
  if (entry.source === "discovered") {
    // We cannot delete a model that lives on a remote provider; hide it and
    // keep it hidden across future discovery refreshes.
    entry.hidden = true
    entry.updatedAt = Date.now()
    await save(file)
    return
  }
  const refs = await scanReferences({ providerId: entry.providerId, modelId: entry.modelId })
  if (refs.length && !options?.replaceKey) {
    throw new ModelRegistryError({
      code: "MODEL_IN_USE",
      message: `Model ${entry.providerId}/${entry.modelId} is referenced by ${refs.length} configuration(s)`,
    })
  }
  if (options?.replaceKey) {
    const replacement = file.models.find((model) => model.key === options.replaceKey)
    if (!replacement) {
      throw new ModelRegistryError({ code: "MODEL_NOT_FOUND", message: `Replacement ${options.replaceKey} not found` })
    }
    await replaceLegacyReferences({ providerId: entry.providerId, modelId: entry.modelId }, replacement)
  }
  file.models.splice(index, 1)
  // The legacy opencode.json still contains the model definition (mergeDeep
  // cannot delete keys); tombstone it so provider rebuilds do not resurrect it.
  file.tombstones = [
    ...new Set([
      ...file.tombstones,
      referenceString({ providerId: entry.providerId, modelId: entry.modelId }),
      ...(entry.legacyRef ? [entry.legacyRef] : []),
    ]),
  ]
  await save(file)
}

export function setEnabled(key: string, enabled: boolean): Promise<ManagedModel> {
  return withLock(() => setEnabledEntry(key, enabled))
}

async function setEnabledEntry(key: string, enabled: boolean): Promise<ManagedModel> {
  const file = await load()
  const entry = file.models.find((model) => model.key === key)
  if (!entry) {
    throw new ModelRegistryError({ code: "MODEL_NOT_FOUND", message: `Registry entry ${key} not found` })
  }
  if (entry.source === "builtin") {
    const id = `${entry.providerId}/${entry.modelId}`
    file.disabledBuiltin = enabled
      ? file.disabledBuiltin.filter((item) => item !== id)
      : [...new Set([...file.disabledBuiltin, id])]
    entry.enabled = enabled
    entry.updatedAt = Date.now()
    await save(file)
    return entry
  }
  entry.enabled = enabled
  entry.updatedAt = Date.now()
  await save(file)
  return entry
}

// Resolve a stable modelKey to the current provider/model pair. Returns
// undefined when the key is unknown so callers can raise MODEL_REFERENCE_UNRESOLVED.
export async function resolve(key: string): Promise<{ providerID: string; modelID: string } | undefined> {
  const entry = await get(key)
  if (!entry) return undefined
  return { providerID: entry.providerId, modelID: entry.modelId }
}

export async function resolveAgentModel(input: {
  modelKey?: string
  model?: { providerID: string; modelID: string }
}): Promise<{ providerID: string; modelID: string }> {
  if (input.modelKey) {
    const resolved = await resolve(input.modelKey)
    if (!resolved) {
      throw new ModelRegistryError({
        code: "MODEL_REFERENCE_UNRESOLVED",
        message: `Agent model key ${input.modelKey} no longer resolves to a model`,
      })
    }
    return resolved
  }
  if (input.model) return input.model
  throw new ModelRegistryError({ code: "MODEL_NOT_CONFIGURED", message: "Agent has no model configured" })
}

// Disabled registry entries must fail loudly instead of silently falling back.
export async function assertUsable(providerId: string, modelId: string): Promise<void> {
  const entry = await findByModel(providerId, modelId)
  if (entry && !entry.enabled) {
    throw new ModelRegistryError({
      code: "MODEL_DISABLED",
      message: `Model ${providerId}/${modelId} is disabled`,
    })
  }
}

// "providerId/modelId" refs owned by the registry: tombstones plus the legacy
// origin of every imported entry. Provider builds must strip these from the
// config so deleted/edited legacy models stop being callable.
export async function legacyManagedRefs(): Promise<Set<string>> {
  const file = await load()
  const refs = new Set(file.tombstones)
  for (const model of file.models) {
    if (model.legacyRef) refs.add(model.legacyRef)
  }
  return refs
}

// Models that should be merged into the Provider database: enabled entries only.
// Hidden entries stay callable (hide only removes them from pickers).
export async function listUsable(): Promise<ManagedModel[]> {
  return (await load()).models.filter((model) => model.enabled)
}

// Shape registry entries like config provider models so provider.ts can reuse
// its existing parsing loop verbatim.
export function toConfigProviders(models: ManagedModel[]) {
  const result: Record<string, { name?: string; models: Record<string, Record<string, unknown>> }> = {}
  for (const model of models) {
    const provider = (result[model.providerId] ??= { models: {} })
    provider.models[model.modelId] = {
      name: model.displayName,
      reasoning: model.capabilities?.reasoning,
      attachment: model.capabilities?.vision,
      tool_call: model.capabilities?.tools,
      limit: model.contextWindow ? { context: model.contextWindow } : undefined,
    }
  }
  return result
}

// --- reference scanning / cascade updates -----------------------------------
// Operates directly on config files to stay free of provider/agent imports
// (both import this module, so importing them back would create a cycle).

async function agentMarkdownFiles(): Promise<string[]> {
  const dirs = [
    path.join(configDir(), "agent"),
    path.join(configDir(), "agents"),
    path.join(process.cwd(), ".opencode", "agent"),
    path.join(process.cwd(), ".opencode", "agents"),
  ]
  const files: string[] = []
  for (const dir of dirs) {
    try {
      const entries = await readdir(dir)
      for (const entry of entries) {
        if (entry.endsWith(".md")) files.push(path.join(dir, entry))
      }
    } catch {
      // directory may not exist
    }
  }
  return files
}

type Target = { providerId: string; modelId: string }

function referenceString(target: Target) {
  return `${target.providerId}/${target.modelId}`
}

async function scanFiles(): Promise<{ file: string; content: string }[]> {
  const files: { file: string; content: string }[] = []
  const config = await globalConfigFile()
  if (config) {
    try {
      files.push({ file: config, content: await readFile(config, "utf8") })
    } catch {
      // unreadable config is treated as absent
    }
  }
  for (const file of await agentMarkdownFiles()) {
    try {
      files.push({ file, content: await readFile(file, "utf8") })
    } catch {
      // skip unreadable files
    }
  }
  return files
}

async function scanReferences(target: Target): Promise<ModelReference[]> {
  const needle = `"${referenceString(target)}"`
  const frontmatter = new RegExp(`^model:\\s*${escapeRegExp(referenceString(target))}\\s*$`, "m")
  const refs: ModelReference[] = []
  for (const { file, content } of await scanFiles()) {
    const isMarkdown = file.endsWith(".md")
    const matched = isMarkdown ? frontmatter.test(content) : content.includes(needle)
    if (!matched) continue
    if (isMarkdown) {
      refs.push({ kind: "agent", agent: path.basename(file, ".md"), file })
      continue
    }
    try {
      const parsed = parseConfigDocument(content, file)
      if (parsed.model === referenceString(target)) refs.push({ kind: "default", file })
      const agents = parsed.agent as Record<string, { model?: string }> | undefined
      for (const [name, agent] of Object.entries(agents ?? {})) {
        if (agent?.model === referenceString(target)) refs.push({ kind: "agent", agent: name, file })
      }
    } catch {
      // unparseable jsonc: still count the file as a reference to be safe
      refs.push({ kind: "agent", file })
    }
  }
  return refs
}

export async function references(key: string): Promise<ModelReference[]> {
  const entry = await get(key)
  if (!entry) {
    throw new ModelRegistryError({ code: "MODEL_NOT_FOUND", message: `Registry entry ${key} not found` })
  }
  return scanReferences({ providerId: entry.providerId, modelId: entry.modelId })
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function parseConfigDocument(content: string, file: string) {
  const errors: ParseError[] = []
  const value = parse(content, errors, { allowTrailingComma: true })
  if (errors.length || typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ModelRegistryError({
      code: "MODEL_REFERENCE_UNRESOLVED",
      message: `Cannot safely update model references in ${file}`,
    })
  }
  return value as Record<string, unknown>
}

function updateConfigValue(content: string, keys: string[], value: unknown) {
  return applyEdits(
    content,
    modify(content, keys, value, {
      formattingOptions: { insertSpaces: true, tabSize: 2 },
    }),
  )
}

async function rewriteLegacyReferences(previous: Target, next: Target) {
  const old = referenceString(previous)
  const updated = referenceString(next)
  for (const { file, content } of await scanFiles()) {
    if (!content.includes(old)) continue
    if (file.endsWith(".md")) {
      const result = content.replace(new RegExp(`^model:\\s*${escapeRegExp(old)}\\s*$`, "m"), `model: ${updated}`)
      if (result !== content) await writeFile(file, result, "utf8")
      continue
    }
    const parsed = parseConfigDocument(content, file) as {
      model?: string
      agent?: Record<string, { model?: string }>
    }
    let result = content
    if (parsed.model === old) result = updateConfigValue(result, ["model"], updated)
    for (const [name, agent] of Object.entries(parsed.agent ?? {})) {
      if (agent?.model === old) result = updateConfigValue(result, ["agent", name, "model"], updated)
    }
    if (result !== content) await writeFile(file, result, "utf8")
  }
}

// Point legacy references at a replacement registry entry. Agent config
// references are upgraded to a stable model_key; the top-level default model
// and markdown frontmatter stay as "providerID/modelID" strings so every
// consumer (App picker included) keeps understanding them.
async function replaceLegacyReferences(previous: Target, replacement: ManagedModel) {
  const old = referenceString(previous)
  const next = referenceString({ providerId: replacement.providerId, modelId: replacement.modelId })
  for (const { file, content } of await scanFiles()) {
    if (!content.includes(old)) continue
    if (file.endsWith(".md")) {
      const replaced = content.replace(new RegExp(`^model:\\s*${escapeRegExp(old)}\\s*$`, "m"), `model: ${next}`)
      if (replaced !== content) await writeFile(file, replaced, "utf8")
      continue
    }
    try {
      const parsed = parseConfigDocument(content, file) as {
        model?: string
        agent?: Record<string, { model?: string; model_key?: string }>
      }
      let result = content
      if (parsed.model === old) {
        result = updateConfigValue(result, ["model"], next)
      }
      for (const [name, agent] of Object.entries(parsed.agent ?? {})) {
        if (agent?.model === old) {
          result = updateConfigValue(result, ["agent", name, "model"], undefined)
          result = updateConfigValue(result, ["agent", name, "model_key"], replacement.key)
        }
      }
      if (result !== content) await writeFile(file, result, "utf8")
    } catch (error) {
      if (ModelRegistryError.isInstance(error)) throw error
      throw new ModelRegistryError({
        code: "MODEL_REFERENCE_UNRESOLVED",
        message: `Cannot safely replace model references in ${file}`,
      })
    }
  }
}

// One-shot lazy migration: upgrade legacy "providerID/modelID" references to
// stable model_key when the registry has exactly one match. Never throws —
// migration failure must not block startup.
export async function migrateLegacyReferences(): Promise<void> {
  try {
    const file = await load()
    if (!file.models.length) return
    const byReference = new Map<string, ManagedModel[]>()
    for (const model of file.models) {
      const id = referenceString({ providerId: model.providerId, modelId: model.modelId })
      byReference.set(id, [...(byReference.get(id) ?? []), model])
    }
    const unresolved = new Map<string, Set<string>>()
    for (const { file: location, content } of await scanFiles()) {
      const matches = content.matchAll(/"([A-Za-z0-9_.\-]+\/[A-Za-z0-9_.\-]+)"/g)
      for (const match of matches) {
        const reference = match[1]
        const candidates = byReference.get(reference)
        if (!candidates) continue
        if (candidates.length === 1) {
          await replaceLegacyReferences(
            { providerId: candidates[0].providerId, modelId: candidates[0].modelId },
            candidates[0],
          )
        } else {
          unresolved.set(reference, new Set([...(unresolved.get(reference) ?? []), location]))
        }
      }
    }
    if (unresolved.size) {
      file.unresolved = [...unresolved.entries()].map(([reference, locations]) => ({
        reference,
        locations: [...locations],
      }))
      await save(file)
    }
  } catch (error) {
    console.warn("model registry migration failed", error)
  }
}

// Import legacy provider[].models entries into the registry once, assigning
// stable keys. Defaults to reading the global config file directly so that
// per-project local config models never leak into the global registry.
// Existing config is left untouched.
export function importLegacyConfigModels(
  configProviders?: Record<string, { models?: Record<string, unknown> }> | undefined,
) {
  return withLock(() => importLegacyConfigModelsLocked(configProviders))
}

async function importLegacyConfigModelsLocked(
  configProviders?: Record<string, { models?: Record<string, unknown> }> | undefined,
) {
  try {
    let providers = configProviders
    if (providers === undefined) {
      const file = await globalConfigFile()
      if (!file) return
      const parsed = parseConfigDocument(await readFile(file, "utf8"), file) as {
        provider?: Record<string, { models?: Record<string, unknown> }>
      }
      providers = parsed.provider
    }
    if (!providers) return
    const file = await load()
    const tombstones = new Set(file.tombstones)
    const legacyRefs = new Set(file.models.map((model) => model.legacyRef).filter((ref): ref is string => Boolean(ref)))
    let changed = false
    for (const [providerId, provider] of Object.entries(providers)) {
      for (const [modelId, raw] of Object.entries(provider?.models ?? {})) {
        const legacyRef = `${providerId}/${modelId}`
        if (tombstones.has(legacyRef)) continue
        if (legacyRefs.has(legacyRef)) continue
        if (file.models.some((model) => model.providerId === providerId && model.modelId === modelId)) continue
        const info = (raw ?? {}) as { name?: string; limit?: { context?: number }; reasoning?: boolean; attachment?: boolean; tool_call?: boolean }
        const now = Date.now()
        file.models.push({
          key: `mdl_${randomUUID()}`,
          providerId,
          modelId,
          displayName: info.name ?? modelId,
          source: "custom",
          enabled: true,
          hidden: false,
          legacyRef,
          capabilities: {
            reasoning: info.reasoning,
            vision: info.attachment,
            tools: info.tool_call,
          },
          contextWindow: info.limit?.context,
          createdAt: now,
          updatedAt: now,
        })
        changed = true
      }
    }
    if (changed) await save(file)
  } catch (error) {
    console.warn("model registry legacy import failed", error)
  }
}

// --- connection test ---------------------------------------------------------

export type ModelTestResult =
  | { ok: true; latencyMs: number }
  | { ok: false; error: ModelErrorCode; message: string }

export async function testModel(entry: ManagedModel, options: { baseUrl: string; apiKey?: string; timeoutMs?: number }): Promise<ModelTestResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000)
  const started = Date.now()
  try {
    const url = options.baseUrl.replace(/\/+$/, "") + "/chat/completions"
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: entry.modelId,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
    })
    if (response.ok) return { ok: true, latencyMs: Date.now() - started }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: "MODEL_PROVIDER_UNAVAILABLE", message: `Authentication failed (HTTP ${response.status})` }
    }
    const body = await response.text().catch(() => "")
    if (response.status === 404 || /model.*not\s*found|does not exist/i.test(body)) {
      return { ok: false, error: "MODEL_NOT_FOUND", message: `Provider does not know model ${entry.modelId}` }
    }
    return { ok: false, error: "MODEL_PROVIDER_UNAVAILABLE", message: `Provider error (HTTP ${response.status}): ${body.slice(0, 200)}` }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "MODEL_PROVIDER_UNAVAILABLE", message: "Connection test timed out" }
    }
    return { ok: false, error: "MODEL_PROVIDER_UNAVAILABLE", message: `Endpoint unreachable: ${error instanceof Error ? error.message : String(error)}` }
  } finally {
    clearTimeout(timer)
  }
}
