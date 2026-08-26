import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises"
import { cpus, release, tmpdir, totalmem } from "node:os"
import { basename, join, resolve } from "node:path"
import { parseArgs } from "node:util"
import puppeteer, { type Browser, type Page } from "puppeteer-core"
import { evaluateDesktopAc02, type GateCheckpoint } from "./evaluation"

const parsed = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    turns: { type: "string", default: "1000" },
    seed: { type: "string", default: "20260826" },
    output: { type: "string", default: "../../docs/next-version/evidence" },
    "keep-profile": { type: "boolean", default: false },
  },
  strict: true,
})
const turns = requireInteger(parsed.values.turns, "--turns")
const seed = requireInteger(parsed.values.seed, "--seed")
if (turns !== 1_000) throw new Error("Desktop AC02 requires exactly 1000 turns")

const desktop = resolve(import.meta.dir, "../..")
const repository = resolve(desktop, "../..")
const output = resolve(desktop, parsed.values.output)
process.env.NO_PROXY = loopbackNoProxy(process.env.NO_PROXY)
process.env.no_proxy = loopbackNoProxy(process.env.no_proxy)
const profile = await mkdtemp(join(tmpdir(), "opencode-desktop-ac02-"))
const workspace = join(profile, "workspace")
const electronPath = join(desktop, "node_modules", "electron", "dist", "electron.exe")
const entry = join(desktop, "out", "main", "index.js")
const checkpoints = new Set([0, 100, 250, 500, 750, 1_000])
const measurements: Array<{ turn: number; admittedMs: number; firstTokenMs: number; completionMs: number }> = []
const firstTokenAt = new Map<number, number>()
const requests: Array<{ turn: number | null; title: boolean; at: number }> = []
const stateSnapshots: Array<ReturnType<typeof stateSnapshot> extends Promise<infer T> ? T : never> = []
const memorySnapshots: Array<ReturnType<typeof memorySnapshot> extends Promise<infer T> ? T : never> = []
const rendererSnapshots: Array<ReturnType<typeof rendererSnapshot> extends Promise<infer T> ? T : never> = []
type Runtime = {
  browser: Browser
  process: ReturnType<typeof Bun.spawn>
  mainPid: number
}

let application: Runtime | undefined
let server: ReturnType<typeof Bun.serve> | undefined
let sessionID = ""
let restart = {
  before: { mainPid: 0, rendererPid: 0, rendererPeakBytes: 0 },
  after: { mainPid: 0, rendererPid: 0, rendererBytes: 0 },
  fullUsableReopenMs: 0,
  backendReopened: false,
  rendererReopened: false,
  reopened: false,
  backendContinued: false,
  continued: false,
}
let draftLifecycle: Record<string, unknown> = {}
let traversal = { seenMessageIDs: 0, reachedStart: false, durationMs: 0 }

await Promise.all([
  mkdir(workspace, { recursive: true }),
  mkdir(output, { recursive: true }),
  mkdir(join(profile, "config", "opencode"), { recursive: true }),
])

try {
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      if (new URL(request.url).pathname !== "/v1/chat/completions") return new Response("Not found", { status: 404 })
      const body = await request.json()
      const serialized = JSON.stringify(body)
      const title = serialized.includes("Generate a title for this conversation")
      const matches = [...serialized.matchAll(new RegExp(`turn:(\\d{4}):seed:${seed}`, "g"))]
      const turn = title ? null : Number(matches.at(-1)?.[1] ?? 0)
      requests.push({ turn, title, at: performance.now() })
      const text = title ? "Desktop AC02" : turn ? expectedReply(turn) : "draft-lifecycle-reply"
      const created = Math.floor(Date.now() / 1_000)
      const id = `chatcmpl-desktop-ac02-${turn ?? "title"}-${randomUUID()}`
      const chunks = [
        {
          id,
          object: "chat.completion.chunk",
          created,
          model: "test-model",
          choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
        },
        {
          id,
          object: "chat.completion.chunk",
          created,
          model: "test-model",
          choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
        },
        {
          id,
          object: "chat.completion.chunk",
          created,
          model: "test-model",
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      ]
      const stream = new ReadableStream({
        start(controller) {
          chunks.forEach((chunk, index) => {
            if (index === 1 && turn) firstTokenAt.set(turn, performance.now())
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`))
          })
          controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"))
          controller.close()
        },
      })
      return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } })
    },
  })

  const config = {
    formatter: false,
    lsp: false,
    model: "test/test-model",
    provider: {
      test: {
        name: "Desktop AC02 deterministic provider",
        id: "test",
        env: [],
        npm: "@ai-sdk/openai-compatible",
        models: {
          "test-model": {
            id: "test-model",
            name: "Desktop AC02",
            attachment: false,
            reasoning: false,
            temperature: false,
            tool_call: true,
            release_date: "2025-01-01",
            limit: { context: 100_000_000, output: 4_096 },
            cost: { input: 0, output: 0 },
            options: {},
          },
        },
        options: { apiKey: "desktop-ac02", baseURL: `http://127.0.0.1:${server.port}/v1` },
      },
    },
    providers: {
      test: {
        name: "Desktop AC02 deterministic provider",
        env: [],
        api: {
          type: "aisdk",
          package: "@ai-sdk/openai-compatible",
          url: `http://127.0.0.1:${server.port}/v1`,
        },
        request: { body: { apiKey: "desktop-ac02" } },
        models: {
          "test-model": {
            name: "Desktop AC02",
            api: {
              id: "test-model",
              type: "aisdk",
              package: "@ai-sdk/openai-compatible",
              url: `http://127.0.0.1:${server.port}/v1`,
            },
            limit: { context: 100_000_000, output: 4_096 },
          },
        },
      },
    },
  }
  const environment = {
    ...process.env,
    OPENCODE_DESKTOP_TEST_ROOT: profile,
    OPENCODE_CONFIG_DIR: join(profile, "config", "opencode"),
    OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
    OPENCODE_DISABLE_AUTOUPDATE: "true",
    OPENCODE_DISABLE_LSP_DOWNLOAD: "true",
    NO_COLOR: "1",
  }
  await Bun.write(
    join(profile, "config", "opencode", "opencode.json"),
    JSON.stringify({
      formatter: config.formatter,
      lsp: config.lsp,
      model: config.model,
      providers: config.providers,
    }),
  )

  application = await launch(environment)
  let page = await mainPage(application)
  let initialization = await initialize(page)
  await collectCheckpoint(application, page, initialization, 0)

  draftLifecycle = {
    status: "UNAVAILABLE",
    reason:
      "The current Desktop composer uses the legacy session/message path and cannot create or reopen a SessionV2-backed draft.",
  }

  const created = await api(page, initialization, "/api/session", {
    method: "POST",
    body: JSON.stringify({
      agent: "xiaoxue",
      model: { id: "test-model", providerID: "test" },
      location: { directory: workspace },
    }),
  })
  const createdSession = object(created) && object(created.data) ? created.data : created
  if (!object(createdSession) || typeof createdSession.id !== "string") throw new Error("V2 session create failed")
  sessionID = createdSession.id

  for (let turn = 1; turn <= turns; turn++) {
    const promptStarted = performance.now()
    const admittedStarted = performance.now()
    await api(page, initialization, `/api/session/${encodeURIComponent(sessionID)}/prompt`, {
      method: "POST",
      body: JSON.stringify({ prompt: { text: expectedPrompt(turn), files: [], agents: [] } }),
    })
    const admittedMs = performance.now() - admittedStarted
    await waitForTurn(page, initialization, sessionID, turn)
    measurements.push(measurement(turn, promptStarted, admittedStarted, admittedMs))

    if (!checkpoints.has(turn)) continue
    await waitForMessages(page, initialization, sessionID, turn * 2)
    await collectCheckpoint(application, page, initialization, turn)

    if (turn !== 500) continue
    const before = memorySnapshots.at(-1)!
    restart.before = {
      mainPid: before.mainPid,
      rendererPid: before.rendererPid,
      rendererPeakBytes: before.rendererPeakBytes,
    }
    await close(application, page)
    application = undefined
    const reopenStarted = performance.now()
    application = await launch(environment)
    page = await mainPage(application)
    initialization = await initialize(page)
    const reopenedMessages = await allMessages(page, initialization, sessionID)
    restart.backendReopened = reopenedMessages.length === 1_000
    restart.rendererReopened = await waitForText(page, expectedReply(500), 5_000).then(
      () => true,
      () => false,
    )
    restart.fullUsableReopenMs = restart.rendererReopened
      ? performance.now() - reopenStarted
      : Math.max(5_001, performance.now() - reopenStarted)
    restart.reopened = restart.backendReopened && restart.rendererReopened
    await collectCheckpoint(application, page, initialization, 500, "after-restart")
    const after = memorySnapshots.at(-1)!
    restart.after = {
      mainPid: after.mainPid,
      rendererPid: after.rendererPid,
      rendererBytes: after.rendererMedianBytes,
    }
  }

  restart.backendContinued = (await allMessages(page, initialization, sessionID)).length === 2_000
  const finalRenderer = await rendererSnapshot(page, 1_000, "final")
  rendererSnapshots.push(finalRenderer)
  restart.continued = restart.backendContinued && finalRenderer.latestExpectedVisible
  traversal = {
    seenMessageIDs: finalRenderer.v2MessageCount,
    reachedStart: finalRenderer.v2MessageCount === 2_000,
    durationMs: 0,
  }
  const messages = await allMessages(page, initialization, sessionID)
  const users = messages.filter((message) => message.type === "user")
  const assistants = messages.filter((message) => message.type === "assistant")
  const userTexts = users.map((message) => String(message.text ?? ""))
  const assistantTexts = assistants.map((message) =>
    Array.isArray(message.content)
      ? message.content
          .filter((part): part is Record<string, unknown> => object(part) && part.type === "text")
          .map((part) => String(part.text ?? ""))
          .join("")
      : "",
  )
  const expectedUsers = Array.from({ length: turns }, (_, index) => expectedPrompt(index + 1))
  const expectedAssistants = Array.from({ length: turns }, (_, index) => expectedReply(index + 1))
  const integrity = {
    expectedMessages: turns * 2,
    actualMessages: messages.length,
    userMessages: users.length,
    assistantMessages: assistants.length,
    lost:
      expectedUsers.filter((text) => !userTexts.includes(text)).length +
      expectedAssistants.filter((text) => !assistantTexts.includes(text)).length,
    duplicate: users.length - new Set(userTexts).size + assistants.length - new Set(assistantTexts).size,
    corrupt:
      userTexts.filter((text, index) => text !== expectedUsers[index]).length +
      assistantTexts.filter((text, index) => text !== expectedAssistants[index]).length,
    unfinished: assistants.filter((message) => !object(message.time) || typeof message.time.completed !== "number")
      .length,
  }
  const gateCheckpoints = stateSnapshots
    .map((state) => {
      const memory = memorySnapshots.find((item) => item.turn === state.turn && item.phase === state.phase)!
      return {
        turn: state.turn,
        state: {
          globalBytes: state.global.sizeBytes,
          workspaceBytes: state.workspace.sizeBytes,
          draftBytes: state.draft.sizeBytes,
          orphanDrafts: state.draft.orphanCountKnown ? state.draft.orphanCount : 0,
          semanticAmplification: state.semanticAmplification,
        },
        memory: {
          rendererMedianBytes: memory.rendererMedianBytes,
          rendererPeakBytes: memory.rendererPeakBytes,
          mainMedianBytes: memory.mainMedianBytes,
          mainPeakBytes: memory.mainPeakBytes,
        },
      } satisfies GateCheckpoint
    })
    .filter((item, index, values) => values.findIndex((other) => other.turn === item.turn) === index)
  const firstTokens = measurements.map((item) => item.firstTokenMs).toSorted((a, b) => a - b)
  const firstTokenP95Ms = firstTokens[Math.ceil(firstTokens.length * 0.95) - 1] ?? 0
  const gate = evaluateDesktopAc02({
    checkpoints: gateCheckpoints,
    integrity,
    restart: {
      mainPidChanged: restart.before.mainPid !== restart.after.mainPid,
      rendererPidChanged: restart.before.rendererPid !== restart.after.rendererPid,
      reopened: restart.reopened,
      continued: restart.continued,
      fullUsableReopenMs: restart.fullUsableReopenMs,
      preRestartRendererPeakBytes: restart.before.rendererPeakBytes,
      postRestartRendererBytes: restart.after.rendererBytes,
    },
    firstTokenP95Ms,
  })
  gate.failures.push("DRAFT_LIFECYCLE_UNAVAILABLE")
  if (traversal.seenMessageIDs !== 2_000 || !traversal.reachedStart) gate.failures.push("RENDERER_FULL_TIMELINE")
  const result = gate.failures.length ? "FAIL" : "PASS"
  const common = {
    version: 1,
    harness: "desktop-electron-session-v2-ac02",
    commit: await gitHead(),
    generatedAt: new Date().toISOString(),
    environment: {
      platform: process.platform,
      arch: process.arch,
      osRelease: release(),
      cpu: cpus()[0]?.model ?? "UNKNOWN",
      logicalCpuCount: cpus().length,
      totalMemoryBytes: totalmem(),
      bun: Bun.version,
      electron: "42.3.3",
    },
    seed,
    turns,
    sessionID,
    profile,
    provider: { kind: "local-openai-compatible-deterministic", requests: requests.length, port: server.port },
  }
  const report = {
    ...common,
    result,
    gate,
    integrity,
    restart,
    draftLifecycle,
    rendererTraversal: traversal,
    rendererProjection: rendererSnapshots,
    checkpoints: stateSnapshots.map((state) => ({
      turn: state.turn,
      phase: state.phase,
      state,
      memory: memorySnapshots.find((item) => item.turn === state.turn && item.phase === state.phase),
    })),
    latency: { firstTokenP95Ms, measurements },
  }
  await Promise.all([
    Bun.write(join(output, "b1b-desktop-1000.json"), JSON.stringify(report, null, 2)),
    Bun.write(
      join(output, "b1b-desktop-state-growth.json"),
      JSON.stringify(
        {
          ...common,
          result,
          gate: { delta: gate.delta, halves: gate.halves },
          draftLifecycle,
          checkpoints: stateSnapshots,
        },
        null,
        2,
      ),
    ),
    Bun.write(
      join(output, "b1b-desktop-memory.json"),
      JSON.stringify({ ...common, result, restart, firstTokenP95Ms, checkpoints: memorySnapshots }, null, 2),
    ),
  ])
  console.log(JSON.stringify({ result, output, profile, integrity, restart, traversal, gate }, null, 2))
  if (result === "FAIL") throw new Error(`Desktop AC02 failed; isolated profile retained at ${profile}`)
} finally {
  if (application) await close(application).catch(() => undefined)
  server?.stop(true)
  if (!parsed.values["keep-profile"] && (await Bun.file(join(output, "b1b-desktop-1000.json")).exists())) {
    const report = await Bun.file(join(output, "b1b-desktop-1000.json")).json()
    if (report.result === "PASS") await safeRemoveProfile(profile)
  }
}

async function launch(env: Record<string, string | undefined>): Promise<Runtime> {
  const port = await freePort()
  const child = Bun.spawn([electronPath, `--remote-debugging-port=${port}`, "--remote-allow-origins=*", entry], {
    cwd: desktop,
    env,
    stdout: "pipe",
    stderr: "pipe",
  })
  void pipeLogs(child.stdout, "electron:out")
  void pipeLogs(child.stderr, "electron:err")
  try {
    const version = await expectPoll(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`).catch(() => undefined)
      return response?.ok ? response.json() : undefined
    }, 60_000)
    if (!object(version) || typeof version.webSocketDebuggerUrl !== "string")
      throw new Error("Electron CDP endpoint did not publish a websocket URL")
    return {
      browser: await puppeteer.connect({ browserWSEndpoint: version.webSocketDebuggerUrl, protocolTimeout: 60_000 }),
      process: child,
      mainPid: child.pid,
    }
  } catch (error) {
    child.kill()
    await child.exited
    throw error
  }
}

async function mainPage(app: Runtime) {
  return expectPoll(
    async () => (await app.browser.pages()).find((page) => page.url().startsWith("oc://renderer")),
    60_000,
  )
}

async function initialize(page: Page) {
  await page.waitForFunction(() => typeof window.api?.awaitInitialization === "function", undefined, {
    timeout: 60_000,
  })
  return page.evaluate(() => window.api.awaitInitialization())
}

async function api(
  page: Page,
  initialization: { url: string; username: string | null; password: string | null },
  path: string,
  options: RequestInit = {},
) {
  const result = await expectPoll(
    () =>
      page
        .evaluate(
          async ({ initialization, path, options }) => {
            const token = btoa(`${initialization.username ?? ""}:${initialization.password ?? ""}`)
            const response = await fetch(`${initialization.url}${path}`, {
              ...options,
              headers: { authorization: `Basic ${token}`, "content-type": "application/json", ...options.headers },
            })
            const text = await response.text()
            return { ok: response.ok, status: response.status, text }
          },
          { initialization, path, options },
        )
        .catch(() => undefined),
    30_000,
  )
  if (!result.ok) throw new Error(`${options.method ?? "GET"} ${path} failed ${result.status}: ${result.text}`)
  return result.text ? JSON.parse(result.text) : undefined
}

async function waitForSession(page: Page, initialization: Awaited<ReturnType<typeof initialize>>) {
  return expectPoll(async () => {
    const value = await api(page, initialization, "/api/session?limit=10")
    const sessions = object(value) && Array.isArray(value.data) ? value.data : []
    const session = sessions.find((item) => object(item) && typeof item.id === "string")
    return object(session) && typeof session.id === "string" ? session.id : undefined
  }, 60_000)
}

async function waitForMessages(
  page: Page,
  initialization: Awaited<ReturnType<typeof initialize>>,
  id: string,
  count: number,
) {
  await expectPoll(
    async () => ((await allMessages(page, initialization, id)).length === count ? true : undefined),
    60_000,
  )
}

async function waitForTurn(
  page: Page,
  initialization: Awaited<ReturnType<typeof initialize>>,
  id: string,
  turn: number,
) {
  await expectPoll(async () => {
    const value = await api(page, initialization, `/api/session/${encodeURIComponent(id)}/message?limit=2&order=desc`)
    if (!object(value) || !Array.isArray(value.data)) return
    const assistant = value.data.find((message) => object(message) && message.type === "assistant")
    if (!object(assistant) || !Array.isArray(assistant.content)) return
    const text = assistant.content
      .filter((part) => object(part) && part.type === "text")
      .map((part) => String(part.text ?? ""))
      .join("")
    return text === expectedReply(turn) && object(assistant.time) && typeof assistant.time.completed === "number"
      ? true
      : undefined
  }, 60_000)
}

async function allMessages(page: Page, initialization: Awaited<ReturnType<typeof initialize>>, id: string) {
  const messages: Record<string, unknown>[] = []
  let cursor: string | undefined
  while (true) {
    const query = cursor ? `?limit=200&cursor=${encodeURIComponent(cursor)}` : "?limit=200&order=desc"
    const value = await api(page, initialization, `/api/session/${encodeURIComponent(id)}/message${query}`)
    if (!object(value) || !Array.isArray(value.data)) throw new Error("Invalid messages response")
    messages.push(...value.data.filter(object))
    const next = object(value.cursor) && typeof value.cursor.next === "string" ? value.cursor.next : undefined
    if (!next) break
    cursor = next
  }
  return messages.reverse()
}

async function collectCheckpoint(
  app: Runtime,
  page: Page,
  initialization: Awaited<ReturnType<typeof initialize>>,
  turn: number,
  phase = "normal",
) {
  const messageCount = turn ? (await allMessages(page, initialization, sessionID)).length : 0
  stateSnapshots.push(await stateSnapshot(page, turn, phase, messageCount))
  memorySnapshots.push(await memorySnapshot(app, turn, phase, messageCount))
  rendererSnapshots.push(await rendererSnapshot(page, turn, phase))
  const state = stateSnapshots.at(-1)!
  const memory = memorySnapshots.at(-1)!
  console.log(
    JSON.stringify({
      checkpoint: turn,
      phase,
      stateBytes: {
        global: state.global.sizeBytes,
        workspace: state.workspace.sizeBytes,
        draft: state.draft.sizeBytes,
      },
      memoryBytes: { main: memory.mainMedianBytes, renderer: memory.rendererMedianBytes },
    }),
  )
}

async function stateSnapshot(page: Page, turn: number, phase: string, messageCount: number) {
  const report = await page.evaluate(() => window.api.storageHealthScan())
  const global = finding(report, "global-state")
  const workspaceState = finding(report, "workspace-state")
  const draft = finding(report, "draft-state")
  const stateFiles = await readdir(join(profile, "desktop"), { withFileTypes: true }).catch(() => [])
  const files = await Promise.all(
    stateFiles
      .filter((entry) => entry.isFile() && entry.name.endsWith(".dat"))
      .map(async (entry) => {
        const path = join(profile, "desktop", entry.name)
        const info = await stat(path)
        return { path, sizeBytes: info.size, lastModified: info.mtimeMs, text: await readFile(path, "utf8") }
      }),
  )
  const transcriptReferences = files.reduce(
    (count, file) => count + [...file.text.matchAll(/turn:\d{4}:seed:\d+/g)].length,
    0,
  )
  return {
    turn,
    phase,
    messageCount,
    capturedAt: new Date().toISOString(),
    global,
    workspace: workspaceState,
    draft,
    exactFiles: files.map(({ text: _text, ...file }) => file),
    transcriptReferences,
    semanticAmplification: transcriptReferences > Math.max(4, turn * 0.05),
    storageHealth: report,
  }
}

async function memorySnapshot(app: Runtime, turn: number, phase: string, messageCount: number) {
  await new Promise((resolve) => setTimeout(resolve, 3_000))
  const samples = [] as Array<{ mainPid: number; rendererPid: number; mainBytes: number; rendererBytes: number }>
  for (let index = 0; index < 3; index++) {
    samples.push(await processMemory(app.mainPid))
    if (index < 2) await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return {
    turn,
    phase,
    messageCount,
    samples,
    mainPid: samples[0]!.mainPid,
    rendererPid: samples[0]!.rendererPid,
    mainMedianBytes: median(samples.map((sample) => sample.mainBytes)),
    mainPeakBytes: Math.max(...samples.map((sample) => sample.mainBytes)),
    rendererMedianBytes: median(samples.map((sample) => sample.rendererBytes)),
    rendererPeakBytes: Math.max(...samples.map((sample) => sample.rendererBytes)),
  }
}

async function rendererSnapshot(page: Page, turn: number, phase: string) {
  return page.evaluate(
    ({ turn, phase, seed }) => {
      const rows = [...document.querySelectorAll<HTMLElement>("[data-message-id]")]
      const texts = rows.map((element) => element.textContent ?? "")
      const v2 = texts.filter(
        (text) => text.includes(`seed:${seed}`) && (text.includes("turn:") || text.includes("reply:")),
      )
      return {
        turn,
        phase,
        mountedMessageCount: rows.length,
        v2MessageCount: v2.length,
        latestExpectedVisible: texts.some((text) =>
          text.includes(`reply:${String(turn).padStart(4, "0")}:seed:${seed}`),
        ),
      }
    },
    { turn, phase, seed },
  )
}

function measurement(
  turn: number,
  started: number,
  admittedStarted: number,
  admittedMs = performance.now() - admittedStarted,
) {
  const first = firstTokenAt.get(turn)
  if (!first) throw new Error(`No deterministic first token recorded for turn ${turn}`)
  return { turn, admittedMs, firstTokenMs: first - started, completionMs: performance.now() - started }
}

function finding(report: unknown, id: string) {
  if (!object(report) || !Array.isArray(report.findings)) throw new Error("Invalid StorageHealth report")
  const value = report.findings.find((item) => object(item) && item.id === id)
  if (!object(value)) throw new Error(`StorageHealth finding missing: ${id}`)
  return value as {
    id: string
    path: string
    discoveryStatus: string
    sizeBytes: number
    objectCount: number
    orphanCount: number
    orphanCountKnown: boolean
    largestItems: unknown[]
    lastModified: number
    errors: string[]
  }
}

async function expectPoll<T>(read: () => Promise<T | undefined>, timeout: number) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const value = await read()
    if (value !== undefined) return value
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out after ${timeout}ms`)
}

function expectedPrompt(turn: number) {
  return `turn:${String(turn).padStart(4, "0")}:seed:${seed}`
}

function expectedReply(turn: number) {
  return `reply:${String(turn).padStart(4, "0")}:seed:${seed}`
}

function median(values: number[]) {
  return values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]!
}

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object"
}

function requireInteger(value: string | undefined, name: string) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`)
  return parsed
}

function loopbackNoProxy(value: string | undefined) {
  return [...new Set([...(value ?? "").split(",").filter(Boolean), "127.0.0.1", "localhost", "::1"])].join(",")
}

async function gitHead() {
  const child = Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: repository, stdout: "pipe" })
  if ((await child.exited) !== 0) return "UNKNOWN"
  return (await new Response(child.stdout).text()).trim()
}

async function safeRemoveProfile(target: string) {
  const resolved = resolve(target)
  if (resolve(resolved, "..") !== resolve(tmpdir()))
    throw new Error(`Refusing to remove unexpected profile: ${resolved}`)
  if (!basename(resolved).startsWith("opencode-desktop-ac02-"))
    throw new Error(`Refusing to remove unexpected profile: ${resolved}`)
  await rm(resolved, { recursive: true, force: true })
}

async function close(app: Runtime, page?: Page) {
  if (page) await page.evaluate(() => window.api.killSidecar()).catch(() => undefined)
  app.browser.disconnect()
  app.process.kill()
  await app.process.exited
}

async function waitForText(page: Page, text: string, timeout = 30_000) {
  await page.waitForFunction(
    (expected) =>
      [...document.querySelectorAll<HTMLElement>("[data-message-id]")].some(
        (element) => element.textContent?.trim() === expected,
      ),
    { timeout },
    text,
  )
}

async function freePort() {
  const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } })
  const port = socket.port
  socket.stop(true)
  return port
}

async function processMemory(mainPid: number) {
  const script = `$items = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'electron.exe' } | Select-Object ProcessId,ParentProcessId,WorkingSetSize,CommandLine; $items | ConvertTo-Json -Compress`
  const child = Bun.spawn(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (code !== 0) throw new Error(`Process memory query failed: ${stderr}`)
  const parsed = JSON.parse(stdout || "[]")
  const items = (Array.isArray(parsed) ? parsed : [parsed]).filter(object)
  const main = items.find((item) => Number(item.ProcessId) === mainPid)
  const parents = new Map(items.map((item) => [Number(item.ProcessId), Number(item.ParentProcessId)]))
  const renderer = items.find(
    (item) =>
      typeof item.CommandLine === "string" &&
      item.CommandLine.includes("--type=renderer") &&
      hasAncestor(Number(item.ProcessId), mainPid, parents),
  )
  if (!main || !renderer) throw new Error(`Could not resolve Electron process tree for ${mainPid}`)
  return {
    mainPid,
    rendererPid: Number(renderer.ProcessId),
    mainBytes: Number(main.WorkingSetSize),
    rendererBytes: Number(renderer.WorkingSetSize),
  }
}

function hasAncestor(processID: number, ancestor: number, parents: Map<number, number>) {
  const seen = new Set<number>()
  let current = processID
  while (parents.has(current) && !seen.has(current)) {
    seen.add(current)
    const parent = parents.get(current)!
    if (parent === ancestor) return true
    current = parent
  }
  return false
}

async function pipeLogs(stream: ReadableStream<Uint8Array> | null, label: string) {
  if (!stream) return
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader()
  while (true) {
    const next = await reader.read()
    if (next.done) return
    if (process.env.OPENCODE_DESKTOP_AC02_VERBOSE === "1") process.stderr.write(`[${label}] ${next.value}`)
  }
}
