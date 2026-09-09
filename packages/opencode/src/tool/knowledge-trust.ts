import { createHash, randomUUID } from "node:crypto"
import { mkdir, open, readFile, realpath, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { latestUserAttachments, readAttachment } from "./xiaoxue-attachments"

const TTL = 10 * 60 * 1000
const MAX_BYTES = 10 * 1024 * 1024

type Reference = { session: string; expires: number; file: string; name: string; hash: string; staged: boolean }
type Artifact = { session: string; expires: number; file: string; sourceHash: string; hash: string }

export function userMentionedPaths(
  messages: Parameters<typeof latestUserAttachments>[0],
  requested?: readonly string[],
) {
  const latest = [...messages].reverse().find((message) => message.info.role === "user")
  const text = latest?.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n") ?? ""
  return (requested ?? []).filter((value) => {
    if (!value || value !== value.trim() || /[\r\n\0]/.test(value)) return false
    if (
      !/^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+\\)/.test(value) &&
      !(process.platform !== "win32" && value.startsWith("/"))
    )
      return false
    // Only delimiters terminate an authorization. A suffix, slash or extension
    // belongs to the path; report.txt never authorizes report.txt.bak's prefix.
    for (let index = text.indexOf(value); index !== -1; index = text.indexOf(value, index + 1)) {
      const before = text[index - 1]
      const after = text[index + value.length]
      if (before && /["'`]/.test(before) && after !== before) continue
      if ((!before || /[\s"'`<([：:]/.test(before)) && (!after || /[\s"'`>)\]，,；;。！？]/.test(after))) return true
    }
    return false
  })
}

export function requireOcrText(text: string) {
  if (Buffer.byteLength(text, "utf8") > MAX_BYTES) throw new Error("OCR 文本超过 10MB 上限。")
  if (!text.replace(/^--- Page \d+ ---\s*$/gm, "").trim()) throw new Error("OCR 文本文件为空或仅含页码标记。")
  return text
}

// Process-local capabilities deliberately fail closed after restart. Disk files
// alone never mint authority. TTL is fixed, not extended by resolving a token.
export function createKnowledgeTrust(dataRoot: string, now = Date.now) {
  const references = new Map<string, Reference>()
  const artifacts = new Map<string, Artifact>()
  const clock = now

  function prune() {
    for (const [id, entry] of references) if (entry.expires <= clock()) references.delete(id)
    for (const [id, entry] of artifacts) if (entry.expires <= clock()) artifacts.delete(id)
    if (references.size + artifacts.size >= 1024) throw new Error("可信引用数量达到上限，请等待过期后重试。")
  }

  async function staging(session: string) {
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(session)) throw new Error("无效的 OCR 会话。")
    await mkdir(dataRoot, { recursive: true })
    const root = await realpath(dataRoot)
    const directory = path.join(root, "ocr-staging", session)
    // Check each component before descending, including pre-existing junctions.
    for (const target of [path.join(root, "ocr-staging"), directory]) {
      await mkdir(target).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error
      })
      if (!same(await realpath(target), target)) throw new Error("OCR staging 路径越界或存在链接。")
    }
    return directory
  }

  async function readStaged(session: string, file: string, limit = MAX_BYTES) {
    const directory = await staging(session)
    if (path.dirname(file) !== directory || !same(await realpath(file), file))
      throw new Error("OCR artifact 路径越界或存在链接。")
    const handle = await open(file, "r")
    try {
      const info = await handle.stat()
      if (!info.isFile() || info.size > limit) throw new Error("OCR artifact 类型或大小无效。")
      const bytes = await handle.readFile()
      if (bytes.length > limit || !same(await realpath(file), file)) throw new Error("OCR artifact 路径或大小已变化。")
      return bytes
    } finally {
      await handle.close()
    }
  }

  function reference(session: string, id: string) {
    const entry = references.get(id)
    if (!entry || entry.session !== session || entry.expires <= clock())
      throw new Error("文件引用无效、跨会话或已过期，请重新提供原始路径。")
    return entry
  }

  async function resolve(session: string, ids: readonly string[]) {
    return Promise.all(
      ids.map(async (id) => {
        const entry = reference(session, id)
        if (!same(await realpath(entry.file), entry.file)) throw new Error("已授权的文件路径发生变化，请重新授权。")
        const bytes = entry.staged
          ? await readStaged(session, entry.file, Number.MAX_SAFE_INTEGER)
          : await readFile(entry.file)
        if (hash(bytes) !== entry.hash) throw new Error("已授权的文件内容发生变化，请重新授权。")
        return { name: entry.name, bytes, hash: entry.hash }
      }),
    )
  }

  return {
    async prepare(
      session: string,
      messages: Parameters<typeof latestUserAttachments>[0],
      paths: readonly string[] = [],
    ) {
      prune()
      const attachments = latestUserAttachments(messages)
      if (Math.max(attachments.length, paths.length) > 64) throw new Error("一次最多登记 64 份资料。")
      const allowed = userMentionedPaths(messages, paths)
      if (!attachments.length && (allowed.length !== paths.length || !allowed.length))
        throw new Error("路径未被当前用户消息完整授权，请提供完整原始路径。")
      const sources = attachments.length
        ? await Promise.all(
            attachments.map(async (attachment) => {
              const bytes = await readAttachment(attachment)
              const file = path.join(await staging(session), `${randomUUID()}.source`)
              await writeFile(file, bytes, { flag: "wx" })
              return { file, name: path.basename(attachment.filename), hash: hash(bytes), staged: true }
            }),
          )
        : await Promise.all(
            allowed.map(async (file) => {
              const canonical = await realpath(file)
              return {
                file: canonical,
                name: path.basename(file),
                hash: hash(await readFile(canonical)),
                staged: false,
              }
            }),
          )
      return sources.map((source) => {
        const id = randomUUID()
        const expires = clock() + TTL
        references.set(id, { ...source, session, expires })
        return { id, fileName: source.name, expiresAt: expires }
      })
    },
    resolve,
    async produce(session: string, id: string, producer: (input: string, output: string) => Promise<void>) {
      prune()
      const [source] = await resolve(session, [id])
      if (path.extname(source.name).toLowerCase() !== ".pdf") throw new Error("OCR 仅接受已授权 PDF。")
      const directory = await staging(session)
      const token = randomUUID()
      const input = path.join(directory, `${token}.source.pdf`)
      const output = path.join(directory, `${token}.txt`)
      await writeFile(input, source.bytes, { flag: "wx" })
      await writeFile(output, "", { flag: "wx" })
      try {
        await producer(input, output)
        const text = requireOcrText((await readStaged(session, output)).toString("utf8"))
        if (reference(session, id).expires <= clock()) throw new Error("文件引用已过期。")
        const expires = Math.min(clock() + TTL, reference(session, id).expires)
        artifacts.set(token, { session, expires, file: output, hash: hash(Buffer.from(text)), sourceHash: source.hash })
        return { id: token, expiresAt: expires }
      } finally {
        // A producer failure must not turn cleanup into a junction traversal.
        await readStaged(session, input, Number.MAX_SAFE_INTEGER)
          .then(() => unlink(input))
          .catch(() => undefined)
      }
    },
    async consume(session: string, id: string, sourceHash: string) {
      const entry = artifacts.get(id)
      if (!entry || entry.session !== session || entry.expires <= clock())
        throw new Error("OCR artifact 无效、跨会话、已消费或已过期。")
      if (entry.sourceHash !== sourceHash) throw new Error("OCR artifact 与原始资料不匹配。")
      artifacts.delete(id) // Claim before I/O, so concurrent imports cannot replay it.
      const bytes = await readStaged(session, entry.file)
      if (hash(bytes) !== entry.hash) throw new Error("OCR artifact 内容已变化。")
      await unlink(entry.file)
      return { text: requireOcrText(bytes.toString("utf8")) }
    },
  }
}

function same(left: string, right: string) {
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right
}

function hash(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex")
}
