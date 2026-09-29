import { describe, expect, test } from "bun:test"
import { acceptedFileTypes, attachmentMime } from "./attachments"

describe("PromptInputV2 attachment MIME", () => {
  test("accepts legacy and modern Word documents", async () => {
    expect(
      await attachmentMime(new File([Uint8Array.of(0xd0, 0xcf)], "report.doc", { type: "application/msword" })),
    ).toBe("application/msword")
    expect(await attachmentMime(new File([Uint8Array.of(0x50, 0x4b)], "report.docx"))).toContain(
      "wordprocessingml",
    )
  })

  test("accepts legacy and modern Excel workbooks", async () => {
    expect(await attachmentMime(new File([Uint8Array.of(0xd0, 0xcf)], "table.xls"))).toBe(
      "application/vnd.ms-excel",
    )
    expect(await attachmentMime(new File([Uint8Array.of(0x50, 0x4b)], "table.xlsx"))).toContain("spreadsheetml")
  })

  test("accepts dragged PowerPoint files without browser MIME metadata", async () => {
    expect(acceptedFileTypes).toContain(".pptx")
    expect(await attachmentMime(new File([Uint8Array.of(0x50, 0x4b)], "slides.pptx"))).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    )
    expect(await attachmentMime(new File([Uint8Array.of(0xd0, 0xcf)], "slides.ppt"))).toBe("application/vnd.ms-powerpoint")
  })
})
