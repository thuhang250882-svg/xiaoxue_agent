import { expect, test } from "bun:test"

test("private TUI keeps local model selection without public provider onboarding", async () => {
  const app = await Bun.file(new URL("../../../../src/app.tsx", import.meta.url)).text()
  const models = await Bun.file(new URL("../../../../src/component/dialog-model.tsx", import.meta.url)).text()
  const prompt = await Bun.file(new URL("../../../../src/component/prompt/index.tsx", import.meta.url)).text()

  expect(await Bun.file(new URL("../../../../src/component/dialog-provider.tsx", import.meta.url)).exists()).toBe(false)
  expect(app).not.toContain('name: "provider.connect"')
  expect(app).not.toContain("DialogProviderList")
  expect(models).not.toContain("createDialogProviderOptions")
  expect(models).not.toContain("Popular providers")
  expect(prompt).not.toContain("DialogProviderConnect")
  expect(prompt).toContain("本机或单位内网模型")
})
