import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  createTrustedAttachmentFileStore,
  createTrustedAttachmentId,
  trustedAttachmentUrl,
} from "@opencode-ai/core/util/trusted-attachment-registry"
import {
  importKnowledgeAttachments,
  listKnowledgeRecords,
  removeKnowledgeRecord,
  updateKnowledgeAttachment,
} from "../../src/tool/knowledge-manage"
import { loadKnowledgeDocuments, searchKnowledgeDocuments } from "../../src/tool/knowledge-search"
import { readUrl } from "../../src/xiaoxue/trusted-attachments"

assert.equal(typeof globalThis.Bun, "undefined")

const packageRoot = requirePackageRoot()
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "xiaoxue-node-runtime-"))
try {
  await verifyTrustedDocxRead()
  const knowledge = await verifyKnowledgeLifecycle()
  const fallback = await verifyFallbackScan()
  console.log(
    JSON.stringify({
      runtime: process.release.name,
      node: process.version,
      bunGlobal: typeof globalThis.Bun,
      trustedAttachmentDocx: "PASS",
      knowledge,
      fallback,
    }),
  )
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}

async function verifyTrustedDocxRead() {
  const registryDir = path.join(temporaryRoot, "trusted-registry")
  const source = path.resolve(packageRoot, "../desktop/resources/python/Lib/site-packages/docx/templates/default.docx")
  const target = path.join(temporaryRoot, "真实临时录井报告.docx")
  await mkdir(registryDir, { recursive: true })
  await copyFile(source, target)
  process.env.XIAOXUE_TRUSTED_ATTACHMENTS_DIR = registryDir

  const info = await stat(target)
  const canonicalPath = await realpath(target)
  const bytes = await readFile(target)
  const entry = {
    id: createTrustedAttachmentId(),
    absolutePath: target,
    canonicalPath,
    fileName: path.basename(target),
    size: info.size,
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: ".docx",
    modifiedAt: info.mtimeMs,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    source: "native-picker" as const,
    senderWebContentsId: 1,
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    consumed: false,
  }
  const store = createTrustedAttachmentFileStore(registryDir)
  await store.save(entry)

  const result = await readUrl(trustedAttachmentUrl(entry.id))
  assert.equal(result.entry.canonicalPath, canonicalPath)
  assert.deepEqual(Buffer.from(result.bytes), bytes)
  const consumed = await store.load(entry.id)
  assert.equal(consumed?.consumed, true)
  assert.equal(typeof consumed?.consumedAt, "number")
}

async function verifyKnowledgeLifecycle() {
  const root = path.join(temporaryRoot, "knowledge")
  const original = attachment("气测录井制度.txt", "旧版要求：异常井段记录全烃变化。")
  const first = await importKnowledgeAttachments(root, "company_rule", [original])
  const duplicate = await importKnowledgeAttachments(root, "company_rule", [original])
  assert.equal(duplicate.records[0].id, first.records[0].id)

  const updated = await updateKnowledgeAttachment(root, first.records[0].id, [
    attachment("气测录井制度.txt", "新版要求：异常井段记录全烃和组分变化，并复核解释结论。"),
  ])
  assert.equal(updated.records[0].version, 2)
  assert.equal(updated.records[0].supersedes, first.records[0].id)

  const listed = await listKnowledgeRecords(root)
  assert.equal(listed.records.length, 1)
  assert.equal(listed.records[0].id, updated.records[0].id)
  assert.equal(listed.records[0].active, true)

  const index = JSON.parse(await readFile(path.join(root, "index.json"), "utf8"))
  assert.equal(index.length, 2)
  assert.equal(index.filter((record: { active?: boolean }) => record.active).length, 1)
  assert.equal(index.find((record: { id: string }) => record.id === first.records[0].id).active, false)

  const loaded = await loadKnowledgeDocuments([root])
  assert.deepEqual(loaded.warnings, [])
  const result = searchKnowledgeDocuments("全烃组分复核", loaded.documents)
  assert.ok(result.hits.length > 0)
  assert.equal(result.hits[0].sourceId, updated.records[0].id)
  assert.equal(result.hits[0].version, 2)

  const removed = await removeKnowledgeRecord(root, updated.records[0].id)
  assert.equal(removed.records[0].id, updated.records[0].id)
  assert.equal((await listKnowledgeRecords(root)).records.length, 0)
  await assert.rejects(readFile(updated.records[0].filePath), { code: "ENOENT" })

  return { import: "PASS", update: "PASS", list: "PASS", remove: "PASS", search: "PASS", index: "PASS" }
}

async function verifyFallbackScan() {
  const root = path.join(temporaryRoot, "fallback")
  await mkdir(path.join(root, "nested"), { recursive: true })
  await mkdir(path.join(root, "_archive"), { recursive: true })
  await writeFile(path.join(root, "nested", "现场经验.txt"), "钻遇油气显示时应复核全烃变化。")
  await writeFile(path.join(root, "_archive", "旧资料.txt"), "该归档资料不得进入查询。")
  await writeFile(path.join(root, "ignored.json"), "{}")

  const loaded = await loadKnowledgeDocuments([root])
  assert.deepEqual(loaded.warnings, [])
  assert.deepEqual(
    loaded.documents.map((document) => document.fileName),
    ["现场经验.txt"],
  )
  assert.ok(searchKnowledgeDocuments("油气显示全烃", loaded.documents).hits.length > 0)
  return { recursiveScan: "PASS", archiveExcluded: "PASS", extensionsPreserved: "PASS" }
}

function attachment(filename: string, content: string) {
  return {
    filename,
    mime: "text/plain",
    url: `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`,
  }
}

function requirePackageRoot() {
  const value = process.env.XIAOXUE_NODE_GATE_PACKAGE_ROOT
  if (!value) throw new Error("XIAOXUE_NODE_GATE_PACKAGE_ROOT is required")
  return value
}
