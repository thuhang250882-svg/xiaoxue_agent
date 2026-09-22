import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"

// 保存用户上传/可信选择的字节，供同一会话重复审核；URL 不包含可任意读盘的路径。
export function createDocumentAttachmentStore(root: string) {
  const owner = (sessionID: string) => createHash("sha256").update(sessionID).digest("hex")
  return {
    async save(sessionID: string, bytes: Uint8Array) {
      if (!bytes.length) throw new Error("附件内容为空，请重新上传原文件。")
      if (bytes.length > 100 * 1024 * 1024) throw new Error("附件超过 100 MB 上限，请拆分后重试。")
      const folder = owner(sessionID)
      const id = randomUUID()
      await mkdir(path.join(root, folder), { recursive: true })
      await writeFile(path.join(root, folder, id), bytes, { flag: "wx", mode: 0o600 })
      return `xiaoxue-document:${folder}/${id}`
    },
    async read(sessionID: string, url: string) {
      const match =
        /^xiaoxue-document:([a-f0-9]{64})\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.exec(url)
      if (!match || match[1] !== owner(sessionID)) throw new Error("附件副本不属于当前会话或地址无效，请重新上传。")
      const target = path.join(root, match[1], match[2])
      const info = await stat(target)
      if (!info.isFile() || info.size > 100 * 1024 * 1024) throw new Error("附件副本无效，请重新上传。")
      return new Uint8Array(await readFile(target))
    },
    async remove(sessionID: string) {
      await rm(path.join(root, owner(sessionID)), { recursive: true, force: true })
    },
  }
}

export const documentAttachments = createDocumentAttachmentStore(path.join(Global.Path.data, "document-attachments"))
