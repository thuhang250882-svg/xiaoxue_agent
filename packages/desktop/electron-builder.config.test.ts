import { expect, test } from "bun:test"
import type { Configuration } from "electron-builder"

const legacyDesktopEntry = "resources/linux/opencode-desktop.desktop"

const channels = [
  { channel: "dev", appId: "cn.xbzty.xiaoxue.dev" },
  { channel: "beta", appId: "cn.xbzty.xiaoxue.beta" },
  { channel: "prod", appId: "cn.xbzty.xiaoxue" },
] as const

for (const channel of channels) {
  test(`uses one Linux desktop identity for ${channel.channel}`, async () => {
    const previous = process.env.OPENCODE_CHANNEL
    const previousUpdate = process.env.XIAOXUE_UPDATE_CHANNEL
    process.env.OPENCODE_CHANNEL = channel.channel
    if (channel.channel === "prod") {
      process.env.XIAOXUE_UPDATE_CHANNEL = "latest" // Required for prod builds
    }

    const module = await import(`./electron-builder.config.ts?channel=${channel.channel}`)
    const config = module.default as Configuration

    if (previous === undefined) delete process.env.OPENCODE_CHANNEL
    else process.env.OPENCODE_CHANNEL = previous
    if (previousUpdate === undefined) delete process.env.XIAOXUE_UPDATE_CHANNEL
    else process.env.XIAOXUE_UPDATE_CHANNEL = previousUpdate

    expect(config.appId).toBe(channel.appId)
    expect(config.extraMetadata?.desktopName).toBe(`${channel.appId}.desktop`)
    expect(config.linux?.executableName).toBe(channel.appId)
    expect(config.linux?.desktop?.entry?.StartupWMClass).toBe(channel.appId)
  })
}

test("keeps a hidden prod launcher for old Linux pins", async () => {
  const previous = process.env.OPENCODE_CHANNEL
  const previousUpdate = process.env.XIAOXUE_UPDATE_CHANNEL
  process.env.OPENCODE_CHANNEL = "prod"
  process.env.XIAOXUE_UPDATE_CHANNEL = "latest" // Required for prod builds

  const module = await import("./electron-builder.config.ts?compat=prod")
  const config = module.default as Configuration

  if (previous === undefined) delete process.env.OPENCODE_CHANNEL
  else process.env.OPENCODE_CHANNEL = previous
  if (previousUpdate === undefined) delete process.env.XIAOXUE_UPDATE_CHANNEL
  else process.env.XIAOXUE_UPDATE_CHANNEL = previousUpdate

  expect(config.deb?.fpm?.[0]?.replaceAll("\\", "/")).toEndWith(
    `${legacyDesktopEntry}=/usr/share/applications/opencode-desktop.desktop`,
  )
  expect(config.rpm?.fpm?.[0]?.replaceAll("\\", "/")).toEndWith(
    `${legacyDesktopEntry}=/usr/share/applications/opencode-desktop.desktop`,
  )

  const desktop = await Bun.file(legacyDesktopEntry).text()
  expect(desktop).toContain("Exec=/opt/OpenCode/ai.opencode.desktop %U")
  expect(desktop).toContain("Icon=ai.opencode.desktop")
  expect(desktop).toContain("StartupWMClass=ai.opencode.desktop")
  expect(desktop).toContain("NoDisplay=true")
})

test("locks packaged Electron to the integrity-checked ASAR", async () => {
  const previous = process.env.OPENCODE_CHANNEL
  const previousUpdate = process.env.XIAOXUE_UPDATE_CHANNEL
  process.env.OPENCODE_CHANNEL = "prod"
  process.env.XIAOXUE_UPDATE_CHANNEL = "latest" // Required for prod builds

  const module = await import("./electron-builder.config.ts?security=prod")
  const config = module.default as Configuration

  if (previous === undefined) delete process.env.OPENCODE_CHANNEL
  else process.env.OPENCODE_CHANNEL = previous
  if (previousUpdate === undefined) delete process.env.XIAOXUE_UPDATE_CHANNEL
  else process.env.XIAOXUE_UPDATE_CHANNEL = previousUpdate

  expect(config.electronFuses).toMatchObject({
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    grantFileProtocolExtraPrivileges: false,
  })
  expect(config.artifactName).toContain("${version}")
  expect(config.win?.signExts).toEqual([".exe", ".dll", ".node", ".pyd"])
})

for (const updateChannel of ["latest", "internal", "beta"] as const) {
  test(`uses the selected enterprise update channel: ${updateChannel}`, async () => {
    const previousApp = process.env.OPENCODE_CHANNEL
    const previousUpdate = process.env.XIAOXUE_UPDATE_CHANNEL
    process.env.OPENCODE_CHANNEL = "prod"
    process.env.XIAOXUE_UPDATE_CHANNEL = updateChannel

    const module = await import(`./electron-builder.config.ts?update=${updateChannel}`)
    const config = module.default as Configuration

    if (previousApp === undefined) delete process.env.OPENCODE_CHANNEL
    else process.env.OPENCODE_CHANNEL = previousApp
    if (previousUpdate === undefined) delete process.env.XIAOXUE_UPDATE_CHANNEL
    else process.env.XIAOXUE_UPDATE_CHANNEL = previousUpdate

    expect(config.publish).toMatchObject({
      provider: "github",
      owner: "thuhang250882-svg",
      repo: "xiaoxue_agent",
      channel: updateChannel,
    })
  })
}

test("rejects an unknown enterprise update channel", async () => {
  const previousApp = process.env.OPENCODE_CHANNEL
  const previousUpdate = process.env.XIAOXUE_UPDATE_CHANNEL
  process.env.OPENCODE_CHANNEL = "prod"
  process.env.XIAOXUE_UPDATE_CHANNEL = "unsafe"

  expect(async () => {
    await import("./electron-builder.config.ts?update=invalid")
  }).toThrow(/Invalid update channel/)

  if (previousApp === undefined) delete process.env.OPENCODE_CHANNEL
  else process.env.OPENCODE_CHANNEL = previousApp
  if (previousUpdate === undefined) delete process.env.XIAOXUE_UPDATE_CHANNEL
  else process.env.XIAOXUE_UPDATE_CHANNEL = previousUpdate
})
