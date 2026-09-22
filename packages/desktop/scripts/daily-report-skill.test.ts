import { expect, test } from "bun:test"
import path from "node:path"

const packageDir = path.resolve(import.meta.dirname, "..")
const rootDir = path.resolve(packageDir, "../..")
const python = path.join(packageDir, "resources", "python", "python.exe")
const scripts = path.join(rootDir, ".opencode", "skills", "daily-report", "scripts")
const environment = {
  ...process.env,
  PYTHONNOUSERSITE: "1",
  PYTHONHOME: path.dirname(python),
  PYTHONPATH: "",
  XIAOXUE_PYTHON: python,
}

test("daily-report bundled runtime provides DOCX and legacy XLS libraries", () => {
  const result = Bun.spawnSync(
    [python, "-X", "utf8", path.join(scripts, "check_environment.py"), "--capability", "xls 日报表汇总"],
    { env: environment, stdout: "pipe", stderr: "pipe" },
  )
  expect(result.exitCode).toBe(0)
  const payload = JSON.parse(result.stdout.toString())
  expect(payload.status).toBe("ready")
  expect(payload.runtime.python_docx).toMatch(/^1\./)
  expect(payload.runtime.xlrd).toBeTruthy()
  expect(payload.runtime.xlwt).toBeTruthy()
  expect(payload.runtime.xlutils).toBeTruthy()
})

test("daily-report generators retain all deterministic self-checks", () => {
  const docx = Bun.spawnSync([python, "-X", "utf8", path.join(scripts, "build_daily.py"), "--selfcheck"], {
    env: environment,
    stdout: "pipe",
    stderr: "pipe",
  })
  expect(docx.exitCode).toBe(0)
  expect(docx.stderr.toString()).toBe("")
  expect(docx.stdout.toString()).toContain("源件回验：抄错值与缺失行都能抓到")
  expect(docx.stdout.toString()).toContain("比例校验：西南 10/18=56%≠44% 被抓到")
  expect(docx.stdout.toString()).toContain("结论：全部通过")

  const xls = Bun.spawnSync([python, "-X", "utf8", path.join(scripts, "build_daily_xls.py"), "--selfcheck"], {
    env: environment,
    stdout: "pipe",
    stderr: "pipe",
  })
  expect(xls.exitCode).toBe(0)
  expect(xls.stderr.toString()).toBe("")
  expect(xls.stdout.toString()).toContain("semantic 模式：条数守恒 2+4=6")
  expect(xls.stdout.toString()).toContain("疑点井")
  expect(xls.stdout.toString()).toContain("自检结束：全部通过")
})

test("daily-report runtime check rejects a mismatched interpreter", () => {
  const result = Bun.spawnSync([python, "-X", "utf8", path.join(scripts, "check_environment.py")], {
    env: { ...environment, XIAOXUE_PYTHON: path.join(packageDir, "missing-python.exe") },
    stdout: "pipe",
    stderr: "pipe",
  })
  expect(result.exitCode).toBe(1)
  expect(JSON.parse(result.stdout.toString()).status).toBe("unavailable")
})
