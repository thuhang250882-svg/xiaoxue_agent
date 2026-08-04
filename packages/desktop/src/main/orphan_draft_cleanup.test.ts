import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cleanupStoreFiles } from "./store-cleanup"

const roots: string[] = []

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "opencode-orphan-draft-"))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function writeStore(root: string, name: string, value: string, modified: Date) {
  await writeFile(join(root, name), value)
  await utimes(join(root, name), modified, modified)
}

describe("orphan draft cleanup", () => {
  test("removes empty draft stores left behind after submit or abandonment", async () => {
    const root = await tempRoot()
    const now = new Date("2026-08-01T00:00:00.000Z")
    // 提交后清空或从未输入内容的草稿只剩空对象，属于孤儿文件
    await writeStore(root, "opencode.draft.orphan1.dat", "{}", now)
    await writeStore(root, "opencode.draft.orphan2.dat", "{\n}", now)
    await writeStore(root, "opencode.draft.alive.dat", '{"draft:prompt":"in progress"}', now)

    const result = await cleanupStoreFiles(root, now.getTime())

    expect(result.deleted.sort()).toEqual(["opencode.draft.orphan1.dat", "opencode.draft.orphan2.dat"])
    expect(await readdir(root)).toEqual(["opencode.draft.alive.dat"])
  })

  test("removes abandoned drafts older than retention and keeps recent ones", async () => {
    const root = await tempRoot()
    const now = new Date("2026-08-01T00:00:00.000Z")
    await writeStore(root, "opencode.draft.abandoned.dat", '{"draft:prompt":"old"}', new Date("2026-06-01T00:00:00.000Z"))
    await writeStore(root, "opencode.draft.recent.dat", '{"draft:prompt":"new"}', now)

    const result = await cleanupStoreFiles(root, now.getTime())

    expect(result.deleted).toEqual(["opencode.draft.abandoned.dat"])
    expect(await readdir(root)).toEqual(["opencode.draft.recent.dat"])
  })

  test("caps total draft bytes by dropping the oldest drafts first", async () => {
    const root = await tempRoot()
    const now = new Date("2026-08-01T00:00:00.000Z")
    // 10 个 4MB 草稿共 40MB，超过 32MB 总量预算；最旧的几个应被删除直到达标
    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        writeStore(
          root,
          `opencode.draft.big${index}.dat`,
          `{"draft:prompt":"${"x".repeat(4 * 1024 * 1024)}"}`,
          new Date(now.getTime() - index * 60_000),
        ),
      ),
    )

    const result = await cleanupStoreFiles(root, now.getTime())

    expect(result.deleted.sort()).toEqual(["opencode.draft.big7.dat", "opencode.draft.big8.dat", "opencode.draft.big9.dat"])
    expect(await readdir(root)).toHaveLength(7)
  })

  test("never deletes workspace stores while capping draft bytes", async () => {
    const root = await tempRoot()
    const now = new Date("2026-08-01T00:00:00.000Z")
    await writeStore(root, "opencode.workspace.active.dat", `{"draft:prompt":"${"y".repeat(33 * 1024 * 1024)}"}`, now)
    await writeStore(root, "opencode.draft.small.dat", '{"draft:prompt":"hello"}', now)

    const result = await cleanupStoreFiles(root, now.getTime())

    expect(result.deleted).toEqual([])
    expect((await readdir(root)).sort()).toEqual(["opencode.draft.small.dat", "opencode.workspace.active.dat"])
  })
})
