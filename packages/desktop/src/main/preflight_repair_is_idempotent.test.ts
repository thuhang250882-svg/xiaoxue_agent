import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { preflightRepairStores } from "./store-repair"

const roots: string[] = []

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "opencode-store-repair-"))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function oversizedStoreRaw() {
  return JSON.stringify({
    "prompt-history": {
      version: 1,
      entries: [
        {
          prompt: [
            {
              type: "image",
              id: "att-1",
              filename: "report.doc",
              sourcePath: "C:\\report.doc",
              mime: "application/msword",
              dataUrl: `data:application/msword;base64,${"A".repeat(600 * 1024)}`,
            },
          ],
        },
      ],
    },
    theme: "dark",
  })
}

describe("preflight repair is idempotent", () => {
  test("second preflight run finds nothing to repair and touches nothing", async () => {
    const root = await tempRoot()
    const path = join(root, "opencode.global.dat")
    await writeFile(path, oversizedStoreRaw())

    const first = preflightRepairStores(root, { threshold: 1024 })
    expect(first.repaired).toBe(true)
    const repairedRaw = await readFile(path, "utf-8")
    const backupRaw = await readFile(`${path}.bak`, "utf-8")

    const second = preflightRepairStores(root, { threshold: 1024 })

    expect(second.entries).toEqual([])
    expect(second.repaired).toBe(false)
    expect(await readFile(path, "utf-8")).toBe(repairedRaw)
    expect(await readFile(`${path}.bak`, "utf-8")).toBe(backupRaw)
  })

  test("repairing an already-small store does not rewrite or re-backup", async () => {
    const root = await tempRoot()
    const path = join(root, "opencode.global.dat")
    const small = JSON.stringify({ theme: "dark" })
    await writeFile(path, small)
    await writeFile(`${path}.bak`, "ORIGINAL_BACKUP")

    preflightRepairStores(root, { threshold: 0 })

    expect(await readFile(path, "utf-8")).toBe(small)
    expect(await readFile(`${path}.bak`, "utf-8")).toBe("ORIGINAL_BACKUP")
  })
})
