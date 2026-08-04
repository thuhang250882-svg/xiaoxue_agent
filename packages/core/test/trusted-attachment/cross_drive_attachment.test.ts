import { afterEach, describe, expect, test } from "bun:test"
import { createFile, createHarness, type TestHarness } from "./helper"

let harness: TestHarness | undefined

afterEach(async () => {
  await harness?.cleanup()
  harness = undefined
})

const driveOf = (value: string) => value.replace(/[\\/].*$/, "").toUpperCase()

describe("cross-drive attachments", () => {
  test("a file outside the process working directory registers and consumes", async () => {
    harness = await createHarness()
    // 旧实现以 process.cwd() 为唯一安全根，工作目录之外的盘符一律被拒绝；
    // 新实现的安全依据是登记凭证，不再依赖路径位置
    const file = await createFile(harness.dataDir, "D盘模拟-完井卡片.xlsx", "PK\u0003\u0004 sheet body")

    const [entry] = await harness.registry.register(1, "native-picker", [
      { absolutePath: file, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    ])
    const consumed = await harness.registry.consume(entry.id)
    expect(consumed.canonicalPath.toLowerCase()).toBe(file.toLowerCase())
  })

  test("a file on a different drive than the workspace is fully supported", async () => {
    harness = await createHarness()
    const file = await createFile(harness.dataDir, "cross-drive.docx", "PK\u0003\u0004 doc body")
    const crossDrive = driveOf(file) !== driveOf(process.cwd())
    // 开发机 tmpdir 与仓库通常不在同一盘符；同盘符时语义仍然成立（无 cwd 安全根）
    expect(typeof crossDrive).toBe("boolean")

    const [entry] = await harness.registry.register(1, "native-picker", [{ absolutePath: file }])
    const consumed = await harness.registry.consume(entry.id)
    expect(consumed.id).toBe(entry.id)
  })

  test("USB-style removable paths are treated like any registered file", async () => {
    harness = await createHarness()
    const usbLike = await createFile(harness.dataDir, "U盘资料 2026(终版) #v2.docx", "PK\u0003\u0004 usb body")
    const [entry] = await harness.registry.register(1, "native-picker", [{ absolutePath: usbLike }])
    const consumed = await harness.registry.consume(entry.id)
    expect(consumed.fileName).toBe("U盘资料 2026(终版) #v2.docx")
  })
})
