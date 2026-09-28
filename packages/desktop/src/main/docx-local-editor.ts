import { createHash, randomUUID } from "node:crypto"
import { readFile, realpath, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import JSZip from "jszip"
import { allowedLocalPath } from "./security-policy"

const MAX_DOCX_BYTES = 50 * 1024 * 1024
const MAX_PARAGRAPHS = 10_000
const MAX_PARAGRAPH_CHARS = 20_000
const paragraphPattern = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g
const textPattern = /(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g

export async function readEditableDocx(filePath: string) {
  const source = allowedLocalPath(await realpath(allowedLocalPath(filePath)))
  if (path.extname(source).toLowerCase() !== ".docx") throw new Error("仅支持编辑 DOCX 文件。")
  if ((await stat(source)).size > MAX_DOCX_BYTES) throw new Error("DOCX 文件超过本地编辑上限。")
  const data = await readFile(source)
  const zip = await JSZip.loadAsync(data)
  const xml = await zip.file("word/document.xml")?.async("string")
  if (!xml) throw new Error("DOCX 缺少正文内容。")
  const paragraphs = [...xml.matchAll(paragraphPattern)]
    .map((match) => [...match[0].matchAll(textPattern)].map((text) => decodeXml(text[2])).join(""))
    .flatMap((text, index) => text ? [{ index, text }] : [])
  if (paragraphs.length > MAX_PARAGRAPHS) throw new Error("DOCX 正文段落超过本地编辑上限。")
  return {
    filePath: source,
    fileName: path.basename(source),
    sha256: createHash("sha256").update(data).digest("hex"),
    paragraphs,
  }
}

export async function saveEditableDocx(input: {
  filePath: string
  expectedSha256: string
  edits: { index: number; text: string }[]
}) {
  const source = allowedLocalPath(await realpath(allowedLocalPath(input.filePath)))
  if (path.extname(source).toLowerCase() !== ".docx") throw new Error("仅支持编辑 DOCX 文件。")
  if ((await stat(source)).size > MAX_DOCX_BYTES) throw new Error("DOCX 文件超过本地编辑上限。")
  const data = await readFile(source)
  if (createHash("sha256").update(data).digest("hex") !== input.expectedSha256) {
    throw new Error("原文件已发生变化，请重新打开后再编辑。")
  }
  if (input.edits.length > MAX_PARAGRAPHS) throw new Error("修改段落数量超过上限。")
  const edits = new Map(input.edits.map((item) => {
    if (!Number.isSafeInteger(item.index) || item.index < 0) throw new Error("段落索引无效。")
    if (typeof item.text !== "string" || item.text.length > MAX_PARAGRAPH_CHARS) throw new Error("段落内容超过上限。")
    return [item.index, item.text] as const
  }))
  if (edits.size !== input.edits.length) throw new Error("段落索引重复。")
  const zip = await JSZip.loadAsync(data)
  const xml = await zip.file("word/document.xml")?.async("string")
  if (!xml) throw new Error("DOCX 缺少正文内容。")
  let index = 0
  const updated = xml.replace(paragraphPattern, (paragraph) => {
    const text = edits.get(index++)
    if (text === undefined) return paragraph
    let first = true
    const result = paragraph.replace(textPattern, (_match, open: string, _value: string, close: string) => {
      if (!first) return `${open}${close}`
      first = false
      const tag = /xml:space=/.test(open) ? open : open.replace(/>$/, ' xml:space="preserve">')
      return `${tag}${escapeXml(text)}${close}`
    })
    if (first) throw new Error("目标段落不含可编辑文字。")
    return result
  })
  if ([...edits.keys()].some((key) => key >= index)) throw new Error("段落索引超出正文范围。")
  zip.file("word/document.xml", updated)
  const output = allowedLocalPath(path.join(path.dirname(source), `${path.basename(source, ".docx")}_已编辑_${randomUUID().slice(0, 8)}.docx`))
  await writeFile(output, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }), { flag: "wx" })
  return { filePath: output, fileName: path.basename(output) }
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function decodeXml(value: string) {
  return value.replace(/&(?:#(x[0-9a-fA-F]+|\d+)|amp|lt|gt|quot|apos);/g, (entity, numeric: string | undefined) => {
    if (numeric) return String.fromCodePoint(numeric.startsWith("x") ? Number.parseInt(numeric.slice(1), 16) : Number(numeric))
    return ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" } as Record<string, string>)[entity] ?? entity
  })
}
