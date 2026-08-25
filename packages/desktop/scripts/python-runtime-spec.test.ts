import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { assertPythonVersion, loadPinnedPythonVersion } from "./python-runtime-spec"

let directory = ""
let specPath = ""

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "xiaoxue-py-spec-"))
  specPath = path.join(directory, "PYTHON_VERSION")
})

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
  directory = ""
  specPath = ""
})

describe("loadPinnedPythonVersion", () => {
  test("returns trimmed semver from PYTHON_VERSION", async () => {
    await writeFile(specPath, "3.14.4\n", "utf8")
    expect(loadPinnedPythonVersion(specPath)).toBe("3.14.4")
  })

  test("throws when PYTHON_VERSION is missing", async () => {
    expect(() => loadPinnedPythonVersion(specPath)).toThrow("runtime spec missing")
  })

  test("throws when PYTHON_VERSION is malformed", async () => {
    await writeFile(specPath, "not-a-version\n", "utf8")
    expect(() => loadPinnedPythonVersion(specPath)).toThrow("malformed")
  })

  test("throws when PYTHON_VERSION is not strict X.Y.Z", async () => {
    await writeFile(specPath, "3.14", "utf8")
    expect(() => loadPinnedPythonVersion(specPath)).toThrow("malformed")
  })
})

describe("assertPythonVersion", () => {
  test("accepts identical version", () => {
    expect(() => assertPythonVersion("3.14.4", "3.14.4", "hint")).not.toThrow()
  })

  test("rejects mismatched version", () => {
    expect(() => assertPythonVersion("3.12.10", "3.14.4", "use 3.14.4")).toThrow(
      /version mismatch: actual=3\.12\.10.*pins 3\.14\.4.*use 3\.14\.4/,
    )
  })
})
