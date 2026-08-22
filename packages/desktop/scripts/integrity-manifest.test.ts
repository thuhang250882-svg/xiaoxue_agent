import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { ResourceIntegrityCore } from "../src/main/resource-integrity-core"
import type { Manifest } from "../src/main/resource-integrity-core"

let directory = ""

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "xiaoxue-int-"))
})

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
  directory = ""
})

describe("resource integrity verification", () => {
  test("passes when every manifest entry matches on-disk bytes", async () => {
    const skillsDir = await mkdtemp(path.join(os.tmpdir(), "xiaoxue-int-skills-"))
    const pythonDir = await mkdtemp(path.join(os.tmpdir(), "xiaoxue-int-python-"))
    try {
      const skill = path.join(skillsDir, "SKILL.md")
      await writeFile(skill, "approved")
      const py = path.join(pythonDir, "python.exe")
      await writeFile(py, "binary")
      const manifest = {
        version: 1,
        files: [
          { path: "skills/SKILL.md", sha256: createHash("sha256").update("approved").digest("hex") },
          { path: "python/python.exe", sha256: createHash("sha256").update("binary").digest("hex") },
        ],
      } satisfies Manifest
      // 不同 prefix 必须用不同 directory 验证, 与 packaged runtime 一致。
      ResourceIntegrityCore.verify("skills", skillsDir, manifest)
      ResourceIntegrityCore.verify("python", pythonDir, manifest)
    } finally {
      await rm(skillsDir, { recursive: true, force: true })
      await rm(pythonDir, { recursive: true, force: true })
    }
  })

  test("fails when a Python runtime file is tampered", async () => {
    const py = path.join(directory, "python.exe")
    await writeFile(py, "original")
    const manifest = {
      version: 1,
      files: [{ path: "python/python.exe", sha256: createHash("sha256").update("original").digest("hex") }],
    } satisfies Manifest
    await writeFile(py, "tampered")
    expect(() => ResourceIntegrityCore.verify("python", directory, manifest)).toThrow("完整性校验失败")
  })

  test("fails when a Python runtime file is missing", async () => {
    const py = path.join(directory, "python.exe")
    const manifest = {
      version: 1,
      files: [{ path: "python/python.exe", sha256: createHash("sha256").update("original").digest("hex") }],
    } satisfies Manifest
    expect(() => ResourceIntegrityCore.verify("python", directory, manifest)).toThrow()
  })

  test("fails when a Skill hash is stale relative to the manifest", async () => {
    const skill = path.join(directory, "SKILL.md")
    await writeFile(skill, "current content")
    const staleHash = createHash("sha256").update("old content").digest("hex")
    const manifest = {
      version: 1,
      files: [{ path: "skills/SKILL.md", sha256: staleHash }],
    } satisfies Manifest
    expect(() => ResourceIntegrityCore.verify("skills", directory, manifest)).toThrow("完整性校验失败")
  })

  test("fails when on-disk file count differs from manifest", async () => {
    const skill = path.join(directory, "SKILL.md")
    await writeFile(skill, "approved")
    const manifest = {
      version: 1,
      files: [{ path: "skills/SKILL.md", sha256: createHash("sha256").update("approved").digest("hex") }],
    } satisfies Manifest
    await writeFile(path.join(directory, "unexpected.md"), "extra")
    expect(() => ResourceIntegrityCore.verify("skills", directory, manifest)).toThrow("文件数量不一致")
  })

  test("rejects malformed manifest", () => {
    expect(ResourceIntegrityCore.isManifest(null)).toBe(false)
    expect(ResourceIntegrityCore.isManifest({ version: 2, files: [] })).toBe(false)
    expect(ResourceIntegrityCore.isManifest({ version: 1, files: [{ path: "x" }] })).toBe(false)
    expect(ResourceIntegrityCore.isManifest({ version: 1, files: [] })).toBe(true)
  })
})
