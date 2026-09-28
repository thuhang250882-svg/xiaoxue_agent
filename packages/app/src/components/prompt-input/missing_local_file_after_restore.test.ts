import { describe, expect, test } from "bun:test"
import { isStrippedInlineAttachment } from "@opencode-ai/core/util/persisted-payload"
import type { Prompt } from "@/context/prompt"
import { buildRequestParts } from "./build-request-parts"

const base = {
  prompt: [] as Prompt,
  context: [],
  text: "重发这份历史",
  messageID: "msg_restore",
  sessionID: "ses_restore",
  sessionDirectory: "/repo",
}

describe("missing local file after restore", () => {
  test("attachment without a trusted id or bytes is not resubmitted as an empty file", () => {
    const result = buildRequestParts({
      ...base,
      images: [
        {
          type: "image",
          id: "att_doc",
          filename: "呼北2井录井报告.doc",
          sourcePath: "C:\\reports\\呼北2井录井报告.doc",
          mime: "application/msword",
          dataUrl: "",
        },
      ],
    })
    expect(result.requestParts.filter((part) => part.type === "file")).toHaveLength(0)
  })

  test("stripped inline attachment is never submitted as an empty payload", () => {
    const stripped = {
      type: "image",
      id: "att_png",
      filename: "huge.png",
      mime: "image/png",
      dataUrl: "",
    } as const
    expect(isStrippedInlineAttachment(stripped)).toBe(true)
    const result = buildRequestParts({ ...base, images: [stripped] })
    expect(result.requestParts.filter((part) => part.type === "file")).toHaveLength(0)
  })

  test("small inline image and local-path attachment are not flagged as stripped", () => {
    expect(
      isStrippedInlineAttachment({
        type: "image",
        mime: "image/png",
        dataUrl: "data:image/png;base64,abc",
      }),
    ).toBe(false)
    expect(
      isStrippedInlineAttachment({
        type: "image",
        mime: "image/png",
        dataUrl: "",
        sourcePath: "C:\\scan.png",
      }),
    ).toBe(false)
  })

  test("mixed restore keeps valid attachments and only drops stripped ones", () => {
    const result = buildRequestParts({
      ...base,
      images: [
        { type: "image", id: "ok", filename: "small.png", mime: "image/png", dataUrl: "data:image/png;base64,abc" },
        { type: "image", id: "gone", filename: "huge.png", mime: "image/png", dataUrl: "" },
      ],
    })
    const files = result.requestParts.filter((part) => part.type === "file")
    expect(files).toHaveLength(1)
    expect(files[0]!.type === "file" && files[0]!.filename).toBe("small.png")
  })
})
