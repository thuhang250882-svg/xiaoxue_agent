import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { Document, Packer, Paragraph } from "docx"
import JSZip from "jszip"
import { tmpdir } from "../fixture/fixture"
import { createDocumentAttachmentStore, documentAttachments } from "../../src/xiaoxue/document-attachments"
import { extractOfficeDataAttachment } from "../../src/session/office-attachment"
import { parseAttachments } from "../../src/tool/xiaoxue-attachments"
import { reviewUploadedAttachments } from "../../../../domains/geology_report/upload_review"

test("PPTX attachments are extracted and remain available to later tools", async () => {
  const sessionID = `ses_${randomUUID()}`
  const archive = new JSZip()
  archive.file(
    "ppt/slides/slide1.xml",
    '<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a"><p:cSld><a:p><a:r><a:t>井控月报</a:t></a:r></a:p><a:p><a:r><a:t>修改后的结论</a:t></a:r></a:p></p:cSld></p:sld>',
  )
  archive.file("ppt/media/image1.png", Uint8Array.of(137, 80, 78, 71))
  const bytes = await archive.generateAsync({ type: "uint8array" })
  try {
    const result = await extractOfficeDataAttachment({
      filename: "井控月报.pptx",
      mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      url: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${Buffer.from(bytes).toString("base64")}`,
      sessionID,
    })
    expect(result.text).toContain("井控月报")
    expect(result.text).toContain("修改后的结论")
    expect(result.text).toContain("嵌入图片")
    const parsed = await parseAttachments([
      {
        filename: "井控月报.pptx",
        mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        url: result.url,
        sessionID,
      },
    ])
    expect(parsed[0].fileType).toBe("pptx")
    expect(parsed[0].metadata.slideCount).toBe(1)
  } finally {
    await documentAttachments.remove(sessionID)
  }
})

test("stored document survives reopening, rejects cross-session reads and traversal, and is removed with its owner", async () => {
  await using tmp = await tmpdir()
  const store = createDocumentAttachmentStore(tmp.path)
  const bytes = new TextEncoder().encode("private attachment")
  const url = await store.save("session-a", bytes)
  expect(await createDocumentAttachmentStore(tmp.path).read("session-a", url)).toEqual(bytes)
  await expect(store.read("session-b", url)).rejects.toThrow("不属于当前会话")
  await expect(store.read("session-a", "xiaoxue-document:../../secret")).rejects.toThrow("地址无效")
  await store.remove("session-a")
  await expect(store.read("session-a", url)).rejects.toThrow()
})

test("preview keeps a full DOCX snapshot for repeated business review beyond the prompt limit", async () => {
  const sessionID = `ses_${randomUUID()}`
  const bytes = await Packer.toBuffer(
    new Document({
      sections: [
        {
          children: [
            new Paragraph("XX1井地质录井报告"),
            new Paragraph("正文".repeat(5000)),
            new Paragraph("末尾证据：完钻井深3500m"),
          ],
        },
      ],
    }),
  )
  try {
    const result = await extractOfficeDataAttachment({
      filename: "XX1井报告.docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      url: `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${bytes.toString("base64")}`,
      sessionID,
    })
    expect(result.text).toContain("截断")
    expect(result.text).not.toContain("末尾证据")
    const attachment = {
      filename: "XX1井报告.docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      url: result.url,
      sessionID,
    }
    const parsed = await parseAttachments([attachment])
    expect(parsed[0].rawText).toContain("末尾证据：完钻井深3500m")
    for (const attempt of [1, 2]) {
      const review = await reviewUploadedAttachments({
        sessionId: sessionID,
        taskId: `review-${attempt}`,
        attachments: [attachment],
        trustedAttachments: {
          consumeUrl: async () => {
            throw new Error("must use stored snapshot")
          },
          consumeByPath: async () => {
            throw new Error("must not reread original path")
          },
          readStored: (url) => documentAttachments.read(sessionID, url),
        },
      })
      expect(review.resolvedSources?.[0].size).toBe(bytes.length)
      expect(review.resolvedSources?.[0].sha256).toHaveLength(64)
    }
  } finally {
    await documentAttachments.remove(sessionID)
  }
})
