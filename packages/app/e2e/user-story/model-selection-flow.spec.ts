import { expect, test } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"

const directory = "C:/OpenCode/NewProject"

test("creates a session and selects a user-configured model", async ({ page }) => {
  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: "proj_model_selection_flow",
      worktree: directory,
      vcs: "git",
      name: "NewProject",
      time: { created: 1_700_000_000_000, updated: 1_700_000_000_000 },
      sandboxes: [],
    },
    provider: () => ({
      all: [
        {
          id: "local-custom",
          name: "Local Custom",
          models: {
            "local-model-1": {
              id: "local-model-1",
              name: "Local Model 1",
              cost: { input: 1, output: 1 },
              limit: { context: 200_000 },
            },
            "local-model-2": {
              id: "local-model-2",
              name: "Local Model 2",
              cost: { input: 1, output: 1 },
              limit: { context: 200_000 },
            },
          },
        },
      ],
      connected: ["local-custom"],
      default: { providerID: "local-custom", modelID: "local-model-1" },
    }),
    sessions: [],
    pageMessages: () => ({ items: [] }),
    fileList: (path) =>
      path ? [] : [{ name: "NewProject", path: "NewProject", absolute: directory, type: "directory", ignored: false }],
    findFiles: () => ["NewProject"],
  })
  await page.addInitScript(() => {
    localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } }))
    localStorage.setItem("opencode.global.dat:server", JSON.stringify({ projects: { local: [] } }))
  })

  await page.goto("/")
  const addProject = page.locator('[data-action="home-add-project-row"]')
  await expectAppVisible(addProject)
  await addProject.click()
  await page.locator("[data-directory-path]").click()

  await page.locator('[data-action="home-new-session"]').click()
  await expectAppVisible(page.locator('[data-component="prompt-input-v2"]'))

  const modelControl = page.locator('[data-action="prompt-model"]')
  await expect(modelControl).toHaveAttribute("data-control-type", "popover")
  await modelControl.click()
  await expect(page.locator("[data-provider-id]")).toHaveCount(0)
  const localModel = page.locator('[data-option-key="local-custom:local-model-2"]')
  await expect(localModel).toBeVisible()
  await localModel.click()

  await expect(modelControl).toContainText("Local Model 2")
})
