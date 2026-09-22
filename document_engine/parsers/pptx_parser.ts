import JSZip from "jszip"
import { DocumentParseError } from "../../domains/shared"
import { createParsedDocument, normalizeBinaryContent } from "../types"
import type { DocumentParagraph, DocumentParser, DocumentTable } from "../types"

export const parsePptxDocument: DocumentParser = async (input) => {
  if (typeof input.content === "string") {
    return createParsedDocument({
      fileId: input.fileId,
      fileName: input.fileName,
      fileType: "pptx",
      rawText: input.content.trim(),
      metadata: { ...input.metadata, parser: "pptx_parser", mode: "extracted_text" },
    })
  }

  const buffer = normalizeBinaryContent(input.content)
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new DocumentParseError(`无法解析“${input.fileName}”：文件不是有效的 PPTX/ZIP 二进制内容。`, {
      fileName: input.fileName,
      parser: "pptx_parser",
    })
  }

  try {
    const archive = await JSZip.loadAsync(buffer)
    const slides = Object.keys(archive.files)
      .map((name) => ({ name, match: /^ppt\/slides\/slide(\d+)\.xml$/i.exec(name) }))
      .filter((entry): entry is { name: string; match: RegExpExecArray } => Boolean(entry.match))
      .sort((a, b) => Number(a.match[1]) - Number(b.match[1]))
    if (slides.length === 0) throw new Error("演示文稿中没有可读取的幻灯片")

    const paragraphs: DocumentParagraph[] = []
    const tables: DocumentTable[] = []
    for (const slide of slides) {
      const number = Number(slide.match[1])
      const xml = await archive.file(slide.name)!.async("string")
      const tableRanges = [...xml.matchAll(/<a:tbl(?:\s[^>]*)?>([\s\S]*?)<\/a:tbl>/gi)]
      const body = [...xml.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/gi)]
        .map((item) => extractText(item[1]))
        .filter(Boolean)
      body.forEach((text) => {
        paragraphs.push({
          index: paragraphs.length + 1,
          text,
          location: `幻灯片 ${number}`,
          section: `幻灯片 ${number}`,
          sourcePath: `幻灯片 ${number}`,
        })
      })
      tableRanges.forEach((table) => {
        const rows = [...table[1].matchAll(/<a:tr(?:\s[^>]*)?>([\s\S]*?)<\/a:tr>/gi)]
          .map((row) =>
            [...row[1].matchAll(/<a:tc(?:\s[^>]*)?>([\s\S]*?)<\/a:tc>/gi)].map((cell) => extractText(cell[1])),
          )
          .filter((row) => row.some(Boolean))
        if (rows.length === 0) return
        tables.push({
          index: tables.length + 1,
          rows,
          location: `幻灯片 ${number} 表格 ${tables.length + 1}`,
          caption: `幻灯片 ${number} 表格`,
          sourcePath: `幻灯片 ${number}/表格`,
        })
      })
    }

    const rawText = slides
      .map((slide) => {
        const number = Number(slide.match[1])
        return [
          `## 幻灯片 ${number}`,
          ...paragraphs.filter((item) => item.location === `幻灯片 ${number}`).map((item) => item.text),
        ].join("\n")
      })
      .join("\n\n")
      .trim()
    if (!rawText) throw new Error("演示文稿没有可提取的文本内容")

    return createParsedDocument({
      fileId: input.fileId,
      fileName: input.fileName,
      fileType: "pptx",
      rawText,
      paragraphs,
      tables,
      metadata: {
        ...input.metadata,
        parser: "pptx_parser",
        mode: "ooxml",
        slideCount: slides.length,
        unparsedImageCount: Object.keys(archive.files).filter((name) => /^ppt\/media\//i.test(name)).length,
      },
    })
  } catch (error) {
    if (error instanceof DocumentParseError) throw error
    throw new DocumentParseError(
      `无法解析“${input.fileName}”：${error instanceof Error ? error.message : String(error)}`,
      { fileName: input.fileName, parser: "pptx_parser" },
    )
  }
}

function extractText(xml: string) {
  return [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi)]
    .map((match) => decodeXml(match[1]))
    .join("")
    .trim()
}

function decodeXml(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
}
