import { expect, test } from "bun:test"
import path from "node:path"

const packageDir = path.resolve(import.meta.dirname, "..")
const rootDir = path.resolve(packageDir, "../..")
const python = path.join(packageDir, "resources", "python", "python.exe")
const scripts = path.join(rootDir, ".opencode", "skills", "weekly-report", "scripts")
const environment = {
  ...process.env,
  PYTHONNOUSERSITE: "1",
  PYTHONHOME: path.dirname(python),
  PYTHONPATH: "",
  XIAOXUE_PYTHON: python,
}

test("weekly-report bundled runtime imports python-docx and matches XIAOXUE_PYTHON", () => {
  const result = Bun.spawnSync(
    [python, "-X", "utf8", path.join(scripts, "check_environment.py"), "--capability", "docx 稿件生成"],
    { env: environment, stdout: "pipe", stderr: "pipe" },
  )
  expect(result.exitCode).toBe(0)
  expect(JSON.parse(result.stdout.toString()).status).toBe("ready")
})

test("weekly-report generators pass deterministic DOCX round-trip checks", () => {
  for (const script of ["report_builder.py", "merge_builder.py"]) {
    const result = Bun.spawnSync([python, "-X", "utf8", path.join(scripts, script), "--selfcheck"], {
      env: environment,
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(result.stderr.toString()).toBe("")
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString()).toContain("自检结果：全部通过")
  }
})

test("weekly-report runtime check rejects an untrusted interpreter declaration", () => {
  const result = Bun.spawnSync([python, "-X", "utf8", path.join(scripts, "check_environment.py")], {
    env: { ...environment, XIAOXUE_PYTHON: path.join(packageDir, "missing-python.exe") },
    stdout: "pipe",
    stderr: "pipe",
  })
  expect(result.exitCode).toBe(1)
  expect(JSON.parse(result.stdout.toString()).status).toBe("unavailable")
})
