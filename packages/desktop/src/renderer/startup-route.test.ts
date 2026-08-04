import { expect, test } from "bun:test"
import { DESKTOP_STARTUP_ROUTE } from "./startup-route"

const onboardingSource = await Bun.file(new URL("./onboarding.tsx", import.meta.url)).text()

test("desktop initializes on Home while the startup gate creates a fresh conversation", () => {
  expect(DESKTOP_STARTUP_ROUTE).toBe("/")
  expect(onboardingSource).toContain("const ordinaryDirectoryReady = new Promise<string>")
  expect(onboardingSource).toContain("tabs.startDesktopConversation(await ordinaryDirectoryReady)")
  expect(onboardingSource).not.toContain("tabs.restoreDesktopStartup()")
})
