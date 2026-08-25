import { expect, test } from "bun:test"
import config from "./electron-builder.config"

test("Windows installer always creates desktop and Start menu shortcuts", () => {
  expect(config.nsis?.createDesktopShortcut).toBe("always")
  expect(config.nsis?.createStartMenuShortcut).toBe(true)
})

test("updater asset names are derived from an unscoped package name", () => {
  expect(config.extraMetadata?.name).toBe("xiaoxue-desktop")
})

test("product version overrides packaged application metadata", async () => {
  expect(await Bun.file(new URL("./electron-builder.config.ts", import.meta.url)).text()).toContain(
    "...(productVersion ? { version: productVersion } : {}),",
  )
})
