import { afterEach, describe, expect, test } from "bun:test"
import { isWindowsDevicePath } from "@opencode-ai/core/util/trusted-attachment"
import { createHarness, type TestHarness } from "./helper"

let harness: TestHarness | undefined

afterEach(async () => {
  await harness?.cleanup()
  harness = undefined
})

describe("windows device path rejection", () => {
  test("detects reserved device names, namespaces and alternate streams", () => {
    expect(isWindowsDevicePath("C:\\data\\CON")).toBeTrue()
    expect(isWindowsDevicePath("C:\\data\\con.txt")).toBeTrue()
    expect(isWindowsDevicePath("C:\\data\\NUL.docx")).toBeTrue()
    expect(isWindowsDevicePath("C:\\data\\COM1")).toBeTrue()
    expect(isWindowsDevicePath("C:\\data\\LPT9.txt")).toBeTrue()
    expect(isWindowsDevicePath("\\\\.\\PhysicalDrive0")).toBeTrue()
    expect(isWindowsDevicePath("\\\\?\\C:\\data\\a.txt")).toBeTrue()
    expect(isWindowsDevicePath("C:\\data\\report.txt:hidden")).toBeTrue()
    expect(isWindowsDevicePath("C:\\data\\正常报告.docx")).toBeFalse()
    expect(isWindowsDevicePath("C:\\data\\console.txt")).toBeFalse()
  })

  test("registration refuses device paths before touching the filesystem", async () => {
    harness = await createHarness()
    await expect(
      harness.registry.register(1, "native-picker", [{ absolutePath: "\\\\.\\PhysicalDrive0" }]),
    ).rejects.toMatchObject({ code: "ATTACHMENT_NOT_TRUSTED" })
    await expect(
      harness.registry.register(1, "native-picker", [{ absolutePath: "C:\\temp\\CON.txt" }]),
    ).rejects.toMatchObject({ code: "ATTACHMENT_NOT_TRUSTED" })
  })
})
