import { afterEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, truncate, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Schema } from "effect"
import { StorageHealth } from "@opencode-ai/schema/storage-health"
import { StorageHealthScanner } from "../src/storage-health"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(async (root) => {
      const resolved = path.resolve(root)
      if (!resolved.startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error(`Unsafe fixture root: ${resolved}`)
      await rm(resolved, { recursive: true, force: true })
    }),
  )
})

describe("StorageHealthScanner", () => {
  test("AC10 classifies bounded storage targets and leaves every fixture unchanged", async () => {
    const root = await fixtureRoot()
    const external = await fixtureRoot()
    const files = {
      normal: path.join(root, "normal.db"),
      huge: path.join(root, "huge-placeholder.db"),
      global: path.join(root, "large-global-state.dat"),
      workspace: path.join(root, "workspace-state.dat"),
      draft: path.join(root, "draft"),
      cache: path.join(root, "cache"),
      logs: path.join(root, "logs"),
      temp: path.join(root, "temp"),
    }
    await Promise.all([files.draft, files.cache, files.logs, files.temp].map((dir) => mkdir(dir, { recursive: true })))
    await Promise.all([
      writeFile(files.normal, "n".repeat(512)),
      writeFile(files.huge, ""),
      writeFile(files.global, "g".repeat(6_000)),
      writeFile(files.workspace, "w".repeat(2_500)),
      writeFile(path.join(files.cache, "small.bin"), "c".repeat(1_024)),
      writeFile(path.join(files.cache, "largest.bin"), "c".repeat(4_096)),
      writeFile(path.join(files.logs, "main.log"), "l".repeat(500)),
      writeFile(path.join(files.temp, "current.tmp"), "t".repeat(500)),
      writeFile(path.join(external, "must-not-be-counted.bin"), "x".repeat(16_384)),
      ...Array.from({ length: 6 }, (_, index) => writeFile(path.join(files.draft, `draft-${index + 1}.dat`), "d".repeat(256))),
    ])
    await truncate(files.huge, 8_192)
    await symlink(external, path.join(files.cache, "external-link"), process.platform === "win32" ? "junction" : "dir")

    const before = await fingerprint(root)
    const report = await StorageHealthScanner.scan(
      [
        { id: "normal-db", category: "SQLITE", path: files.normal },
        { id: "large-db", category: "SQLITE", path: files.huge },
        { id: "global", category: "GLOBAL_STATE", path: files.global },
        { id: "workspace", category: "WORKSPACE_STATE", path: files.workspace },
        { id: "drafts", category: "DRAFT", path: files.draft, maxDepth: 0 },
        { id: "cache", category: "CACHE", path: files.cache, maxDepth: 2 },
        { id: "logs", category: "LOG", path: files.logs, maxDepth: 1 },
        { id: "temp", category: "TEMP", path: files.temp, maxDepth: 1 },
        { id: "attachments", category: "ATTACHMENT", path: path.join(root, "missing-attachments") },
      ],
      { policy: diagnosticPolicy() },
    )
    const after = await fingerprint(root)

    expect(Schema.decodeUnknownSync(StorageHealth.Report)(report)).toEqual(report)
    expect(report.mutationCount).toBe(0)
    expect(after).toEqual(before)
    expect(find(report, "normal-db").healthStatus).toBe("HEALTHY")
    expect(find(report, "large-db").healthStatus).toBe("CRITICAL")
    expect(find(report, "global").healthStatus).toBe("CRITICAL")
    expect(find(report, "workspace").healthStatus).toBe("WARNING")
    expect(find(report, "drafts")).toMatchObject({ objectCount: 6, healthStatus: "WARNING" })
    expect(find(report, "cache").largestItems[0]?.path).toBe(path.join(files.cache, "largest.bin"))
    expect(find(report, "cache").skippedItems).toBe(1)
    expect(find(report, "cache").sizeBytes).toBe(5_120)
    expect(find(report, "attachments").discoveryStatus).toBe("NOT_DISCOVERED")
    expect(report.findings.every((finding) => finding.recommendedAction.length > 0)).toBe(true)
  })

  test("stops at configured item bounds without reading file contents", async () => {
    const root = await fixtureRoot()
    await Promise.all(
      Array.from({ length: 10 }, (_, index) => writeFile(path.join(root, `${index}.log`), "x".repeat(index + 1))),
    )

    const report = await StorageHealthScanner.scan([
      { id: "bounded", category: "LOG", path: root, maxDepth: 0, maxItems: 3 },
    ])
    const finding = find(report, "bounded")

    expect(finding.truncated).toBe(true)
    expect(finding.scannedItems).toBe(3)
    expect(finding.healthStatus).toBe("WARNING")
    expect(report.complete).toBe(false)
    expect(report.mutationCount).toBe(0)
  })

  test("reports unavailable categories without guessing a path", async () => {
    const report = await StorageHealthScanner.scan([
      {
        id: "vector",
        category: "VECTOR_INDEX",
        path: "",
        discoveryStatus: "NOT_APPLICABLE",
        reason: "No vector index is owned by this runtime.",
      },
    ])

    expect(report.healthStatus).toBe("UNKNOWN")
    expect(report.complete).toBe(true)
    expect(find(report, "vector")).toMatchObject({
      path: "",
      discoveryStatus: "NOT_APPLICABLE",
      healthStatus: "UNKNOWN",
      recommendedAction: "No vector index is owned by this runtime.",
    })
  })
})

async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "opencode-storage-health-"))
  roots.push(root)
  return root
}

function diagnosticPolicy(): StorageHealthScanner.Policy {
  const base = { warningBytes: 1_024, criticalBytes: 4_096, warningObjects: 100, criticalObjects: 1_000 }
  return {
    ...StorageHealthScanner.defaultPolicy,
    SQLITE: base,
    GLOBAL_STATE: base,
    WORKSPACE_STATE: { ...base, warningBytes: 2_048 },
    DRAFT: { ...base, warningBytes: 4_096, criticalBytes: 20_000, warningObjects: 5, criticalObjects: 20 },
    CACHE: { ...base, warningBytes: 4_096, criticalBytes: 10_000 },
    LOG: base,
    TEMP: base,
  }
}

function find(report: StorageHealthScanner.Report, id: string) {
  const finding = report.findings.find((item) => item.id === id)
  if (!finding) throw new Error(`Missing finding: ${id}`)
  return finding
}

async function fingerprint(root: string) {
  const result: Record<string, { type: "file" | "link"; size: number; modified: number; sha256?: string }> = {}
  const pending = [root]
  while (pending.length > 0) {
    const current = pending.shift()!
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name)
      const relative = path.relative(root, absolute).replaceAll("\\", "/")
      const info = await lstat(absolute)
      if (info.isSymbolicLink()) {
        result[relative] = { type: "link", size: info.size, modified: info.mtimeMs }
        continue
      }
      if (info.isDirectory()) {
        pending.push(absolute)
        continue
      }
      if (!info.isFile()) continue
      result[relative] = {
        type: "file",
        size: info.size,
        modified: info.mtimeMs,
        sha256: createHash("sha256").update(await readFile(absolute)).digest("hex"),
      }
    }
  }
  return result
}
