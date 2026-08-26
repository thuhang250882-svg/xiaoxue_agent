import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { configureDesktopTestProfile } from "./test-profile"

const original = {
  OPENCODE_DB: process.env.OPENCODE_DB,
  XDG_DATA_HOME: process.env.XDG_DATA_HOME,
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
  XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
  XDG_STATE_HOME: process.env.XDG_STATE_HOME,
}
const roots: string[] = []

afterEach(async () => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("desktop test profile", () => {
  test("leaves the environment unchanged when disabled", () => {
    expect(configureDesktopTestProfile(undefined)).toBeUndefined()
    expect(process.env.OPENCODE_DB).toBe(original.OPENCODE_DB)
  })

  test("uses an explicit persistent isolated root", async () => {
    const root = await mkdtemp(join(tmpdir(), "opencode-desktop-profile-"))
    roots.push(root)
    const profile = configureDesktopTestProfile(root)

    expect(profile).toEqual({ root, userData: join(root, "desktop"), sessionData: join(root, "session") })
    expect(process.env.OPENCODE_DB).toBe(join(root, "data", "opencode", "opencode.db"))
    expect(process.env.XDG_DATA_HOME).toBe(join(root, "data"))
    await expect(mkdir(profile!.userData)).rejects.toBeDefined()
  })

  test("rejects a relative root", () => {
    expect(() => configureDesktopTestProfile("relative-profile")).toThrow("must be an absolute path")
  })
})
