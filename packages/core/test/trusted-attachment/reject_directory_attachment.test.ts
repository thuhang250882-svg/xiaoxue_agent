import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { createFile, createHarness, type TestHarness } from "./helper"

let harness: TestHarness | undefined

afterEach(async () => {
  await harness?.cleanup()
  harness = undefined
})

describe("directory attachment rejection", () => {
  test("registering a directory fails with a type mismatch", async () => {
    harness = await createHarness()
    const dir = path.join(harness.dataDir, "folder")
    await mkdir(dir, { recursive: true })

    await expect(harness.registry.register(1, "native-picker", [{ absolutePath: dir }])).rejects.toMatchObject({
      code: "ATTACHMENT_TYPE_MISMATCH",
    })
  })

  test("a file replaced by a directory after registration fails revalidation", async () => {
    harness = await createHarness()
    const file = await createFile(harness.dataDir, "victim.txt", "body")
    const [entry] = await harness.registry.register(1, "native-picker", [{ absolutePath: file }])

    await rm(file)
    await mkdir(file, { recursive: true })

    await expect(harness.registry.consume(entry.id)).rejects.toMatchObject({ code: "ATTACHMENT_TYPE_MISMATCH" })
  })

  test("a missing file after registration reports ATTACHMENT_NOT_FOUND", async () => {
    harness = await createHarness()
    const file = await createFile(harness.dataDir, "gone.txt", "body")
    const [entry] = await harness.registry.register(1, "native-picker", [{ absolutePath: file }])

    await rm(file)

    await expect(harness.registry.consume(entry.id)).rejects.toMatchObject({ code: "ATTACHMENT_NOT_FOUND" })
  })
})
