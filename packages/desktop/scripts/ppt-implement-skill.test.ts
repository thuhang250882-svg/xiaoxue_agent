import { expect, test } from "bun:test"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "../../..")
const skill = path.join(root, ".opencode", "skills", "ppt-implement")

test("ppt-implement is portable and keeps runtime state outside the skill", async () => {
  const files = (await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: skill, onlyFiles: true }))).map((file) =>
    file.replaceAll("\\", "/"),
  )
  expect(files).toContain("SKILL.md")
  expect(files).toContain("scripts/setup-project.js")
  expect(files).toContain("scripts/export-ppt.js")
  expect(files).toContain("scripts/export/validate-pptx.js")
  expect(files).toContain("scripts/export/package-lock.json")
  expect(files).toContain("scripts/screenshot-ppt.py")
  expect(files).toContain("templates/frontend/package-lock.json")
  expect(files).not.toContain("templates/frontend/yarn.lock")
  expect(files.some((file) => file.includes("node_modules/") || file.includes(".venv/") || file.endsWith(".pptx"))).toBe(false)

  const scanned = await Promise.all(
    files
      .filter((file) => !file.endsWith("package-lock.json") && !file.endsWith("yarn.lock"))
      .map((file) => Bun.file(path.join(skill, file)).text()),
  )
  const content = scanned.join("\n")
  expect(content).not.toMatch(/CODEBUDDY_|\.codebuddy|\.genie|ImageGen|fonts\.googleapis\.com|rm -rf|stdio:\s*["']ignore["']/i)
  expect(content).toContain("PPTX 页数不符")
  expect(content).toContain("幻灯片提取不完整")
  expect(content).not.toContain("npx tailwindcss")
  expect(content).toContain("process.exitCode = 1")
})

test("ppt-implement installs exactly the dependency versions recorded in both locks", async () => {
  const setup = await Bun.file(path.join(skill, "scripts", "setup-project.js")).text()
  expect(setup).toContain('"ci", "--no-audit", "--no-fund"')
  expect(setup).toContain(".xiaoxue-package-lock.sha256")

  for (const directory of ["templates/frontend", "scripts/export"]) {
    const manifest = await Bun.file(path.join(skill, directory, "package.json")).json()
    const lock = await Bun.file(path.join(skill, directory, "package-lock.json")).json()
    expect(lock.lockfileVersion).toBeGreaterThanOrEqual(3)
    expect(lock.packages[""].dependencies).toEqual(manifest.dependencies)
    if (manifest.devDependencies) expect(lock.packages[""].devDependencies).toEqual(manifest.devDependencies)
  }
})

test("ppt-implement uses the bundled Python Playwright", async () => {
  const python = path.join(root, "packages", "desktop", "resources", "python", "python.exe")
  const result = Bun.spawnSync([python, "-X", "utf8", "-c", "import playwright; print(playwright.__file__)"], {
    env: {
      ...process.env,
      PYTHONNOUSERSITE: "1",
      PYTHONHOME: path.dirname(python),
      PYTHONPATH: "",
      XIAOXUE_PYTHON: python,
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  expect(result.exitCode).toBe(0)
  expect(result.stdout.toString().replaceAll("\\", "/")).toContain("packages/desktop/resources/python/Lib/site-packages/playwright")
})
