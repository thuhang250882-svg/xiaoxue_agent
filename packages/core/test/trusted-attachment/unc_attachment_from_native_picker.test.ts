import { afterEach, describe, expect, test } from "bun:test"
import type { TrustedAttachmentFs, TrustedAttachmentStat } from "@opencode-ai/core/util/trusted-attachment"
import { createHarness, type TestHarness } from "./helper"

let harness: TestHarness | undefined

afterEach(async () => {
  await harness?.cleanup()
  harness = undefined
})

// 真实网络共享无法在测试机上可靠创建，这里用内存 fs 适配模拟 UNC 目标，
// 验证登记表对 UNC 路径的完整语义：登记、消费、复核与链接目标校验
function uncFs(files: Record<string, TrustedAttachmentStat>): TrustedAttachmentFs {
  return {
    async stat(path) {
      const info = files[path]
      if (!info) throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" })
      return info
    },
    realpath: async (path) => path,
  }
}

const UNC_FILE = "\\\\fileserver\\录井资料\\完井报告 2026.docx"

describe("unc attachments from the native picker", () => {
  test("a user-picked unc file registers and consumes", async () => {
    harness = await createHarness({
      fs: uncFs({ [UNC_FILE]: { size: 4096, modifiedAt: 1_700_000_000_000, isDirectory: false } }),
    })

    const [entry] = await harness.registry.register(1, "native-picker", [
      { absolutePath: UNC_FILE, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    ])
    expect(entry.canonicalPath).toBe(UNC_FILE)
    expect(entry.fileName).toBe("完井报告 2026.docx")

    const consumed = await harness.registry.consume(entry.id)
    expect(consumed.id).toBe(entry.id)
  })

  test("an unc share that disappears after registration reports not found", async () => {
    const files: Record<string, TrustedAttachmentStat> = {
      [UNC_FILE]: { size: 4096, modifiedAt: 1_700_000_000_000, isDirectory: false },
    }
    harness = await createHarness({ fs: uncFs(files) })
    const [entry] = await harness.registry.register(1, "native-picker", [{ absolutePath: UNC_FILE }])

    delete files[UNC_FILE]
    await expect(harness.registry.consume(entry.id)).rejects.toMatchObject({ code: "ATTACHMENT_NOT_FOUND" })
  })

  test("unc entries are discoverable by canonical path for legacy reauthorization", async () => {
    harness = await createHarness({
      fs: uncFs({ [UNC_FILE]: { size: 4096, modifiedAt: 1_700_000_000_000, isDirectory: false } }),
    })
    await harness.registry.register(1, "native-picker", [{ absolutePath: UNC_FILE }])

    const found = await harness.registry.findByCanonicalPath(UNC_FILE)
    expect(found?.canonicalPath).toBe(UNC_FILE)
    // Windows 路径比较不区分大小写
    const foundLower = await harness.registry.findByCanonicalPath(UNC_FILE.toLowerCase())
    expect(foundLower?.canonicalPath).toBe(UNC_FILE)
  })
})
