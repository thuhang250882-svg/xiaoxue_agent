import { expect, test } from "bun:test"
import config from "./electron-builder.config"

test("Windows installer always creates desktop and Start menu shortcuts", () => {
  expect(config.nsis?.createDesktopShortcut).toBe("always")
  expect(config.nsis?.createStartMenuShortcut).toBe(true)
})
