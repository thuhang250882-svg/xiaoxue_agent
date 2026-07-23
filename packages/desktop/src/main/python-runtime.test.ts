import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { configureBundledPython, resolveBundledPython } from "./python-runtime"

const root = path.join(import.meta.dir, ".tmp-python-runtime.test")
const original = { ...process.env }

afterEach(async () => {
  Object.keys(process.env).forEach((key) => delete process.env[key])
  Object.assign(process.env, original)
  await rm(root, { recursive: true, force: true })
})

describe("bundled Python runtime", () => {
  test("returns undefined when the runtime is absent", () => {
    expect(resolveBundledPython(root, { PATH: "C:\\Windows" })).toBeUndefined()
  })

  test("prefers the bundled interpreter and isolates user packages", async () => {
    await mkdir(root, { recursive: true })
    await writeFile(path.join(root, "python.exe"), "")
    const runtime = resolveBundledPython(root, { Path: "C:\\Windows;C:\\Tools" })

    expect(runtime?.executable).toBe(path.join(root, "python.exe"))
    expect(runtime?.path.split(path.delimiter).slice(0, 2)).toEqual([root, path.join(root, "Scripts")])

    const configured = configureBundledPython(root)
    expect(configured?.executable).toBe(path.join(root, "python.exe"))
    expect(process.env.XIAOXUE_PYTHON).toBe(path.join(root, "python.exe"))
    expect(process.env.PYTHONHOME).toBe(root)
    expect(process.env.PYTHONNOUSERSITE).toBe("1")
    expect(process.env.PYTHONUTF8).toBe("1")
  })
})
