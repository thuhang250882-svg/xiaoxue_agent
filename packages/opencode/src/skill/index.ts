import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import path from "path"
import { Effect, Layer, Context, Schema } from "effect"
import { NamedError } from "@opencode-ai/core/util/error"
import type { Agent } from "@/agent/agent"
import { EventV2Bridge } from "@/event-v2-bridge"
import { InstanceState } from "@/effect/instance-state"
import { Global } from "@opencode-ai/core/global"
import { SkillPlugin } from "@opencode-ai/core/plugin/skill"
import { Permission } from "@/permission"
import { XiaoxueEnterprisePolicy } from "@/xiaoxue/enterprise-policy"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Config } from "@/config/config"
import { FrontmatterError } from "@opencode-ai/core/v1/config/error"
import { ConfigMarkdown } from "@/config/markdown"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Glob } from "@opencode-ai/core/util/glob"
import { Discovery } from "./discovery"
import { isRecord } from "@/util/record"
import { escapeHtml } from "@/util/html"

const CLAUDE_EXTERNAL_DIR = ".claude"
const AGENTS_EXTERNAL_DIR = ".agents"
const EXTERNAL_SKILL_PATTERN = "skills/**/SKILL.md"
const OPENCODE_SKILL_PATTERN = "{skill,skills}/**/SKILL.md"
const SKILL_PATTERN = "**/SKILL.md"

// Built-in skill that ships with opencode. The model's intuition for what an
// opencode.json should look like is often wrong, and opencode hard-fails on
// invalid config, so users hit cryptic startup errors. Loading this skill
// when the model is asked to touch opencode's own config files gives it the
// actual schemas instead of guesses.
const CUSTOMIZE_OPENCODE_SKILL_NAME = "customize-opencode"
export { CUSTOMIZE_OPENCODE_SKILL_NAME }
const CUSTOMIZE_OPENCODE_SKILL_DESCRIPTION =
  "Use ONLY when the user is editing or creating opencode's own configuration: opencode.json, opencode.jsonc, files under .opencode/, or files under ~/.config/opencode/. Also use when creating or fixing opencode agents, subagents, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring opencode itself."
const CUSTOMIZE_OPENCODE_SKILL_BODY = SkillPlugin.CustomizeOpencodeContent

export const SkillSource = Schema.Literals(["bundled", "user", "project", "remote"])
export type SkillSource = Schema.Schema.Type<typeof SkillSource>

export const SkillCapabilities = Schema.Struct({
  editable: Schema.Boolean,
  removable: Schema.Boolean,
  enableable: Schema.Boolean,
})
export type SkillCapabilities = Schema.Schema.Type<typeof SkillCapabilities>

export const SkillDiagnostic = Schema.Struct({
  level: Schema.Literals(["info", "warning", "error"]),
  code: Schema.String,
  message: Schema.String,
})
export type SkillDiagnostic = Schema.Schema.Type<typeof SkillDiagnostic>

export const SkillHealth = Schema.Literals(["healthy", "warning", "error"])
export type SkillHealth = Schema.Schema.Type<typeof SkillHealth>

export const SkillName = Schema.String.check(
  Schema.isPattern(
    /^(?=.{1,80}$)(?!.*\.\.)(?!(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$))[\p{L}\p{N}](?:[\p{L}\p{N}._-]*[\p{L}\p{N}_-])?$/iu,
  ),
)
export type SkillName = Schema.Schema.Type<typeof SkillName>

export const SkillCreate = Schema.Struct({
  name: SkillName,
  description: Schema.optional(Schema.String),
  content: Schema.optional(Schema.String),
})
export type SkillCreate = Schema.Schema.Type<typeof SkillCreate>

export const SkillImportPreviewInput = Schema.Struct({
  source: Schema.String,
})
export type SkillImportPreviewInput = Schema.Schema.Type<typeof SkillImportPreviewInput>

export const SkillImport = Schema.Struct({
  token: Schema.String,
})
export type SkillImport = Schema.Schema.Type<typeof SkillImport>

export const SkillImportRisk = Schema.Struct({
  level: Schema.Literals(["info", "warning", "error"]),
  code: Schema.String,
  message: Schema.String,
  path: Schema.optional(Schema.String),
})
export type SkillImportRisk = Schema.Schema.Type<typeof SkillImportRisk>

export const SkillImportPreview = Schema.Struct({
  token: Schema.String,
  name: SkillName,
  description: Schema.optional(Schema.String),
  format: Schema.Literals(["markdown", "directory", "skill-archive"]),
  sha256: Schema.String,
  fileCount: Schema.Number,
  totalBytes: Schema.Number,
  expiresAt: Schema.Number,
  risks: Schema.Array(SkillImportRisk),
  conflicts: Schema.Array(Schema.String),
  canInstall: Schema.Boolean,
})
export type SkillImportPreview = Schema.Schema.Type<typeof SkillImportPreview>

export const SkillCandidate = Schema.Struct({
  location: Schema.String,
  source: SkillSource,
  priority: Schema.Number,
  selected: Schema.Boolean,
})
export type SkillCandidate = Schema.Schema.Type<typeof SkillCandidate>

export const SkillConflict = Schema.Struct({
  skill: Schema.String,
  winner: SkillCandidate,
  candidates: Schema.Array(SkillCandidate),
  conflictsWith: Schema.Array(Schema.String),
  severity: Schema.Literals(["info", "warning", "error"]),
  override: Schema.Boolean,
  realConflict: Schema.Boolean,
  reason: Schema.String,
})
export type SkillConflict = Schema.Schema.Type<typeof SkillConflict>

export const Info = Schema.Struct({
  name: SkillName,
  description: Schema.optional(Schema.String),
  location: Schema.String,
  content: Schema.String,
  source: SkillSource,
  capabilities: SkillCapabilities,
  enabled: Schema.Boolean,
  health: SkillHealth,
  diagnostics: Schema.Array(SkillDiagnostic),
})
export type Info = Schema.Schema.Type<typeof Info>

// Patch payload accepted by Skill.update and the HTTP `app.skills.update`
// route. Only frontmatter name and description are mutable; the on-disk
// location and content (beyond what gray-matter rewrites for the two fields
// above) stay under opencode's control.
export const SkillPatch = Schema.Struct({
  name: Schema.optional(SkillName),
  description: Schema.optional(Schema.String),
})
export type SkillPatch = Schema.Schema.Type<typeof SkillPatch>

const Issue = Schema.StructWithRest(
  Schema.Struct({
    message: Schema.String,
    path: Schema.Array(Schema.String),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
)

function isSkillFrontmatter(data: unknown): data is { name: SkillName; description?: string } {
  return (
    isRecord(data) &&
    Schema.is(SkillName)(data.name) &&
    (data.description === undefined || typeof data.description === "string")
  )
}

export class InvalidError extends Schema.TaggedErrorClass<InvalidError>()("SkillInvalidError", {
  path: Schema.String,
  message: Schema.optional(Schema.String),
  issues: Schema.optional(Schema.Array(Issue)),
}) {}

export class InvalidNameError extends Schema.TaggedErrorClass<InvalidNameError>()("InvalidSkillNameError", {
  name: Schema.String,
  message: Schema.String,
}) {}

export class ReadOnlyError extends Schema.TaggedErrorClass<ReadOnlyError>()("SkillReadOnlyError", {
  name: Schema.String,
  source: SkillSource,
  message: Schema.String,
}) {}

export class NameMismatchError extends Schema.TaggedErrorClass<NameMismatchError>()("SkillNameMismatchError", {
  path: Schema.String,
  expected: Schema.String,
  actual: Schema.String,
}) {}

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("Skill.NotFoundError", {
  name: Schema.String,
  available: Schema.Array(Schema.String),
}) {
  override get message() {
    return `Skill "${this.name}" not found. Available skills: ${this.available.join(", ") || "none"}`
  }
}

export class ImportError extends Schema.TaggedErrorClass<ImportError>()("SkillImportError", {
  source: Schema.String,
  message: Schema.String,
}) {}

export class ConflictError extends Schema.TaggedErrorClass<ConflictError>()("SkillConflictError", {
  skill: Schema.String,
  conflictsWith: Schema.Array(Schema.String),
  message: Schema.String,
}) {}

function requireSkillName(name: string) {
  if (Schema.is(SkillName)(name)) return Effect.succeed(name)
  return Effect.fail(
    new InvalidNameError({
      name,
      message:
        "Skill name must be 1-80 Unicode letters or numbers with optional '.', '_' or '-' characters, without path traversal or Windows reserved names",
    }),
  )
}

function requireUserSkillDirectory(name: SkillName) {
  const root = path.resolve(Global.Path.config, "skills")
  const target = path.resolve(root, name)
  if (target !== root && FSUtil.contains(root, target)) return Effect.succeed(target)
  return Effect.fail(new InvalidError({ path: name, message: `Skill path escapes the managed root: ${name}` }))
}

const atomicWrite = Effect.fnUntraced(function* (fsys: FSUtil.Interface, target: string, content: string) {
  const temporary = `${target}.${crypto.randomUUID()}.tmp`
  yield* fsys.writeFileString(temporary, content, { flag: "wx" }).pipe(
    Effect.andThen(fsys.rename(temporary, target)),
    Effect.catch((error) =>
      fsys.remove(temporary, { force: true }).pipe(
        Effect.ignore,
        Effect.andThen(Effect.fail(error)),
      ),
    ),
  )
})

type State = {
  skills: Record<string, Info>
  candidates: Record<string, Info[]>
  dirs: Set<string>
  disabled: Set<string>
}

type DiscoveryState = {
  matches: string[]
  dirs: string[]
}

type ScanState = {
  matches: Set<string>
  dirs: Set<string>
}

const IMPORT_PREVIEW_TTL_MS = 10 * 60 * 1000
const IMPORT_MAX_SOURCE_BYTES = 20 * 1024 * 1024
const IMPORT_MAX_TOTAL_BYTES = 50 * 1024 * 1024
const IMPORT_MAX_FILES = 500
const IMPORT_MAX_COMPRESSION_RATIO = 100

type QuarantinedImport = {
  preview: SkillImportPreview
  quarantine: string
  skillRoot: string
  content: string
}

function safeImportPath(value: string) {
  if (!value || value.includes("\\") || path.isAbsolute(value)) return false
  const normalized = path.posix.normalize(value)
  return normalized !== ".." && !normalized.startsWith("../") && normalized === value.replace(/^\.\//, "")
}

async function quarantineLocalSkill(source: string, quarantine: string) {
  if (/^https?:\/\//iu.test(source)) throw new Error("URL imports are disabled; choose a local .skill file, SKILL.md, or Skill directory")
  const fs = await import("node:fs/promises")
  const stat = await fs.lstat(source)
  if (stat.isSymbolicLink()) throw new Error("Symbolic-link import sources are not allowed")
  const contentRoot = path.join(quarantine, "content")
  await fs.mkdir(contentRoot, { recursive: true })
  const files: Array<{ relative: string; bytes: Uint8Array }> = []

  const accept = (relative: string, bytes: Uint8Array) => {
    const normalized = relative.replaceAll("\\", "/").replace(/^\.\//, "")
    if (!safeImportPath(normalized)) throw new Error(`Unsafe import path: ${relative}`)
    if (files.length >= IMPORT_MAX_FILES) throw new Error(`Skill exceeds the ${IMPORT_MAX_FILES}-file limit`)
    if (bytes.byteLength > IMPORT_MAX_TOTAL_BYTES) throw new Error(`Skill file exceeds the ${IMPORT_MAX_TOTAL_BYTES}-byte limit: ${relative}`)
    if (files.reduce((total, file) => total + file.bytes.byteLength, 0) + bytes.byteLength > IMPORT_MAX_TOTAL_BYTES) {
      throw new Error(`Skill exceeds the ${IMPORT_MAX_TOTAL_BYTES}-byte extracted-size limit`)
    }
    files.push({ relative: normalized, bytes })
  }

  const walk = async (directory: string, relative = "") => {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    for (const entry of entries.toSorted((a, b) => a.name.localeCompare(b.name))) {
      const item = path.join(directory, entry.name)
      const itemRelative = relative ? `${relative}/${entry.name}` : entry.name
      const itemStat = await fs.lstat(item)
      if (itemStat.isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${itemRelative}`)
      if (itemStat.isDirectory()) {
        await walk(item, itemRelative)
        continue
      }
      if (!itemStat.isFile()) throw new Error(`Unsupported filesystem entry: ${itemRelative}`)
      accept(itemRelative, new Uint8Array(await fs.readFile(item)))
    }
  }

  const archive = stat.isFile() && source.toLowerCase().endsWith(".skill")
  if (archive) {
    if (stat.size > IMPORT_MAX_SOURCE_BYTES) throw new Error(`Archive exceeds the ${IMPORT_MAX_SOURCE_BYTES}-byte source limit`)
    const { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } = await import("@zip.js/zip.js")
    const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(await fs.readFile(source))))
    const entries = await reader.getEntries()
    if (entries.length > IMPORT_MAX_FILES) throw new Error(`Archive exceeds the ${IMPORT_MAX_FILES}-entry limit`)
    for (const entry of entries.toSorted((a, b) => a.filename.localeCompare(b.filename))) {
      const relative = entry.filename.replace(/\/$/u, "")
      if (!relative || entry.directory) continue
      if (!safeImportPath(relative)) throw new Error(`Unsafe archive path: ${entry.filename}`)
      const unixMode = ((entry.externalFileAttributes ?? 0) >>> 16) & 0o170000
      if (unixMode === 0o120000) throw new Error(`Archive symbolic links are not allowed: ${entry.filename}`)
      if (entry.encrypted) throw new Error(`Encrypted archive entries are not allowed: ${entry.filename}`)
      if (entry.uncompressedSize > IMPORT_MAX_TOTAL_BYTES) throw new Error(`Archive entry is too large: ${entry.filename}`)
      const ratio = entry.compressedSize === 0 ? entry.uncompressedSize : entry.uncompressedSize / entry.compressedSize
      if (ratio > IMPORT_MAX_COMPRESSION_RATIO) throw new Error(`Suspicious compression ratio in: ${entry.filename}`)
      if (!entry.getData) throw new Error(`Archive entry cannot be read: ${entry.filename}`)
      accept(relative, await entry.getData(new Uint8ArrayWriter()))
    }
    await reader.close()
  } else if (stat.isDirectory()) {
    await walk(source)
  } else if (stat.isFile() && path.basename(source).toLowerCase() === "skill.md") {
    if (stat.size > IMPORT_MAX_TOTAL_BYTES) throw new Error(`SKILL.md exceeds the ${IMPORT_MAX_TOTAL_BYTES}-byte limit`)
    accept("SKILL.md", new Uint8Array(await fs.readFile(source)))
  } else {
    throw new Error("Local import accepts only a .skill archive, a SKILL.md file, or a directory containing one SKILL.md")
  }

  const manifests = files.filter((file) => path.posix.basename(file.relative).toLowerCase() === "skill.md")
  if (manifests.length !== 1) throw new Error(`Import must contain exactly one SKILL.md; found ${manifests.length}`)
  for (const file of files) {
    const target = path.resolve(contentRoot, ...file.relative.split("/"))
    if (!FSUtil.contains(contentRoot, target)) throw new Error(`Import path escapes quarantine: ${file.relative}`)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, file.bytes, { flag: "wx" })
  }

  const { createHash } = await import("node:crypto")
  const hasher = createHash("sha256")
  for (const file of files.toSorted((a, b) => a.relative.localeCompare(b.relative))) {
    hasher.update(`${file.relative}\0${file.bytes.byteLength}\0`)
    hasher.update(file.bytes)
  }
  return {
    format: archive ? "skill-archive" as const : stat.isDirectory() ? "directory" as const : "markdown" as const,
    hash: hasher.digest("hex"),
    files,
    skillRoot: path.dirname(path.join(contentRoot, ...manifests[0].relative.split("/"))),
    manifest: new TextDecoder("utf-8", { fatal: true }).decode(manifests[0].bytes),
  }
}

async function cleanupImportQuarantine(root: string) {
  const fs = await import("node:fs/promises")
  const entries = await fs.readdir(root, { withFileTypes: true }).catch((cause: NodeJS.ErrnoException) => {
    if (cause.code === "ENOENT") return []
    throw cause
  })
  const expired = Date.now() - IMPORT_PREVIEW_TTL_MS
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isDirectory()) return
      const item = path.join(root, entry.name)
      if ((await fs.lstat(item)).mtimeMs > expired) return
      await fs.rm(item, { recursive: true, force: true })
    }),
  )
}

function auditImportFiles(files: Array<{ relative: string; bytes: Uint8Array }>) {
  const risks: SkillImportRisk[] = []
  const executable = /\.(?:exe|dll|msi|com|bat|cmd|ps1|sh|py|js|mjs|cjs)$/iu
  const text = /\.(?:md|txt|json|ya?ml|toml|xml|html?|css|ts|tsx|jsx?|py|ps1|sh|bat|cmd)$/iu
  for (const file of files) {
    if (executable.test(file.relative)) {
      risks.push({ level: "warning", code: "SKILL_EXECUTABLE_CONTENT", message: "Contains executable or script content; it was not executed during import", path: file.relative })
    }
    if (!text.test(file.relative) || file.bytes.byteLength > 1024 * 1024) continue
    const content = new TextDecoder("utf-8").decode(file.bytes)
    if (/https?:\/\//iu.test(content)) risks.push({ level: "warning", code: "SKILL_NETWORK_REFERENCE", message: "Contains network URLs; review before allowing later use", path: file.relative })
    if (/\b(?:curl|wget|Invoke-WebRequest|Start-Process|child_process|subprocess|os\.system|pip install|npm install|bun add)\b/iu.test(content)) {
      risks.push({ level: "warning", code: "SKILL_COMMAND_REFERENCE", message: "Contains command execution or dependency-install instructions", path: file.relative })
    }
    if (/(?:ignore|disregard).{0,32}(?:previous|above|system).{0,24}(?:instruction|prompt)|忽略.{0,24}(?:此前|以上|系统).{0,24}(?:指令|提示)/isu.test(content)) {
      risks.push({ level: "warning", code: "SKILL_PROMPT_INJECTION_PATTERN", message: "Contains text resembling prompt-injection instructions; treat it as untrusted data", path: file.relative })
    }
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bsk-[A-Za-z0-9_-]{20,}\b/u.test(content)) {
      risks.push({ level: "error", code: "SKILL_POSSIBLE_SECRET", message: "Contains material resembling a private key or access credential", path: file.relative })
    }
  }
  return risks
}

export interface Interface {
  readonly get: (name: string) => Effect.Effect<Info | undefined>
  readonly require: (name: string) => Effect.Effect<Info, NotFoundError>
  readonly all: () => Effect.Effect<Info[]>
  readonly inspect: (name: string) => Effect.Effect<Info, NotFoundError>
  readonly dirs: () => Effect.Effect<string[]>
  readonly available: (agent?: Agent.Info) => Effect.Effect<Info[]>
  readonly create: (input: { name: string; description?: string; content?: string }) => Effect.Effect<Info, unknown>
  readonly previewImport: (source: string) => Effect.Effect<SkillImportPreview, unknown>
  readonly import: (token: string) => Effect.Effect<Info, unknown>
  readonly update: (name: string, patch: { name?: string; description?: string }) => Effect.Effect<Info, unknown>
  readonly remove: (name: string) => Effect.Effect<void, unknown>
  readonly refresh: () => Effect.Effect<void>
  readonly enable: (name: string) => Effect.Effect<Info, NotFoundError>
  readonly disable: (name: string) => Effect.Effect<Info, NotFoundError | InvalidError>
  readonly validate: (name: string) => Effect.Effect<SkillDiagnostic[], NotFoundError>
  readonly health: (name: string) => Effect.Effect<SkillHealth, NotFoundError>
  readonly conflicts: () => Effect.Effect<SkillConflict[]>
}

const add = Effect.fnUntraced(function* (state: State, match: string, events: EventV2Bridge.Service["Service"]) {
  const source = skillSource(match)
  if (!XiaoxueEnterprisePolicy.allowsSource("skill", source)) {
    yield* Effect.logWarning("skill blocked by managed source policy", { skill: match, source })
    return
  }
  const md = yield* Effect.tryPromise({
    try: () => ConfigMarkdown.parse(match),
    catch: (err) => err,
  }).pipe(
    Effect.catch(
      Effect.fnUntraced(function* (err) {
        const message = FrontmatterError.isInstance(err) ? err.data.message : `Failed to parse skill ${match}`
        const { Session } = yield* Effect.promise(() => import("@/session/session"))
        yield* events.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() })
        yield* Effect.logError("failed to load skill", { skill: match, error: err })
        return undefined
      }),
    ),
  )

  if (!md) return

  if (!isSkillFrontmatter(md.data)) return

  state.dirs.add(path.dirname(match))
  const info: Info = {
    name: md.data.name,
    description: md.data.description,
    location: match,
    content: md.content,
    source,
    capabilities: skillCapabilities(source),
    enabled: !state.disabled.has(md.data.name),
    ...initialHealth(md.data.name, md.data.description),
  }
  state.candidates[md.data.name] = [...(state.candidates[md.data.name] ?? []), info]
})

function sourcePriority(source: SkillSource) {
  if (source === "project") return 4
  if (source === "user") return 3
  if (source === "remote") return 2
  return 1
}

function resolveCandidates(state: State) {
  for (const [name, candidates] of Object.entries(state.candidates)) {
    const sorted = candidates.toSorted(
      (a, b) => sourcePriority(b.source) - sourcePriority(a.source) || a.location.localeCompare(b.location),
    )
    state.candidates[name] = sorted
    state.skills[name] = sorted[0]
  }
}

const scan = Effect.fnUntraced(function* (
  state: ScanState,
  root: string,
  pattern: string,
  opts?: { dot?: boolean; scope?: string },
) {
  const matches = yield* Effect.tryPromise({
    try: () =>
      Glob.scan(pattern, {
        cwd: root,
        absolute: true,
        include: "file",
        symlink: true,
        dot: opts?.dot,
      }),
    catch: (error) => error,
  }).pipe(
    Effect.catch((error) => {
      if (!opts?.scope) return Effect.die(error)
      return Effect.logError(`failed to scan ${opts.scope} skills`, { dir: root, error: error }).pipe(
        Effect.as([] as string[]),
      )
    }),
  )

  for (const match of matches) {
    state.matches.add(match)
    state.dirs.add(path.dirname(match))
  }
})

const discoverSkills = Effect.fnUntraced(function* (
  config: Config.Interface,
  discovery: Discovery.Interface,
  fsys: FSUtil.Interface,
  global: Global.Interface,
  disableExternalSkills: boolean,
  disableClaudeCodeSkills: boolean,
  directory: string,
  worktree: string,
) {
  const state: ScanState = { matches: new Set(), dirs: new Set() }

  const externalDirs: string[] = []
  if (!disableExternalSkills) {
    if (!disableClaudeCodeSkills) externalDirs.push(CLAUDE_EXTERNAL_DIR)
    externalDirs.push(AGENTS_EXTERNAL_DIR)

    for (const dir of externalDirs) {
      const root = path.join(global.home, dir)
      if (!(yield* fsys.isDir(root))) continue
      yield* scan(state, root, EXTERNAL_SKILL_PATTERN, { dot: true, scope: "global" })
    }

    const upDirs = yield* fsys
      .up({ targets: externalDirs, start: directory, stop: worktree })
      .pipe(Effect.catch(() => Effect.succeed([] as string[])))

    for (const root of upDirs) {
      yield* scan(state, root, EXTERNAL_SKILL_PATTERN, { dot: true, scope: "project" })
    }
  }

  const configDirs = yield* config.directories()
  for (const dir of configDirs) {
    yield* scan(state, dir, OPENCODE_SKILL_PATTERN)
  }

  const cfg = yield* config.get()
  for (const item of cfg.skills?.paths ?? []) {
    const expanded = item.startsWith("~/") ? path.join(global.home, item.slice(2)) : item
    const dir = path.isAbsolute(expanded) ? expanded : path.join(directory, expanded)
    if (!(yield* fsys.isDir(dir))) {
      yield* Effect.logWarning("skill path not found", { path: dir })
      continue
    }

    yield* scan(state, dir, SKILL_PATTERN)
  }

  for (const url of cfg.skills?.urls ?? []) {
    const pulledDirs = yield* discovery.pull(url)
    for (const dir of pulledDirs) {
      yield* scan(state, dir, SKILL_PATTERN)
    }
  }

  return {
    matches: Array.from(state.matches),
    dirs: Array.from(state.dirs),
  }
})

const loadSkills = Effect.fnUntraced(function* (
  state: State,
  discovered: DiscoveryState,
  events: EventV2Bridge.Service["Service"],
) {
  yield* Effect.forEach(discovered.matches.toSorted(), (match) => add(state, match, events), {
    concurrency: 1,
    discard: true,
  })
  resolveCandidates(state)

  yield* Effect.logInfo("init", { count: Object.keys(state.skills).length })
})

export class Service extends Context.Service<Service, Interface>()("@opencode/Skill") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const discovery = yield* Discovery.Service
    const config = yield* Config.Service
    const events = yield* EventV2Bridge.Service
    const fsys = yield* FSUtil.Service
    const global = yield* Global.Service
    const flags = yield* RuntimeFlags.Service
    const discovered = yield* InstanceState.make(
      Effect.fn("Skill.discovery")(function* (ctx) {
        return yield* discoverSkills(
          config,
          discovery,
          fsys,
          global,
          flags.disableExternalSkills,
          flags.disableClaudeCodeSkills,
          ctx.directory,
          ctx.worktree,
        )
      }),
    )
    const state = yield* InstanceState.make(
      Effect.fn("Skill.state")(function* () {
        const cfg = yield* config.getGlobal()
        const disabledList = cfg.xiaoxue?.skills?.disabled ?? []
        const s: State = { skills: {}, candidates: {}, dirs: new Set(), disabled: new Set(disabledList) }
        // Register the built-in skill BEFORE disk discovery so a user-disk
        // skill with the same name can override it.
        if (XiaoxueEnterprisePolicy.allowsSource("skill", "bundled")) {
          s.candidates[CUSTOMIZE_OPENCODE_SKILL_NAME] = [{
            name: CUSTOMIZE_OPENCODE_SKILL_NAME,
            description: CUSTOMIZE_OPENCODE_SKILL_DESCRIPTION,
            location: "<built-in>",
            content: CUSTOMIZE_OPENCODE_SKILL_BODY,
            source: "bundled",
            capabilities: skillCapabilities("bundled"),
            enabled: !s.disabled.has(CUSTOMIZE_OPENCODE_SKILL_NAME),
            ...initialHealth(CUSTOMIZE_OPENCODE_SKILL_NAME, CUSTOMIZE_OPENCODE_SKILL_DESCRIPTION),
          }]
        }
        yield* loadSkills(s, yield* InstanceState.get(discovered), events)
        return s
      }),
    )
    const imports = new Map<string, QuarantinedImport>()

    const get = Effect.fn("Skill.get")(function* (name: string) {
      if (!XiaoxueEnterprisePolicy.allows("skill", name)) return undefined
      const s = yield* InstanceState.get(state)
      return s.skills[name]
    })

    const require = Effect.fn("Skill.require")(function* (name: string) {
      const s = yield* InstanceState.get(state)
      const info = XiaoxueEnterprisePolicy.allows("skill", name) ? s.skills[name] : undefined
      if (info && !info.enabled) {
        return yield* new NotFoundError({ name, available: Object.keys(s.skills).toSorted() })
      }
      if (info) return info
      return yield* new NotFoundError({ name, available: Object.keys(s.skills).toSorted() })
    })

    const all = Effect.fn("Skill.all")(function* () {
      const s = yield* InstanceState.get(state)
      return yield* Effect.forEach(
        Object.values(s.skills).filter((skill) => XiaoxueEnterprisePolicy.allows("skill", skill.name)),
        (skill) => inspect(skill.name).pipe(Effect.catch(() => Effect.succeed(skill))),
      )
    })

    const dirs = Effect.fn("Skill.dirs")(function* () {
      return (yield* InstanceState.get(discovered)).dirs
    })

    const available = Effect.fn("Skill.available")(function* (agent?: Agent.Info) {
      const s = yield* InstanceState.get(state)
      const list = Object.values(s.skills)
        .filter((skill) => skill.enabled)
        .filter((skill) => XiaoxueEnterprisePolicy.allows("skill", skill.name))
        .toSorted((a, b) => a.name.localeCompare(b.name))
      if (!agent) return list
      return list.filter((skill) => Permission.evaluate("skill", skill.name, agent.permission).action !== "deny")
    })

    const create = (input: { name: string; description?: string; content?: string }) =>
      Effect.gen(function* () {
        const name = yield* requireSkillName(input.name)
        const s = yield* InstanceState.get(state)
        if (s.skills[name]) {
          return yield* new ConflictError({
            skill: name,
            conflictsWith: [s.skills[name].location],
            message: `Skill "${name}" already exists`,
          })
        }
        const userSkillsDir = yield* requireUserSkillDirectory(name)
        const skillPath = path.join(userSkillsDir, "SKILL.md")
        if (yield* fsys.existsSafe(skillPath)) {
          return yield* new InvalidError({ path: skillPath, message: `Skill file already exists for "${name}"` })
        }
        const matter = yield* Effect.tryPromise({
          try: () => import("gray-matter"),
          catch: (cause) => new InvalidError({ path: skillPath, message: `Failed to load Skill serializer: ${String(cause)}` }),
        })
        const body = input.content ?? `# ${name}\n\nDescribe this skill here.`
        const fileContent = yield* Effect.try({
          try: () => {
            const serialized = matter.default.stringify(body, {
              name,
              ...(input.description === undefined ? {} : { description: input.description }),
            })
            const verified = matter.default(serialized)
            if (!isSkillFrontmatter(verified.data) || verified.data.name !== name) throw new Error("verification failed")
            return serialized
          },
          catch: (cause) =>
            new InvalidError({ path: skillPath, message: `Failed to serialize Skill "${name}": ${String(cause)}` }),
        })
        yield* fsys.ensureDir(userSkillsDir)
        yield* fsys.writeFileString(skillPath, fileContent, { flag: "wx" })
        const info: Info = {
          name,
          description: input.description,
          location: skillPath,
          content: body,
          source: "user",
          capabilities: skillCapabilities("user"),
          enabled: true,
          ...initialHealth(name, input.description),
        }
        s.skills[name] = info
        s.candidates[name] = [info]
        s.dirs.add(userSkillsDir)
        return info
      })

    const previewImport = (source: string) => {
      const token = crypto.randomUUID()
      const quarantineRoot = path.join(Global.Path.config, ".skill-import-quarantine")
      const quarantine = path.join(quarantineRoot, token)
      return Effect.gen(function* () {
        const expired = Array.from(imports.entries()).filter(([, item]) => item.preview.expiresAt <= Date.now())
        for (const [token, item] of expired) {
          imports.delete(token)
          yield* Effect.tryPromise({
            try: () => import("node:fs/promises").then((fs) => fs.rm(item.quarantine, { recursive: true, force: true })),
            catch: () => undefined,
          }).pipe(Effect.ignore)
        }
        yield* Effect.tryPromise({
          try: () => cleanupImportQuarantine(quarantineRoot),
          catch: (cause) => new ImportError({ source, message: `Failed to clean the Skill import quarantine: ${String(cause)}` }),
        })
        const candidate = yield* Effect.tryPromise({
          try: () => quarantineLocalSkill(source, quarantine),
          catch: (cause) => new ImportError({ source, message: `Skill import quarantine failed: ${String(cause)}` }),
        })
        const matter = yield* Effect.tryPromise({
          try: () => import("gray-matter"),
          catch: (cause) => new ImportError({ source, message: `Failed to load Skill parser: ${String(cause)}` }),
        })
        const parsed = yield* Effect.try({
          try: () => matter.default(candidate.manifest),
          catch: (cause) => new ImportError({ source, message: `Invalid SKILL.md: ${String(cause)}` }),
        })
        if (!isSkillFrontmatter(parsed.data)) {
          return yield* new ImportError({ source, message: "SKILL.md must contain a valid name and optional string description" })
        }
        const name = yield* requireSkillName(parsed.data.name)
        const s = yield* InstanceState.get(state)
        const conflicts = s.skills[name] ? [s.skills[name].location] : []
        const risks = auditImportFiles(candidate.files)
        const preview: SkillImportPreview = {
          token,
          name,
          description: parsed.data.description,
          format: candidate.format,
          sha256: candidate.hash,
          fileCount: candidate.files.length,
          totalBytes: candidate.files.reduce((total, file) => total + file.bytes.byteLength, 0),
          expiresAt: Date.now() + IMPORT_PREVIEW_TTL_MS,
          risks,
          conflicts,
          canInstall: conflicts.length === 0 && !risks.some((risk) => risk.level === "error"),
        }
        imports.set(token, { preview, quarantine, skillRoot: candidate.skillRoot, content: parsed.content })
        return preview
      }).pipe(
        Effect.tapError(() =>
          Effect.tryPromise({
            try: () => import("node:fs/promises").then((fs) => fs.rm(quarantine, { recursive: true, force: true })),
            catch: () => undefined,
          }).pipe(Effect.ignore),
        ),
      )
    }

    const importSkill = (token: string) =>
      Effect.gen(function* () {
        const candidate = imports.get(token)
        if (!candidate) return yield* new ImportError({ source: token, message: "Import preview token is unknown or already used" })
        if (candidate.preview.expiresAt <= Date.now()) {
          imports.delete(token)
          return yield* new ImportError({ source: token, message: "Import preview expired; run the security preview again" })
        }
        if (candidate.preview.risks.some((risk) => risk.level === "error")) {
          return yield* new ImportError({ source: token, message: "Import is blocked by security errors in the preview" })
        }
        const s = yield* InstanceState.get(state)
        const conflict = s.skills[candidate.preview.name]
        if (conflict) {
          return yield* new ConflictError({
            skill: candidate.preview.name,
            conflictsWith: [conflict.location],
            message: `Skill "${candidate.preview.name}" already exists`,
          })
        }
        const target = yield* requireUserSkillDirectory(candidate.preview.name)
        const staging = `${target}.import-${token}.tmp`
        yield* Effect.tryPromise({
          try: async () => {
            const fs = await import("node:fs/promises")
            await fs.mkdir(path.dirname(target), { recursive: true })
            await fs.cp(candidate.skillRoot, staging, { recursive: true, errorOnExist: true, force: false })
            await fs.rename(staging, target)
          },
          catch: (cause) => new ImportError({ source: token, message: `Atomic Skill installation failed: ${String(cause)}` }),
        }).pipe(
          Effect.catch((error) =>
            Effect.tryPromise({
              try: () => import("node:fs/promises").then((fs) => fs.rm(staging, { recursive: true, force: true })),
              catch: () => undefined,
            }).pipe(Effect.ignore, Effect.andThen(Effect.fail(error))),
          ),
        )
        const info: Info = {
          name: candidate.preview.name,
          description: candidate.preview.description,
          location: path.join(target, "SKILL.md"),
          content: candidate.content,
          source: "user",
          capabilities: skillCapabilities("user"),
          enabled: true,
          ...initialHealth(candidate.preview.name, candidate.preview.description),
        }
        s.skills[info.name] = info
        s.candidates[info.name] = [info]
        s.dirs.add(target)
        imports.delete(token)
        yield* Effect.tryPromise({
          try: () => import("node:fs/promises").then((fs) => fs.rm(candidate.quarantine, { recursive: true, force: true })),
          catch: () => undefined,
        }).pipe(Effect.ignore)
        return info
      })

    const update = (name: string, patch: { name?: string; description?: string }) =>
      Effect.gen(function* () {
        const currentName = yield* requireSkillName(name)
        const nextName = patch.name === undefined ? currentName : yield* requireSkillName(patch.name)
        const s = yield* InstanceState.get(state)
        const info = s.skills[currentName]
        if (!info) return yield* new NotFoundError({ name: currentName, available: Object.keys(s.skills).toSorted() })
        const source = skillSource(info.location)
        if (source === "bundled" || source === "remote") {
          return yield* new ReadOnlyError({
            name: currentName,
            source,
            message: `Cannot edit ${source} skill "${currentName}"`,
          })
        }
        if (nextName !== currentName && s.skills[nextName]) {
          return yield* new ConflictError({
            skill: currentName,
            conflictsWith: [s.skills[nextName].location],
            message: `Skill "${nextName}" already exists`,
          })
        }
        const original = yield* fsys.readFileString(info.location)
        const matter = yield* Effect.tryPromise({
          try: () => import("gray-matter"),
          catch: (cause) =>
            new InvalidError({ path: info.location, message: `Failed to load Skill serializer: ${String(cause)}` }),
        })
        const parsed = yield* Effect.try({
          try: () => {
            try {
              return matter.default(original)
            } catch {
              return matter.default(ConfigMarkdown.fallbackSanitization(original))
            }
          },
          catch: (cause) =>
            new InvalidError({ path: info.location, message: `Failed to parse Skill "${currentName}": ${String(cause)}` }),
        })
        if (!isSkillFrontmatter(parsed.data)) {
          return yield* new InvalidError({ path: info.location, message: `Skill "${currentName}" has invalid frontmatter` })
        }
        if (parsed.data.name !== currentName) {
          return yield* new NameMismatchError({
            path: info.location,
            expected: currentName,
            actual: parsed.data.name,
          })
        }
        parsed.data.name = nextName
        if (patch.description !== undefined) parsed.data.description = patch.description
        const serialized = yield* Effect.try({
          try: () => {
            const content = matter.default.stringify(parsed.content, parsed.data)
            const verified = matter.default(content)
            if (!isSkillFrontmatter(verified.data) || verified.data.name !== nextName) throw new Error("verification failed")
            return content
          },
          catch: (cause) =>
            new InvalidError({ path: info.location, message: `Failed to serialize Skill "${nextName}": ${String(cause)}` }),
        })
        yield* atomicWrite(fsys, info.location, serialized)

        const nextDisabled = new Set(s.disabled)
        if (nextName !== currentName && nextDisabled.has(currentName)) {
          nextDisabled.delete(currentName)
          nextDisabled.add(nextName)
          const persisted = yield* config
            .updateGlobal({ xiaoxue: { skills: { disabled: Array.from(nextDisabled).toSorted() } } })
            .pipe(
              Effect.catch((error) =>
                atomicWrite(fsys, info.location, original).pipe(
                  Effect.andThen(Effect.fail(error)),
                ),
              ),
            )
          nextDisabled.clear()
          for (const disabled of persisted.info.xiaoxue?.skills?.disabled ?? []) nextDisabled.add(disabled)
        }

        const updated: Info = {
          ...info,
          name: nextName,
          description: parsed.data.description,
          content: parsed.content,
          enabled: !nextDisabled.has(nextName),
        }
        if (nextName !== currentName) {
          delete s.skills[currentName]
          delete s.candidates[currentName]
          s.skills[nextName] = updated
          s.candidates[nextName] = [updated]
          s.disabled = nextDisabled
          for (const [key, item] of Object.entries(s.skills)) {
            s.skills[key] = { ...item, enabled: !s.disabled.has(item.name) }
          }
          return s.skills[nextName]
        }
        s.skills[currentName] = updated
        s.candidates[currentName] = [updated]
        return updated
      })

    const remove = (name: string) =>
      Effect.gen(function* () {
        const s = yield* InstanceState.get(state)
        const info = s.skills[name]
        if (!info) return yield* new NotFoundError({ name, available: Object.keys(s.skills).toSorted() })
        const source = skillSource(info.location)
        if (source === "bundled" || source === "remote") {
          return yield* new ReadOnlyError({ name, source, message: `Cannot remove ${source} skill "${name}"` })
        }
        yield* Effect.tryPromise({
          try: () => import("node:fs/promises").then((fs) => fs.rm(info.location, { force: true })),
          catch: () => new Error("delete failed"),
        })
        delete s.skills[name]
        delete s.candidates[name]
        s.disabled.delete(name)
        yield* writeDisabled(s.disabled)
      })

    const refresh = () =>
      Effect.gen(function* () {
        const cfg = yield* config.getGlobal()
        const disabledList = cfg.xiaoxue?.skills?.disabled ?? []
        const s: State = {
          skills: {},
          candidates: {},
          dirs: new Set(),
          disabled: new Set(disabledList),
        }
        if (XiaoxueEnterprisePolicy.allowsSource("skill", "bundled")) {
          s.candidates[CUSTOMIZE_OPENCODE_SKILL_NAME] = [{
            name: CUSTOMIZE_OPENCODE_SKILL_NAME,
            description: CUSTOMIZE_OPENCODE_SKILL_DESCRIPTION,
            location: "<built-in>",
            content: CUSTOMIZE_OPENCODE_SKILL_BODY,
            source: "bundled",
            capabilities: skillCapabilities("bundled"),
            enabled: !s.disabled.has(CUSTOMIZE_OPENCODE_SKILL_NAME),
            ...initialHealth(CUSTOMIZE_OPENCODE_SKILL_NAME, CUSTOMIZE_OPENCODE_SKILL_DESCRIPTION),
          }]
        }
        yield* loadSkills(s, yield* InstanceState.get(discovered), events)
        const current = yield* InstanceState.get(state)
        for (const key of Object.keys(current.skills)) delete current.skills[key]
        for (const key of Object.keys(current.candidates)) delete current.candidates[key]
        for (const key of Object.keys(s.skills)) current.skills[key] = s.skills[key]
        for (const key of Object.keys(s.candidates)) current.candidates[key] = s.candidates[key]
        for (const dir of s.dirs) current.dirs.add(dir)
        current.disabled = s.disabled
      })

    const writeDisabled = (next: Set<string>) =>
      Effect.gen(function* () {
        const sorted = Array.from(next).toSorted()
        const result = yield* config.updateGlobal({
          xiaoxue: { skills: { disabled: sorted } },
        })
        const s = yield* InstanceState.get(state)
        s.disabled = new Set(result.info.xiaoxue?.skills?.disabled ?? [])
        for (const [key, item] of Object.entries(s.skills)) {
          s.skills[key] = { ...item, enabled: !s.disabled.has(item.name) }
        }
      })

    const enable = (name: string) =>
      Effect.gen(function* () {
        const s = yield* InstanceState.get(state)
        const info = s.skills[name]
        if (!info) return yield* new NotFoundError({ name, available: Object.keys(s.skills).toSorted() })
        if (!s.disabled.has(name)) return info
        s.disabled.delete(name)
        yield* writeDisabled(s.disabled)
        const updated: Info = { ...info, enabled: true }
        s.skills[name] = updated
        return updated
      })

    const disable = (name: string) =>
      Effect.gen(function* () {
        const s = yield* InstanceState.get(state)
        const info = s.skills[name]
        if (!info) return yield* new NotFoundError({ name, available: Object.keys(s.skills).toSorted() })
        if (!info.capabilities.enableable) {
          return yield* new InvalidError({ path: info.location, message: `Cannot disable ${info.source} skill "${name}"` })
        }
        if (s.disabled.has(name)) return info
        s.disabled.add(name)
        yield* writeDisabled(s.disabled)
        const updated: Info = { ...info, enabled: false }
        s.skills[name] = updated
        return updated
      })

    const validate = (name: string) =>
      Effect.gen(function* () {
        const s = yield* InstanceState.get(state)
        const info = s.skills[name]
        if (!info) return yield* new NotFoundError({ name, available: Object.keys(s.skills).toSorted() })
        const diagnostics: SkillDiagnostic[] = []
        if (!info.description) {
          diagnostics.push({ level: "warning", code: "SKILL_NO_DESCRIPTION", message: `Skill "${name}" has no description` })
        }
        const candidates = s.candidates[name] ?? [info]
        const winnerPriority = sourcePriority(info.source)
        const competingWinners = candidates.filter((candidate) => sourcePriority(candidate.source) === winnerPriority)
        if (competingWinners.length > 1) {
          diagnostics.push({
            level: "error",
            code: "SKILL_SOURCE_CONFLICT",
            message: `Skill "${name}" has ${competingWinners.length} candidates at the winning priority: ${competingWinners.map((candidate) => candidate.location).join(", ")}`,
          })
        }
        const overridden = candidates.filter((candidate) => candidate.location !== info.location)
        if (overridden.length > 0 && competingWinners.length === 1) {
          diagnostics.push({
            level: "info",
            code: "SKILL_SOURCE_OVERRIDE",
            message: `Selected ${info.source} skill "${name}" over: ${overridden.map((candidate) => `${candidate.source}:${candidate.location}`).join(", ")}`,
          })
        }
        if (info.location !== "<built-in>" && !(yield* fsys.existsSafe(info.location))) {
          diagnostics.push({ level: "error", code: "SKILL_FILE_MISSING", message: `Skill file is missing: ${info.location}` })
        }
        if (diagnostics.length === 0) {
          diagnostics.push({ level: "info", code: "SKILL_HEALTHY", message: "Skill is healthy" })
        }
        return diagnostics
      })

    const health = (name: string) =>
      Effect.gen(function* () {
        const diagnostics = yield* validate(name)
        if (diagnostics.some((d) => d.level === "error")) return "error" as SkillHealth
        if (diagnostics.some((d) => d.level === "warning")) return "warning" as SkillHealth
        return "healthy" as SkillHealth
      })

    const inspect = Effect.fn("Skill.inspect")(function* (name: string) {
      const s = yield* InstanceState.get(state)
      const info = s.skills[name]
      if (!info) return yield* new NotFoundError({ name, available: Object.keys(s.skills).toSorted() })
      const diagnostics = yield* validate(name)
      const health: SkillHealth = diagnostics.some((item) => item.level === "error")
        ? "error"
        : diagnostics.some((item) => item.level === "warning")
          ? "warning"
          : "healthy"
      return { ...info, health, diagnostics }
    })

    const conflicts = () =>
      Effect.gen(function* () {
        const s = yield* InstanceState.get(state)
        const result: SkillConflict[] = []
        for (const [name, candidates] of Object.entries(s.candidates)) {
          const enabled = candidates.filter((candidate) => candidate.enabled)
          if (enabled.length < 2) continue
          const winner = s.skills[name]
          const winnerPriority = sourcePriority(winner.source)
          const realConflict = enabled.filter((candidate) => sourcePriority(candidate.source) === winnerPriority).length > 1
          result.push({
            skill: name,
            winner: {
              location: winner.location,
              source: winner.source,
              priority: winnerPriority,
              selected: true,
            },
            candidates: enabled.map((candidate) => ({
              location: candidate.location,
              source: candidate.source,
              priority: sourcePriority(candidate.source),
              selected: candidate.location === winner.location,
            })),
            conflictsWith: enabled.filter((candidate) => candidate.location !== winner.location).map((candidate) => candidate.location),
            severity: realConflict ? "error" : "info",
            override: !realConflict,
            realConflict,
            reason: realConflict
              ? `Multiple ${winner.source} skills named "${name}" share the winning priority`
              : `${winner.source} skill "${name}" overrides lower-priority candidates`,
          })
        }
        return result
      })

    return Service.of({ get, require, all, inspect, dirs, available, create, previewImport, import: importSkill, update, remove, refresh, enable, disable, validate, health, conflicts })
  }),
)

export function fmt(list: Info[], opts: { verbose: boolean }) {
  const described = list.filter((skill) => skill.description !== undefined)
  if (described.length === 0) return "No skills are currently available."
  if (opts.verbose) {
    return [
      "<available_skills>",
      ...described
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .flatMap((skill) => [
          "  <skill>",
          `    <name>${skill.name}</name>`,
          `    <description>${skill.description}</description>`,
          `    <location>${escapeHtml(skill.location)}</location>`,
          "  </skill>",
        ]),
      "</available_skills>",
    ].join("\n")
  }

  return [
    "## Available Skills",
    ...described
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((skill) => `- **${skill.name}**: ${skill.description}`),
  ].join("\n")
}

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [Discovery.node, Config.node, EventV2Bridge.node, FSUtil.node, Global.node, RuntimeFlags.node],
})

// Bundled and remote skills ship from upstream sources and must never be
// edited or removed through the user-facing CRUD. They can still be disabled
// so the user can opt out without touching the source-of-truth files.
export function skillCapabilities(source: SkillSource): SkillCapabilities {
  if (source === "bundled" || source === "remote") {
    return { editable: false, removable: false, enableable: true }
  }
  return { editable: true, removable: true, enableable: true }
}

function initialHealth(name: string, description?: string): Pick<Info, "health" | "diagnostics"> {
  if (description) {
    return {
      health: "healthy",
      diagnostics: [{ level: "info", code: "SKILL_HEALTHY", message: "Skill is healthy" }],
    }
  }
  return {
    health: "warning",
    diagnostics: [{ level: "warning", code: "SKILL_NO_DESCRIPTION", message: `Skill "${name}" has no description` }],
  }
}

function skillSource(location: string) {
  const normalized = path.resolve(location)
  const bundled = process.env.XIAOXUE_BUNDLED_SKILLS_DIR?.trim()
  if (bundled && FSUtil.contains(path.resolve(bundled), normalized)) return "bundled"
  if (FSUtil.contains(path.join(Global.Path.cache, "skills"), normalized)) return "remote"
  if (
    FSUtil.contains(Global.Path.config, normalized) ||
    FSUtil.contains(path.join(Global.Path.home, ".xiaoxue", "skills"), normalized) ||
    FSUtil.contains(path.join(Global.Path.home, ".agents"), normalized) ||
    FSUtil.contains(path.join(Global.Path.home, ".claude"), normalized)
  ) {
    return "user"
  }
  return "project"
}

// Re-exported so tests and other domain code can classify a skill's source
// without reaching into the private helper.
export { skillSource }

export * as Skill from "."
