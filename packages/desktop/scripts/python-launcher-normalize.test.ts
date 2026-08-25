import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { normalizePythonLaunchers } from "./python-launcher-normalize"

let directory = ""

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "xiaoxue-py-launcher-"))
})

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
  directory = ""
})

describe("normalizePythonLaunchers", () => {
  test("normalizes embedded ZIP timestamps and RECORD hashes deterministically", async () => {
    const bin = path.join(directory, "bin")
    const distInfo = path.join(directory, "demo-1.0.dist-info")
    await mkdir(bin)
    await mkdir(distInfo)

    const launcher = Buffer.alloc(64, 7)
    launcher.writeUInt32LE(0x04034b50, 4)
    launcher.writeUInt32LE(0x12345678, 14)
    launcher.writeUInt32LE(0x02014b50, 32)
    launcher.writeUInt32LE(0x87654321, 44)
    await writeFile(path.join(bin, "demo.exe"), launcher)
    await writeFile(path.join(distInfo, "RECORD"), "../../bin/demo.exe,sha256=stale,64\r\ndemo.py,,\r\n")

    expect(await normalizePythonLaunchers(directory)).toEqual({ launchers: 1, records: 1 })
    const first = await readFile(path.join(bin, "demo.exe"))
    const firstRecord = await readFile(path.join(distInfo, "RECORD"), "utf8")
    expect(first.readUInt16LE(14)).toBe(0)
    expect(first.readUInt16LE(16)).toBe(0x21)
    expect(first.readUInt16LE(44)).toBe(0)
    expect(first.readUInt16LE(46)).toBe(0x21)
    expect(firstRecord).toContain(
      `../../bin/demo.exe,sha256=${createHash("sha256").update(first).digest("base64url")},64`,
    )

    expect(await normalizePythonLaunchers(directory)).toEqual({ launchers: 1, records: 1 })
    expect(await readFile(path.join(bin, "demo.exe"))).toEqual(first)
    expect(await readFile(path.join(distInfo, "RECORD"), "utf8")).toBe(firstRecord)
  })
})
