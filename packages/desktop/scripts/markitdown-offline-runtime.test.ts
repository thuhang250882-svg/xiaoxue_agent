import { expect, test } from "bun:test"
import path from "node:path"

const packageDir = path.resolve(import.meta.dirname, "..")
const rootDir = path.resolve(packageDir, "../..")

test("MarkItDown is unavailable and cannot borrow user site-packages", async () => {
  const profile = await Bun.file(path.join(rootDir, "configs", "xiaoxue", "rc-release-profile.json")).json()
  expect(profile.OFFICE_NETWORK_UNAVAILABLE).toContain("markitdown-skill")
  expect(profile.rc.FOUNDATIONS).not.toContain("markitdown-skill")

  const python = path.join(packageDir, "resources", "python", "python.exe")
  const result = Bun.spawnSync([python, "-s", "-c", "import markitdown"], {
    env: { PYTHONNOUSERSITE: "1", PYTHONHOME: path.dirname(python), PYTHONPATH: "" },
    stdout: "pipe",
    stderr: "pipe",
  })
  expect(result.exitCode).not.toBe(0)
})
