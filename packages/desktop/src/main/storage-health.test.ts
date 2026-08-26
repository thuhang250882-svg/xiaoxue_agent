import { describe, expect, test } from "bun:test"
import path from "node:path"
import { storageHealthTargets } from "./storage-health"

describe("desktop storage health ownership", () => {
  test("maps current state stores and leaves future stores explicitly unavailable", () => {
    const userData = path.resolve("C:/storage-health-fixture/user-data")
    const targets = storageHealthTargets(userData)

    expect(targets.find((target) => target.id === "global-state")).toMatchObject({
      category: "GLOBAL_STATE",
      path: userData,
      maxDepth: 0,
    })
    expect(targets.find((target) => target.id === "workspace-state")?.include?.test("opencode.workspace.demo.1.dat")).toBe(
      true,
    )
    expect(targets.find((target) => target.id === "draft-state")?.include?.test("opencode.draft.demo.1.dat")).toBe(
      true,
    )
    expect(targets.find((target) => target.id === "session-database")?.include?.test("opencode-dev.db-wal")).toBe(
      true,
    )
    expect(targets.filter((target) => target.category === "LOG").length).toBeGreaterThanOrEqual(2)
    expect(targets.find((target) => target.id === "runtime-cache")?.category).toBe("CACHE")
    expect(targets.find((target) => target.id === "runtime-temp")?.category).toBe("TEMP")
    expect(targets.find((target) => target.id === "trusted-attachment-registry")?.category).toBe("ATTACHMENT")

    for (const id of ["document-extraction-cache", "ocr-cache", "vector-index"]) {
      expect(targets.find((target) => target.id === id)).toMatchObject({
        path: "",
        discoveryStatus: "NOT_APPLICABLE",
      })
    }
  })
})
