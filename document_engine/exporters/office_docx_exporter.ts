import { Packer } from "docx"
import type { FileChild } from "docx"
import {
  companyBodyParagraph,
  companyBulletParagraph,
  companyHeading,
  companyNumberedParagraph,
  companyRightAlignedParagraph,
  companyTitle,
  createCompanyReportingDocument,
} from "../templates"

export type OfficeMaterialDocument = {
  title: string
  content: string
  recipient?: string
  author?: string
  date?: string
}

export type OfficeMaterialExportOptions = {
  outputPath?: string
  fileName?: string
}

export type ExportedOfficeMaterialFile = {
  filePath: string
  fileName: string
  format: "docx"
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  size: number
  documentFormat: "company_reporting_default"
}

export async function exportOfficeMaterialToDocx(
  material: OfficeMaterialDocument,
  options?: OfficeMaterialExportOptions,
): Promise<ExportedOfficeMaterialFile> {
  const fileName = sanitizeFileName(options?.fileName ?? `${material.title}.docx`)
  const filePath = `${(options?.outputPath ?? ".").replace(/[\\/]$/, "")}/${fileName}`
  const buffer = await Packer.toBuffer(
    createCompanyReportingDocument({
      title: material.title,
      subject: "公司上报文字材料",
      children: materialChildren(material),
    }),
  )
  const { writeFile } = await import("node:fs/promises")

  await writeFile(filePath, buffer)

  return {
    filePath,
    fileName,
    format: "docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: buffer.byteLength,
    documentFormat: "company_reporting_default",
  }
}

function materialChildren(material: OfficeMaterialDocument): FileChild[] {
  return [
    companyTitle(material.title),
    ...(material.recipient ? [companyBodyParagraph(material.recipient, { firstLine: false })] : []),
    ...parseMaterialContent(material.content),
    ...(material.author ? [companyRightAlignedParagraph(material.author)] : []),
    ...(material.date ? [companyRightAlignedParagraph(material.date)] : []),
  ]
}

function parseMaterialContent(content: string) {
  let headingIndex = 0

  return content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .flatMap((sourceLine) => {
      const line = cleanMarkdown(sourceLine.trim())
      if (!line) return []

      const headingMatch = line.match(/^(#{1,4})\s+(.+)$/)
      if (headingMatch) {
        const level = Math.max(1, headingMatch[1].length - 1) as 1 | 2 | 3
        const text = headingMatch[2].trim()
        if (level > 1) return [companyHeading(text, level)]

        headingIndex += 1
        return [companyHeading(hasHeadingNumber(text) ? text : `${chineseNumber(headingIndex)}、${text}`)]
      }

      const bulletMatch = line.match(/^[-*]\s+(.+)$/)
      if (bulletMatch) return [companyBulletParagraph(bulletMatch[1])]

      const numberedMatch = line.match(/^\d+[.、]\s*(.+)$/)
      if (numberedMatch) return [companyNumberedParagraph(numberedMatch[1])]

      return [companyBodyParagraph(line)]
    })
}

function cleanMarkdown(text: string) {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/_(.+?)_/g, "$1")
}

function hasHeadingNumber(text: string) {
  return /^(?:[一二三四五六七八九十]+、|（[一二三四五六七八九十]+）|\d+[.、]|（\d+）)/.test(text)
}

function chineseNumber(value: number) {
  const values = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"]
  if (value <= 10) return values[value - 1]
  if (value < 20) return `十${values[value - 11] ?? ""}`
  return String(value)
}

function sanitizeFileName(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
}
