import { describe, expect, test } from "bun:test"

const newSession = await Bun.file(new URL("../pages/new-session.tsx", import.meta.url)).text()
const unpaid = await Bun.file(new URL("./dialog-select-model-unpaid.tsx", import.meta.url)).text()
const unpaidV2 = await Bun.file(new URL("./dialog-select-model-unpaid-v2.tsx", import.meta.url)).text()
const custom = await Bun.file(new URL("./dialog-custom-provider.tsx", import.meta.url)).text()
const settings = await Bun.file(new URL("./settings-providers.tsx", import.meta.url)).text()
const settingsV2 = await Bun.file(new URL("./settings-v2/providers.tsx", import.meta.url)).text()
const manageModels = await Bun.file(new URL("./dialog-manage-models.tsx", import.meta.url)).text()
const selectModel = await Bun.file(new URL("./dialog-select-model.tsx", import.meta.url)).text()
const layout = await Bun.file(new URL("../pages/layout.tsx", import.meta.url)).text()
const session = await Bun.file(new URL("../pages/session.tsx", import.meta.url)).text()
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

  test("removes every runtime entry to the internet provider onboarding wizard", async () => {
    expect(await Bun.file(new URL("./dialog-connect-provider.tsx", import.meta.url)).exists()).toBe(false)
    for (const surface of [manageModels, selectModel, layout, session]) {
      expect(surface).not.toContain("dialog-connect-provider")
      expect(surface).not.toContain("DialogConnectProvider")
      expect(surface).not.toContain('id: "provider.connect"')
    }
    expect(layout).not.toContain('data-component="getting-started"')
    expect(session).not.toContain("useUsageExceededDialogs")
  })

  test("keeps direct self-managed model configuration without vendor discovery", () => {
    expect(settings).toContain("DialogCustomProvider")
    expect(settingsV2).toContain("DialogCustomProvider")
    expect(settingsV2).toContain("由用户自主添加模型")
    expect(settingsV2).not.toContain("DialogConnectProvider")
  })

  test("relies on config update lifecycle instead of disposing the server twice", () => {
    expect(custom).toContain("await serverSync().updateConfig")
    expect(custom).not.toContain("client.global.dispose()")
    expect(custom).not.toContain("await serverSync().refreshProviders()")
    expect(serverSync).toContain('eventType === "server.connected" || eventType === "global.disposed"')
    expect(serverSync).toContain("const refreshProviders")
  })
})
