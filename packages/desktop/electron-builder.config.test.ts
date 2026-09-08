import { expect, test } from "bun:test"
import type { Configuration } from "electron-builder"
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

const legacyDesktopEntry = "resources/linux/opencode-desktop.desktop"

const channels = [
  { channel: "dev", appId: "cn.xbzty.xiaoxue.dev" },
  { channel: "beta", appId: "cn.xbzty.xiaoxue.beta" },
  { channel: "prod", appId: "cn.xbzty.xiaoxue" },
] as const

async function loadConfig(channel: (typeof channels)[number]["channel"], query: string) {
  const previous = process.env.OPENCODE_CHANNEL
  const previousUpdateChannel = process.env.XIAOXUE_UPDATE_CHANNEL
  const previousProductVersion = process.env.XIAOXUE_PRODUCT_VERSION
  process.env.OPENCODE_CHANNEL = channel
  if (channel === "prod") {
    process.env.XIAOXUE_UPDATE_CHANNEL = "latest"
    process.env.XIAOXUE_PRODUCT_VERSION = "0.9.0"
  }
  try {
    const module = await import(`./electron-builder.config.ts?${query}`)
    return module.default as Configuration
  } finally {
    if (previous === undefined) delete process.env.OPENCODE_CHANNEL
    else process.env.OPENCODE_CHANNEL = previous
    if (previousUpdateChannel === undefined) delete process.env.XIAOXUE_UPDATE_CHANNEL
    else process.env.XIAOXUE_UPDATE_CHANNEL = previousUpdateChannel
    if (previousProductVersion === undefined) delete process.env.XIAOXUE_PRODUCT_VERSION
    else process.env.XIAOXUE_PRODUCT_VERSION = previousProductVersion
  }
}

for (const channel of channels) {
  test(`uses one Linux desktop identity for ${channel.channel}`, async () => {
    const config = await loadConfig(channel.channel, `channel=${channel.channel}`)

    expect(config.appId).toBe(channel.appId)
    expect(config.extraMetadata?.desktopName).toBe(`${channel.appId}.desktop`)
    expect(config.linux?.executableName).toBe(channel.appId)
    expect(config.linux?.desktop?.entry?.StartupWMClass).toBe(channel.appId)
    expect(config.deb?.fpm).toContainEqual(expect.stringContaining(`/usr/share/metainfo/${channel.appId}.metainfo.xml`))
    expect(config.rpm?.fpm).toContainEqual(expect.stringContaining(`/usr/share/metainfo/${channel.appId}.metainfo.xml`))
  })
}

test("keeps a hidden prod launcher for old Linux pins", async () => {
  const config = await loadConfig("prod", "compat=prod")

  expect(
    config.deb?.fpm?.some((entry) =>
      entry.endsWith("opencode-desktop.desktop=/usr/share/applications/opencode-desktop.desktop"),
    ),
  ).toBe(true)
  expect(
    config.rpm?.fpm?.some((entry) =>
      entry.endsWith("opencode-desktop.desktop=/usr/share/applications/opencode-desktop.desktop"),
    ),
  ).toBe(true)

  const desktop = await Bun.file(legacyDesktopEntry).text()
  expect(desktop).toContain("Exec=/opt/OpenCode/ai.opencode.desktop %U")
  expect(desktop).toContain("Icon=ai.opencode.desktop")
  expect(desktop).toContain("StartupWMClass=ai.opencode.desktop")
  expect(desktop).toContain("NoDisplay=true")
})

test("bundles the CLI outside the dev app archive", async () => {
  const config = await loadConfig("dev", "cli-resource")

  expect(config.files).toContain("!resources/opencode-cli*")
  expect(config.extraResources).toContainEqual({
    from: "resources/",
    to: "",
    filter: ["opencode-cli*"],
  })
})

for (const channel of ["beta", "prod"] as const) {
  test(`does not bundle the CLI in ${channel} builds`, async () => {
    const config = await loadConfig(channel, `no-cli-resource=${channel}`)

    expect(config.extraResources).not.toContainEqual({
      from: "resources/",
      to: "",
      filter: ["opencode-cli*"],
    })
  })
}
