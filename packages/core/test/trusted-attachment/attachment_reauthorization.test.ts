import { afterEach, describe, expect, test } from "bun:test"
import { createFile, createHarness, type TestHarness } from "./helper"

let harness: TestHarness | undefined

afterEach(async () => {
  await harness?.cleanup()
  harness = undefined
})

describe("historical attachment reauthorization", () => {
  test("re-selecting the same file lets a legacy file:// reference read again", async () => {
    harness = await createHarness()
    const file = await createFile(harness.dataDir, "历史报告.docx", "PK\u0003\u0004 body")

    // 用户通过原生选择器重新选择同一文件（兼容模式的唯一入口）
    const [entry] = await harness.registry.register(1, "native-picker", [{ absolutePath: file }])

    // 服务端按历史记录的规范路径查登记表，命中后消费条目恢复读取资格
    const found = await harness.registry.findByCanonicalPath(file)
    expect(found?.id).toBe(entry.id)
    const consumed = await harness.registry.consume(found!.id)
    expect(consumed.canonicalPath.toLowerCase()).toBe(file.toLowerCase())
  })

  test("a history path without any live registration stays rejected", async () => {
    harness = await createHarness()
    const file = await createFile(harness.dataDir, "legacy.docx", "PK\u0003\u0004 body")

    // 登记表为空：历史 file:// 引用不允许静默读盘
    expect(await harness.registry.findByCanonicalPath(file)).toBeUndefined()
  })

  test("registration entries do not survive an app restart (registry clear)", async () => {
    harness = await createHarness()
    const file = await createFile(harness.dataDir, "session-a.docx", "PK\u0003\u0004 body")
    await harness.registry.register(1, "native-picker", [{ absolutePath: file }])

    // 应用退出清空登记表；下一次启动后历史凭证不可用，必须重新选择
    await harness.registry.clear()
    expect(await harness.registry.findByCanonicalPath(file)).toBeUndefined()
  })

  test("expired reauthorization candidates are skipped by canonical lookup", async () => {
    harness = await createHarness({ ttlMs: 1_000 })
    const file = await createFile(harness.dataDir, "expired.docx", "PK\u0003\u0004 body")
    const [entry] = await harness.registry.register(1, "native-picker", [{ absolutePath: file }])

    harness.setNow(entry.expiresAt + 1)
    expect(await harness.registry.findByCanonicalPath(file)).toBeUndefined()
  })

  test("picking a different file does not authorize the historical path", async () => {
    harness = await createHarness()
    const original = await createFile(harness.dataDir, "original.docx", "PK\u0003\u0004 original")
    const other = await createFile(harness.dataDir, "other.docx", "PK\u0003\u0004 other content")
    await harness.registry.register(1, "native-picker", [{ absolutePath: other }])

    // 登记表只有用户重选的 other.docx；原历史路径仍然拒绝
    expect(await harness.registry.findByCanonicalPath(original)).toBeUndefined()
    const found = await harness.registry.findByCanonicalPath(other)
    expect(found).toBeDefined()
  })
})
