import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createFile, createHarness, nodeFs, type TestHarness } from "./helper"

let harness: TestHarness | undefined

afterEach(async () => {
  await harness?.cleanup()
  harness = undefined
})

// Windows 上创建符号链接需要开发者模式或管理员权限；无权限时跳过真实链接用例
async function symlinkSupported() {
  const probe = await mkdtemp(path.join(os.tmpdir(), "xiaoxue-symlink-probe-"))
  try {
    const target = path.join(probe, "target.txt")
    await writeFile(target, "t", "utf8")
    await symlink(target, path.join(probe, "link.txt"))
    return true
  } catch {
    return false
  } finally {
    await rm(probe, { recursive: true, force: true })
  }
}

describe("symlink target validation", () => {
  test("repointing a symlink to an unregistered target fails consume", async () => {
    if (!(await symlinkSupported())) return

    harness = await createHarness()
    const original = await createFile(harness.dataDir, "original.txt", "registered content")
    const diverted = await createFile(harness.dataDir, "diverted.txt", "attacker swapped content!")
    const link = path.join(harness.dataDir, "link.txt")
    await symlink(original, link)

    const [entry] = await harness.registry.register(1, "native-picker", [{ absolutePath: link }])
    expect(entry.canonicalPath.toLowerCase()).toBe(original.toLowerCase())

    // 攻击场景：登记后把链接重定向到未登记文件
    await rm(link)
    await symlink(diverted, link)

    await expect(harness.registry.consume(entry.id)).rejects.toMatchObject({ code: "ATTACHMENT_PATH_CHANGED" })
  })

  test("registration resolves through the link so the canonical target is pinned", async () => {
    if (!(await symlinkSupported())) return

    harness = await createHarness()
    const original = await createFile(harness.dataDir, "base.txt", "content")
    const link = path.join(harness.dataDir, "alias.txt")
    await symlink(original, link)

    const [entry] = await harness.registry.register(1, "native-picker", [{ absolutePath: link }])
    const consumed = await harness.registry.consume(entry.id)
    expect(consumed.canonicalPath.toLowerCase()).toBe(original.toLowerCase())
  })

  test("swapping the file for one of a different size fails revalidation", async () => {
    harness = await createHarness()
    const file = await createFile(harness.dataDir, "swap.txt", "short")
    const [entry] = await harness.registry.register(1, "native-picker", [{ absolutePath: file }])

    await writeFile(file, "a much longer replacement body", "utf8")
    await expect(harness.registry.consume(entry.id)).rejects.toMatchObject({ code: "ATTACHMENT_PATH_CHANGED" })
  })

  test("the injected fs adapter exposes realpath for link resolution", async () => {
    if (!(await symlinkSupported())) return

    harness = await createHarness()
    const original = await createFile(harness.dataDir, "real.txt", "content")
    const link = path.join(harness.dataDir, "pointer.txt")
    await symlink(original, link)
    expect((await nodeFs.realpath(link)).toLowerCase()).toBe(original.toLowerCase())
  })
})
