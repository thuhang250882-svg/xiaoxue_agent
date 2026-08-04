import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, realpath, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  createTrustedAttachmentFileStore,
  createTrustedAttachmentId,
  trustedAttachmentUrl,
  type TrustedAttachment,
} from "@opencode-ai/core/util/trusted-attachment-registry"
import { XiaoxueTrustedAttachments } from "../../src/xiaoxue/trusted-attachments"

const previousDir = process.env.XIAOXUE_TRUSTED_ATTACHMENTS_DIR
let registryDir: string

beforeEach(async () => {
  registryDir = await mkdtemp(path.join(os.tmpdir(), "xiaoxue-server-ta-"))
  process.env.XIAOXUE_TRUSTED_ATTACHMENTS_DIR = registryDir
})

afterEach(async () => {
  if (previousDir === undefined) delete process.env.XIAOXUE_TRUSTED_ATTACHMENTS_DIR
  else process.env.XIAOXUE_TRUSTED_ATTACHMENTS_DIR = previousDir
  await rm(registryDir, { recursive: true, force: true })
})

// 模拟桌面主进程写入登记条目（测试中代替原生选择器链路）
async function registerOnDisk(absolutePath: string) {
  const info = await stat(absolutePath)
  const entry: TrustedAttachment = {
    id: createTrustedAttachmentId(),
    absolutePath,
    canonicalPath: await realpath(absolutePath),
    fileName: path.basename(absolutePath),
    size: info.size,
    mime: "text/plain",
    extension: path.extname(absolutePath).toLowerCase(),
    modifiedAt: info.mtimeMs,
    source: "native-picker",
    senderWebContentsId: 1,
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    consumed: false,
  }
  await createTrustedAttachmentFileStore(registryDir).save(entry)
  return entry
}

describe("server rejects untrusted file urls", () => {
  test("a handcrafted file:// path is never read without registration", async () => {
    const target = path.join(registryDir, "secret.txt")
    await writeFile(target, "sensitive", "utf8")

    await expect(XiaoxueTrustedAttachments.consumeByPath(target)).rejects.toMatchObject({
      code: "ATTACHMENT_NOT_TRUSTED",
    })
  })

  test("paths outside the workspace (other drives, unc) are refused when unregistered", async () => {
    await expect(XiaoxueTrustedAttachments.consumeByPath("D:\\公司资料\\报告.docx")).rejects.toMatchObject({
      code: "ATTACHMENT_NOT_TRUSTED",
    })
    await expect(
      XiaoxueTrustedAttachments.consumeByPath("\\\\fileserver\\share\\报告.xlsx"),
    ).rejects.toMatchObject({ code: "ATTACHMENT_NOT_TRUSTED" })
  })

  test("malformed or foreign credential urls are refused", async () => {
    await expect(XiaoxueTrustedAttachments.consumeUrl("xiaoxue-attachment:not-a-real-token")).rejects.toMatchObject({
      code: "ATTACHMENT_NOT_TRUSTED",
    })
    await expect(XiaoxueTrustedAttachments.consumeUrl("file:///D:/报告.docx")).rejects.toMatchObject({
      code: "ATTACHMENT_NOT_TRUSTED",
    })
    await expect(XiaoxueTrustedAttachments.consumeUrl(trustedAttachmentUrl("A".repeat(32)))).rejects.toMatchObject({
      code: "ATTACHMENT_NOT_FOUND",
    })
  })

  test("a registered path is consumable through the legacy compatibility mode", async () => {
    const target = path.join(registryDir, "重新选择.txt")
    await writeFile(target, "re-selected by the user", "utf8")
    await registerOnDisk(target)

    const entry = await XiaoxueTrustedAttachments.consumeByPath(target)
    expect(entry.fileName).toBe("重新选择.txt")
  })

  test("a registered credential url reads the file bytes", async () => {
    const target = path.join(registryDir, "凭证读取.txt")
    await writeFile(target, "via credential", "utf8")
    const entry = await registerOnDisk(target)

    const result = await XiaoxueTrustedAttachments.readUrl(trustedAttachmentUrl(entry.id))
    expect(Buffer.from(result.bytes).toString("utf8")).toBe("via credential")
  })
})
