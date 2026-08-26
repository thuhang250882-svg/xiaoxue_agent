import { mkdirSync } from "node:fs"
import { isAbsolute, join } from "node:path"

export type DesktopTestProfile = {
  root: string
  userData: string
  sessionData: string
}

export function configureDesktopTestProfile(root: string | undefined): DesktopTestProfile | undefined {
  if (!root) return
  if (!isAbsolute(root)) throw new Error("OPENCODE_DESKTOP_TEST_ROOT must be an absolute path")

  const profile = {
    root,
    userData: join(root, "desktop"),
    sessionData: join(root, "session"),
  }
  const data = join(root, "data")
  ;[
    data,
    join(data, "opencode"),
    join(root, "config"),
    join(root, "cache"),
    join(root, "state"),
    profile.userData,
    profile.sessionData,
  ].forEach((directory) => mkdirSync(directory, { recursive: true }))
  process.env.OPENCODE_DB = join(data, "opencode", "opencode.db")
  process.env.XDG_DATA_HOME = data
  process.env.XDG_CONFIG_HOME = join(root, "config")
  process.env.XDG_CACHE_HOME = join(root, "cache")
  process.env.XDG_STATE_HOME = join(root, "state")
  return profile
}
