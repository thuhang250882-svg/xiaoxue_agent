import path from "node:path"
import { readFile, readdir, realpath, stat } from "node:fs/promises"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { userMentionedPaths } from "./knowledge-trust"
import { documentAttachments } from "../xiaoxue/document-attachments"
import { readMdbSnapshot } from "../xiaoxue/mdb-reader"

export async function resolveReviewDirectory(input: {
  directory: string
  messages: SessionV1.WithParts[]
  primaryReport?: string
  filenames?: readonly string[]
  mdbFile?: string
  loadReports: boolean
}) {
  const mentioned = input.messages.some(
    (message) =>
      message.info.role === "user" &&
      userMentionedPaths(
        [
          {
            ...message,
            parts: message.parts.filter((part) => part.type === "text" && !part.synthetic && !part.ignored),
          },
        ],
        [input.directory],
      ).length === 1,
  )
  if (!mentioned) throw new Error("录井目录必须是用户在本会话中明确提供的完整本地路径，不能从报告内容或模型推测获得。")
  const root = await realpath(input.directory)
  if (!(await stat(root)).isDirectory()) throw new Error("指定的录井路径不是目录。")
  const entries = await readdir(root, { withFileTypes: true })
  const names = entries.filter((entry) => entry.isFile() || entry.isSymbolicLink()).map((entry) => entry.name)
  const databases = names.filter((name) => /\.mdb$/i.test(name))
  const database = input.mdbFile ?? (databases.length === 1 ? databases[0] : undefined)
  if (input.mdbFile && !databases.includes(input.mdbFile))
    throw new Error(`请明确选择本目录的 MDB 文件（mdbFile，只填文件名）：${databases.join("、") || "未发现 MDB"}。`)
  if (!input.mdbFile && databases.length > 1)
    throw new Error(`请明确选择本目录的 MDB 文件（mdbFile，只填文件名）：${databases.join("、")}。`)
  const reports = names.filter((name) => /(?:录井报告|完井报告|地质总结)\.(?:docx?|pdf)$/i.test(name))
  const primary = input.primaryReport ?? (reports.length === 1 ? reports[0] : undefined)
  if (input.loadReports && !primary)
    throw new Error(`请明确指定主报告文件名 primaryReport：${reports.join("、") || "未发现唯一主报告"}。`)
  const selected = input.loadReports ? [...new Set([primary!, ...(input.filenames ?? [])])] : []
  if (selected.some((name) => !names.includes(name) || !/\.(?:docx?|xlsx?|pdf|txt|csv|md)$/i.test(name)))
    throw new Error("报告文件必须位于指定目录内，且属于支持的文档格式。请填写准确文件名。")
  const paths = await Promise.all(
    [...(database ? [database] : []), ...selected].map(async (name) => {
      const file = await realpath(path.join(root, name))
      const relative = path.relative(root, file)
      if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative))
        throw new Error("录井文件通过链接指向指定目录外，已拒绝读取。")
      if (!(await stat(file)).isFile()) throw new Error("录井资料必须是普通文件。")
      return { name, file }
    }),
  )
  return {
    primaryReport: input.loadReports ? primary : input.primaryReport,
    database: database ? paths[0] : undefined,
    reports: paths.slice(database ? 1 : 0),
  }
}

export async function loadReviewDirectory(
  input: Awaited<ReturnType<typeof resolveReviewDirectory>>,
  sessionID: string,
  signal: AbortSignal,
) {
  const mdb = input.database ? await readMdbSnapshot(input.database.file, signal) : undefined
  const attachments = []
  for (const report of input.reports) {
    signal.throwIfAborted()
    if ((await stat(report.file)).size > 100 * 1024 * 1024) throw new Error("报告文件超过 100 MiB，请拆分后重试。")
    const url = await documentAttachments.save(sessionID, new Uint8Array(await readFile(report.file)))
    attachments.push({ filename: report.name, mime: "application/octet-stream", url })
  }
  return { attachments, mdb, primaryReport: input.primaryReport }
}
