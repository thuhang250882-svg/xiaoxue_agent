import { afterEach, describe, expect, test } from "bun:test"
import { Config } from "@opencode-ai/core/config"
import { ConfigXiaoxue } from "@opencode-ai/core/config/xiaoxue"
import { Global } from "@opencode-ai/core/global"
import { Location } from "@opencode-ai/core/location"
import { MemoryContext } from "@opencode-ai/core/memory-context"
import { Project } from "@opencode-ai/core/project"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { Effect, Layer } from "effect"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { XiaoxueMemory } from "../../src/xiaoxue/memory"
import { XiaoxueMemoryContext } from "../../src/xiaoxue/memory-context"

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("XiaoxueMemoryContext", () => {
  test("recalls the existing SQLite memory store for Session V2", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "opencode-memory-context-"))
    directories.push(directory)
    const data = path.join(directory, "data")
    const workspace = AbsolutePath.make(path.join(directory, "workspace"))
    const projectID = Project.ID.make("project-memory-context")
    const memoryDirectory = path.join(data, "xiaoxue", "memory")
    await XiaoxueMemory.execute(
      { action: "add", target: "user", content: "用户偏好使用中文交流。" },
      undefined,
      workspace,
      memoryDirectory,
      projectID,
    )
    await XiaoxueMemory.execute(
      { action: "add", target: "memory", content: "当前项目默认使用 dev 分支。" },
      undefined,
      workspace,
      memoryDirectory,
      projectID,
    )

    const config = Layer.succeed(
      Config.Service,
      Config.Service.of({
        entries: () =>
          Effect.succeed([
            new Config.Document({
              type: "document",
              info: new Config.Info({
                xiaoxue: new ConfigXiaoxue.Info({ memory: new ConfigXiaoxue.Memory({ enabled: true }) }),
              }),
            }),
          ]),
      }),
    )
    const location = Layer.succeed(
      Location.Service,
      Location.Service.of({ directory: workspace, project: { id: projectID, directory: workspace } }),
    )
    const global = Global.layerWith({ data })
    const result = await Effect.runPromise(
      MemoryContext.Service.pipe(
        Effect.flatMap((memory) =>
          memory.recall({ sessionID: "session-v2", query: "应该使用哪个分支？", review: true, userTurns: 1 }),
        ),
        Effect.provide(XiaoxueMemoryContext.layer),
        Effect.provide(Layer.mergeAll(config, location, global)),
      ),
    )

    expect(result).toContain("用户偏好使用中文交流")
    expect(result).toContain("当前项目默认使用 dev 分支")
    expect(result).toContain("<persistent_memory>")
    expect(result).toContain("<memory_review>")

    const managed = await Effect.runPromise(
      MemoryContext.Service.pipe(
        Effect.flatMap((memory) =>
          memory.manage({ action: "add", target: "memory", content: "报告审核必须保留原始条款编号。" }),
        ),
        Effect.provide(XiaoxueMemoryContext.layer),
        Effect.provide(Layer.mergeAll(config, location, global)),
      ),
    )
    expect(managed).toMatchObject({ success: true, message: "已更新长期记忆。" })
    expect(
      await XiaoxueMemory.prompt(
        "session-v2-after-write",
        undefined,
        workspace,
        memoryDirectory,
        projectID,
        "报告审核有什么要求？",
      ),
    ).toContain("报告审核必须保留原始条款编号")
  })
})

