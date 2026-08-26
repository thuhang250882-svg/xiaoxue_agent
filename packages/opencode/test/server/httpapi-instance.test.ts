import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { Flag } from "@opencode-ai/core/flag/flag"
import { describe, expect } from "bun:test"
import { Config, Context, Effect, FileSystem, Layer, Path } from "effect"
import { HttpClient, HttpClientRequest, HttpRouter, HttpServer } from "effect/unstable/http"
import * as Socket from "effect/unstable/socket/Socket"
import { WorkspaceV2 } from "@opencode-ai/core/workspace"
import { ControlPaths } from "../../src/server/routes/instance/httpapi/groups/control"
import { InstancePaths } from "../../src/server/routes/instance/httpapi/groups/instance"
import { SessionPaths } from "../../src/server/routes/instance/httpapi/groups/session"
import { ProjectV2 } from "@opencode-ai/core/project"
import { QuestionID } from "../../src/question/schema"
import { ApiSkillError } from "../../src/server/routes/instance/httpapi/groups/instance"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { HEADER as FenceHeader } from "../../src/server/shared/fence"
import { resetDatabase } from "../fixture/db"
import { tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// Flip the experimental workspaces flag so EventV2.run actually writes to
// EventSequenceTable (the source of truth the fence middleware reads). Reset
// the database around the test so per-instance state does not leak between
// runs. resetDatabase() already calls disposeAllInstances(), so we don't
// repeat it.
const testStateLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const originalWorkspaces = Flag.OPENCODE_EXPERIMENTAL_WORKSPACES
    Flag.OPENCODE_EXPERIMENTAL_WORKSPACES = true
    yield* Effect.promise(() => resetDatabase())
    yield* Effect.addFinalizer(() =>
      Effect.promise(async () => {
        Flag.OPENCODE_EXPERIMENTAL_WORKSPACES = originalWorkspaces
        await resetDatabase()
      }),
    )
  }),
)

// Mount the production HttpApi route tree on a real Node HTTP server bound to
// 127.0.0.1:0 and a fetch-based HttpClient that prepends the server URL. This
// keeps the test wired directly through the same route layer production uses.
const servedRoutes: Layer.Layer<never, Config.ConfigError, HttpServer.HttpServer> = HttpRouter.serve(
  HttpApiApp.routes,
  { disableListenLog: true, disableLogger: true },
)

const httpApiServerLayer = servedRoutes.pipe(
  Layer.provide(Socket.layerWebSocketConstructorGlobal),
  Layer.provideMerge(NodeHttpServer.layerTest),
  Layer.provideMerge(NodeServices.layer),
)

const it = testEffect(Layer.mergeAll(testStateLayer, httpApiServerLayer))
const handlerContext = Context.empty() as Context.Context<unknown>

const directoryHeader = (dir: string) => HttpClientRequest.setHeader("x-opencode-directory", dir)

describe("instance HttpApi", () => {
  it.live("serves the OpenAPI document", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.get("/doc")

      expect(response.status).toBe(200)
      expect(response.headers["content-type"]).toContain("application/json")
      expect(yield* response.json).toMatchObject({
        openapi: expect.any(String),
        info: expect.any(Object),
        paths: expect.objectContaining({
          "/global/health": expect.any(Object),
          "/session": expect.any(Object),
        }),
      })
    }),
    10_000,
  )

  it.live("emits a sync fence header for fixed-workspace mutations", () =>
    Effect.gen(function* () {
      const originalWorkspaceID = Flag.OPENCODE_WORKSPACE_ID
      Flag.OPENCODE_WORKSPACE_ID = WorkspaceV2.ID.ascending()
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          Flag.OPENCODE_WORKSPACE_ID = originalWorkspaceID
        }),
      )

      const dir = yield* tmpdirScoped({ git: true })
      const response = yield* HttpClientRequest.post(SessionPaths.create).pipe(
        directoryHeader(dir),
        HttpClientRequest.bodyJson({ title: "fenced" }),
        Effect.flatMap(HttpClient.execute),
      )

      expect(response.status).toBe(200)
      expect(JSON.parse(response.headers[FenceHeader] ?? "{}")).not.toEqual({})
    }),
  )

  it.live("does not emit sync fence headers for fixed-workspace reads or no-op mutations", () =>
    Effect.gen(function* () {
      const originalWorkspaceID = Flag.OPENCODE_WORKSPACE_ID
      Flag.OPENCODE_WORKSPACE_ID = WorkspaceV2.ID.ascending()
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          Flag.OPENCODE_WORKSPACE_ID = originalWorkspaceID
        }),
      )

      const dir = yield* tmpdirScoped({ git: true })
      const read = yield* HttpClientRequest.get(InstancePaths.path).pipe(directoryHeader(dir), HttpClient.execute)
      const log = yield* HttpClientRequest.post(ControlPaths.log).pipe(
        directoryHeader(dir),
        HttpClientRequest.bodyJson({ service: "fence-test", level: "info", message: "noop" }),
        Effect.flatMap(HttpClient.execute),
      )

      expect(read.status).toBe(200)
      expect(read.headers[FenceHeader]).toBeUndefined()
      expect(log.status).toBe(200)
      expect(log.headers[FenceHeader]).toBeUndefined()
    }),
  )

  it.live("rejects malformed permission and question request ids", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })
      const request = (path: string, init?: RequestInit) =>
        Effect.promise(() =>
          HttpApiApp.webHandler().handler(
            new Request(`http://localhost${path}`, {
              ...init,
              headers: { "x-opencode-directory": dir, "content-type": "application/json", ...init?.headers },
            }),
            handlerContext,
          ),
        )
      const [permission, questionReply, questionReject] = yield* Effect.all(
        [
          request("/permission/invalid-permission-id/reply", {
            method: "POST",
            body: JSON.stringify({ reply: "once" }),
          }),
          request("/question/invalid-question-id/reply", {
            method: "POST",
            body: JSON.stringify({ answers: [["Yes"]] }),
          }),
          request("/question/invalid-question-id/reject", { method: "POST" }),
        ],
        { concurrency: "unbounded" },
      )

      expect(permission.status).toBe(400)
      expect(questionReply.status).toBe(400)
      expect(questionReject.status).toBe(400)
    }),
  )

  it.live("returns typed not found bodies for missing permission and question requests", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })
      const request = (path: string, init?: RequestInit) =>
        Effect.promise(() =>
          HttpApiApp.webHandler().handler(
            new Request(`http://localhost${path}`, {
              ...init,
              headers: { "x-opencode-directory": dir, "content-type": "application/json", ...init?.headers },
            }),
            handlerContext,
          ),
        )
      const permissionID = PermissionV1.ID.ascending()
      const questionReplyID = QuestionID.ascending()
      const questionRejectID = QuestionID.ascending()
      const [permission, questionReply, questionReject] = yield* Effect.all(
        [
          request(`/permission/${permissionID}/reply`, {
            method: "POST",
            body: JSON.stringify({ reply: "once" }),
          }),
          request(`/question/${questionReplyID}/reply`, {
            method: "POST",
            body: JSON.stringify({ answers: [["Yes"]] }),
          }),
          request(`/question/${questionRejectID}/reject`, { method: "POST" }),
        ],
        { concurrency: "unbounded" },
      )

      expect(permission.status).toBe(404)
      expect(yield* Effect.promise(() => permission.json())).toEqual({
        _tag: "PermissionNotFoundError",
        requestID: permissionID,
        message: `Permission request not found: ${permissionID}`,
      })
      expect(questionReply.status).toBe(404)
      expect(yield* Effect.promise(() => questionReply.json())).toEqual({
        _tag: "QuestionNotFoundError",
        requestID: questionReplyID,
        message: `Question request not found: ${questionReplyID}`,
      })
      expect(questionReject.status).toBe(404)
      expect(yield* Effect.promise(() => questionReject.json())).toEqual({
        _tag: "QuestionNotFoundError",
        requestID: questionRejectID,
        message: `Question request not found: ${questionRejectID}`,
      })
    }),
  )

  it.live("returns typed not found bodies for missing projects", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })
      const projectID = ProjectV2.ID.make("project_missing")
      const response = yield* Effect.promise(() =>
        HttpApiApp.webHandler().handler(
          new Request(`http://localhost/project/${projectID}`, {
            method: "PATCH",
            headers: { "x-opencode-directory": dir, "content-type": "application/json" },
            body: JSON.stringify({ name: "Missing" }),
          }),
          handlerContext,
        ),
      )

      expect(response.status).toBe(404)
      expect(yield* Effect.promise(() => response.json())).toEqual({
        _tag: "ProjectNotFoundError",
        projectID,
        message: `Project not found: ${projectID}`,
      })
    }),
  )

  it.live("serves path and VCS read endpoints", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      yield* fs.writeFileString(path.join(dir, "changed.txt"), "hello")

      const [paths, vcs, diff] = yield* Effect.all(
        [
          HttpClientRequest.get(InstancePaths.path).pipe(directoryHeader(dir), HttpClient.execute),
          HttpClientRequest.get(InstancePaths.vcs).pipe(directoryHeader(dir), HttpClient.execute),
          HttpClientRequest.get(InstancePaths.vcsDiff).pipe(
            HttpClientRequest.setUrlParam("mode", "git"),
            directoryHeader(dir),
            HttpClient.execute,
          ),
        ],
        { concurrency: "unbounded" },
      )

      expect(paths.status).toBe(200)
      expect(yield* paths.json).toMatchObject({ directory: dir, worktree: dir })

      expect(vcs.status).toBe(200)
      expect(yield* vcs.json).toMatchObject({ branch: expect.any(String) })

      expect(diff.status).toBe(200)
      expect(yield* diff.json).toContainEqual(
        expect.objectContaining({ file: "changed.txt", additions: 1, status: "added" }),
      )
    }),
  )

  it.live("serves skill CRUD over the experimental HttpApi", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const skillPath = path.join(dir, ".opencode", "skill", "crud-skill", "SKILL.md")
      yield* fs.makeDirectory(path.dirname(skillPath), { recursive: true })
      yield* fs.writeFileString(
        skillPath,
        `---
name: crud-skill
description: Initial description
version: 3
metadata:
  domain: logging
---

# CRUD Skill

Original body.
`,
      )

      const dispatch = (input: { path: string; init?: RequestInit }) =>
        Effect.promise(() =>
          HttpApiApp.webHandler().handler(
            new Request(`http://localhost${input.path}`, {
              ...input.init,
              headers: {
                "x-opencode-directory": dir,
                "content-type": "application/json",
                ...input.init?.headers,
              },
            }),
            handlerContext,
          ),
        )

      const updated = yield* dispatch({
        path: "/skill/crud-skill",
        init: { method: "PATCH", body: JSON.stringify({ description: "Updated description" }) },
      })
      expect(updated.status).toBe(200)
      const updatedBody = (yield* Effect.promise(() => updated.json())) as { description?: string; content: string }
      expect(updatedBody.description).toBe("Updated description")
      expect(updatedBody.content).toContain("# CRUD Skill")

      const onDisk = yield* fs.readFileString(skillPath)
      const parsedOnDisk = (yield* Effect.promise(() => import("gray-matter"))).default(onDisk)
      expect(parsedOnDisk.data).toMatchObject({
        name: "crud-skill",
        description: "Updated description",
        version: 3,
        metadata: { domain: "logging" },
      })
      expect(parsedOnDisk.content).toContain("Original body.")

      const invalidCreate = yield* dispatch({
        path: "/skill",
        init: { method: "POST", body: JSON.stringify({ name: "../escape" }) },
      })
      expect(invalidCreate.status).toBe(400)

      const urlImport = yield* dispatch({
        path: "/skill/import/preview",
        init: { method: "POST", body: JSON.stringify({ source: "https://example.invalid/untrusted.skill" }) },
      })
      expect(urlImport.status).toBe(422)
      expect(yield* Effect.promise(() => urlImport.json())).toMatchObject({ code: "SKILL_VALIDATION_FAILED" })

      const invalidRoute = yield* dispatch({
        path: `/skill/${encodeURIComponent("../escape")}`,
        init: { method: "PATCH", body: JSON.stringify({ description: "x" }) },
      })
      expect(invalidRoute.status).toBe(400)

      const missing = yield* dispatch({
        path: "/skill/does-not-exist",
        init: { method: "PATCH", body: JSON.stringify({ description: "x" }) },
      })
      expect(missing.status).toBe(404)
      expect(yield* Effect.promise(() => missing.json())).toMatchObject({
        code: "SKILL_NOT_FOUND",
        message: expect.stringContaining("does-not-exist"),
        details: { name: "does-not-exist" },
      })

      const conflict = yield* dispatch({
        path: "/skill",
        init: { method: "POST", body: JSON.stringify({ name: "crud-skill" }) },
      })
      expect(conflict.status).toBe(409)
      expect(yield* Effect.promise(() => conflict.json())).toMatchObject({ code: "SKILL_NAME_CONFLICT" })

      yield* fs.writeFileString(skillPath, `---\nname: wrong-name\ndescription: Broken\n---\n`)
      const invalidExisting = yield* dispatch({
        path: "/skill/crud-skill",
        init: { method: "PATCH", body: JSON.stringify({ description: "x" }) },
      })
      expect(invalidExisting.status).toBe(422)
      expect(yield* Effect.promise(() => invalidExisting.json())).toMatchObject({
        code: "SKILL_VALIDATION_FAILED",
      })
      yield* fs.writeFileString(skillPath, onDisk)

      const removed = yield* dispatch({ path: "/skill/crud-skill", init: { method: "DELETE" } })
      expect(removed.status).toBe(200)
      const removedBody = (yield* Effect.promise(() => removed.json())) as boolean
      expect(removedBody).toBe(true)

      const afterRemove = yield* fs.exists(skillPath)
      expect(afterRemove).toBe(false)
    }),
  )

  it.live("serves skill enable/disable over the experimental HttpApi", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const skillPath = path.join(dir, ".opencode", "skill", "toggle-skill", "SKILL.md")
      yield* fs.makeDirectory(path.dirname(skillPath), { recursive: true })
      yield* fs.writeFileString(
        skillPath,
        `---
name: toggle-skill
description: Toggleable skill for the HTTP layer.
---

# Toggle Skill
`,
      )

      const dispatch = (input: { path: string; init?: RequestInit }) =>
        Effect.promise(() =>
          HttpApiApp.webHandler().handler(
            new Request(`http://localhost${input.path}`, {
              ...input.init,
              headers: {
                "x-opencode-directory": dir,
                "content-type": "application/json",
                ...input.init?.headers,
              },
            }),
            handlerContext,
          ),
        )

      const list = yield* dispatch({ path: "/skill" })
      expect(list.status).toBe(200)
      const listBody = (yield* Effect.promise(() => list.json())) as Array<{
        name: string
        enabled: boolean
        health: string
        diagnostics: Array<{ code: string }>
      }>
      const before = listBody.find((s) => s.name === "toggle-skill")
      expect(before?.enabled).toBe(true)
      expect(before?.health).toBe("healthy")
      expect(before?.diagnostics).toEqual([expect.objectContaining({ code: "SKILL_HEALTHY" })])

      const disabled = yield* dispatch({
        path: "/skill/toggle-skill/disable",
        init: { method: "POST" },
      })
      expect(disabled.status).toBe(200)
      const disabledBody = (yield* Effect.promise(() => disabled.json())) as { enabled: boolean }
      expect(disabledBody.enabled).toBe(false)

      const afterDisable = yield* dispatch({ path: "/skill" })
      const afterDisableList = (yield* Effect.promise(() => afterDisable.json())) as Array<{
        name: string
        enabled: boolean
      }>
      const afterDisableEntry = afterDisableList.find((s) => s.name === "toggle-skill")
      expect(afterDisableEntry?.enabled).toBe(false)

      const enabled = yield* dispatch({
        path: "/skill/toggle-skill/enable",
        init: { method: "POST" },
      })
      expect(enabled.status).toBe(200)
      const enabledBody = (yield* Effect.promise(() => enabled.json())) as { enabled: boolean }
      expect(enabledBody.enabled).toBe(true)

      const missingEnable = yield* dispatch({
        path: "/skill/ghost-skill/enable",
        init: { method: "POST" },
      })
      expect(missingEnable.status).toBe(404)
      expect(yield* Effect.promise(() => missingEnable.json())).toMatchObject({
        code: "SKILL_NOT_FOUND",
      })
    }),
  )
})
