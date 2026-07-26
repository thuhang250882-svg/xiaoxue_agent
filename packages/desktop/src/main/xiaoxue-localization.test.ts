import { describe, expect, test } from "bun:test"

const builder = await Bun.file(new URL("../../electron-builder.config.ts", import.meta.url)).text()
const pet = await Bun.file(new URL("../xiaoxue-pet/main.ts", import.meta.url)).text()
const server = await Bun.file(new URL("./server.ts", import.meta.url)).text()
const skills = await Bun.file(new URL("./skills.ts", import.meta.url)).text()
const windows = await Bun.file(new URL("./windows.ts", import.meta.url)).text()

describe("xiaoxue desktop localization contract", () => {
  test("keeps every trusted window in the shared permission allowlist", () => {
    expect(windows).toContain("const permittedWebContents = new Set<number>()")
    expect(windows).toContain("let permissionHandlersInstalled = false")
    expect(windows).toContain("permittedWebContents.has(webContents.id)")
    expect(pet).toContain("allowWindowPermissions(petWindow)")
    expect(pet.indexOf("allowWindowPermissions(petWindow)")).toBeLessThan(pet.indexOf("loadURL(url.toString())"))
  })

  test("ships preset skills and resolves their installed location at runtime", () => {
    expect(builder).toContain('from: "../../.opencode/skills/"')
    expect(builder).toContain('to: "skills/"')
    expect(skills).toContain('join(process.resourcesPath, "skills")')
    expect(server).toContain("bundledSkillsDir()")
    expect(server).toContain("withBundledSkills(env.OPENCODE_CONFIG_CONTENT, skills)")
  })
})
