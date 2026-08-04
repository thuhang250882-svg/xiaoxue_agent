import { afterEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { ResourceIntegrityCore } from "./resource-integrity-core"
import type { Manifest } from "./resource-integrity-core"

let directory = ""

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
  directory = ""
})

describe("bundled resource integrity", () => {
  test("accepts the manifest and rejects modified or additional files", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "xiaoxue-integrity-"))
    const file = path.join(directory, "SKILL.md")
    await writeFile(file, "approved")
    const manifest = {
      version: 1,
      files: [
        {
          path: "skills/SKILL.md",
          sha256: createHash("sha256").update("approved").digest("hex"),
        },
      ],
    } satisfies Manifest

    ResourceIntegrityCore.verify("skills", directory, manifest)
    await writeFile(file, "modified")
    expect(() => ResourceIntegrityCore.verify("skills", directory, manifest)).toThrow("完整性校验失败")
    await writeFile(file, "approved")
    await writeFile(path.join(directory, "unexpected.md"), "unexpected")
    expect(() => ResourceIntegrityCore.verify("skills", directory, manifest)).toThrow("文件数量不一致")
  })

  test("accepts Chinese directory names whose locale order differs from code unit order", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "xiaoxue-integrity-"))
    // “标杆”与“文档”拼音序与 UTF-16 码元序相反，曾导致排序错位误报。
    await mkdir(path.join(directory, "标杆对比"))
    await mkdir(path.join(directory, "文档审核"))
    await writeFile(path.join(directory, "标杆对比", "SKILL.md"), "a")
    await writeFile(path.join(directory, "文档审核", "SKILL.md"), "b")
    const manifest = {
      version: 1,
      files: [
        { path: "skills/标杆对比/SKILL.md", sha256: createHash("sha256").update("a").digest("hex") },
        { path: "skills/文档审核/SKILL.md", sha256: createHash("sha256").update("b").digest("hex") },
      ],
    } satisfies Manifest

    ResourceIntegrityCore.verify("skills", directory, manifest)
  })
})
