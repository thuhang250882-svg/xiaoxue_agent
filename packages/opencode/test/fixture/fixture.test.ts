import { $ } from "bun"
import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import { tmpdir } from "./fixture"

describe("tmpdir", () => {
  test("disables fsmonitor for git fixtures", async () => {
    await using tmp = await tmpdir({ git: true })

    const value = (await $`git config core.fsmonitor`.cwd(tmp.path).quiet().text()).trim()
    expect(value).toBe("false")
  })

  test("creates isolated clean root commits for git fixtures", async () => {
    await using first = await tmpdir({ git: true })
    await using second = await tmpdir({ git: true })

    const roots = await Promise.all(
      [first.path, second.path].map((directory) =>
        $`git rev-list --max-parents=0 HEAD`.cwd(directory).quiet().text().then((value) => value.trim()),
      ),
    )
    const statuses = await Promise.all(
      [first.path, second.path].map((directory) => $`git status --porcelain`.cwd(directory).quiet().text()),
    )

    expect(roots[0]).not.toBe(roots[1])
    expect(statuses).toEqual(["", ""])
  })

  test("removes directories on dispose", async () => {
    const tmp = await tmpdir({ git: true })
    const dir = tmp.path

    await tmp[Symbol.asyncDispose]()

    const exists = await fs
      .stat(dir)
      .then(() => true)
      .catch(() => false)
    expect(exists).toBe(false)
  })
})
