import { describe, expect, test } from "bun:test"

const newSession = await Bun.file(new URL("../pages/new-session.tsx", import.meta.url)).text()
const unpaid = await Bun.file(new URL("./dialog-select-model-unpaid.tsx", import.meta.url)).text()
const unpaidV2 = await Bun.file(new URL("./dialog-select-model-unpaid-v2.tsx", import.meta.url)).text()
const connect = await Bun.file(new URL("./dialog-connect-provider.tsx", import.meta.url)).text()
const custom = await Bun.file(new URL("./dialog-custom-provider.tsx", import.meta.url)).text()
const settings = await Bun.file(new URL("./settings-providers.tsx", import.meta.url)).text()
const serverSync = await Bun.file(new URL("../context/server-sync.tsx", import.meta.url)).text()

describe("internal provider surfaces", () => {
  test("removes public provider discovery from new sessions and model dialogs", () => {
    expect(newSession).not.toContain("ProviderTip")
    expect(newSession).not.toContain("home.providerTip")
    expect(unpaid).not.toContain("providers.popular")
    expect(unpaid).not.toContain("dialog.provider.viewAll")
    expect(unpaidV2).not.toContain("viewMoreProviders")
    expect(unpaidV2).not.toContain("featuredProviders")
    expect(settings).not.toContain("providers.popular")
    expect(settings).not.toContain("dialog.provider.viewAll")
  })

  test("provider connection only offers the custom internal provider form", () => {
    expect(connect).toContain("const values = [custom()]")
    expect(connect).not.toContain("...providers.all().values()")
    expect(connect).not.toContain("providerShortcuts.flatMap")
  })

  test("relies on config update lifecycle instead of disposing the server twice", () => {
    expect(custom).toContain("await serverSync().updateConfig")
    expect(custom).not.toContain("client.global.dispose()")
    expect(custom).not.toContain("await serverSync().refreshProviders()")
    expect(serverSync).toContain('event.type === "server.connected" || event.type === "global.disposed"')
    expect(serverSync).not.toContain("const refreshProviders")
  })
})
