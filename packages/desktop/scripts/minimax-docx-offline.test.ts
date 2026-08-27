import { expect, test } from "bun:test"
import path from "node:path"

const rootDir = path.resolve(import.meta.dirname, "../../..")

test("minimax-docx is excluded without relying on global dotnet or NuGet", async () => {
  const profile = await Bun.file(path.join(rootDir, "configs", "xiaoxue", "rc-release-profile.json")).json()
  const router = await Bun.file(path.join(rootDir, "packages", "opencode", "src", "agent", "xiaoxue-router.ts")).text()
  expect(profile.OFFICE_NETWORK_UNAVAILABLE).toContain("minimax-docx")
  expect(profile.rc.FOUNDATIONS).not.toContain("minimax-docx")
  expect(router).not.toContain('skill: "minimax-docx"')
})
