import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

export type OfficeNetworkProbeResult = {
  python: string
  pdfkit: boolean
  skillGovernance: boolean
  userSiteIsolated: boolean
  globalDotnetUsed: boolean
  nugetUsed: boolean
  networkUsed: boolean
}

export async function probeOfficeNetworkRuntime(options?: { pythonRoot?: string; skillsRoot?: string }) {
  if (process.platform !== "win32") throw new Error("Office-network runtime probes currently require Windows")
  const packageDir = path.resolve(import.meta.dirname, "..")
  const rootDir = path.resolve(packageDir, "../..")
  const pythonRoot = path.resolve(options?.pythonRoot ?? path.join(packageDir, "resources", "python"))
  const skillsRoot = path.resolve(options?.skillsRoot ?? path.join(rootDir, ".opencode", "skills"))
  const python = path.join(pythonRoot, "python.exe")
  const smoke = path.join(pythonRoot, "xiaoxue_runtime_check.py")
  const pdfkit = path.join(skillsRoot, "pdfkit-py", "scripts", "pdfkit.py")
  const governance = path.join(skillsRoot, "skill-governance")
  const temporary = await mkdtemp(path.join(tmpdir(), "xiaoxue-office-network-"))

  try {
    await Promise.all(["home", "appdata", "localappdata", "nuget", "pip-cache"].map((name) => mkdir(path.join(temporary, name))))
    const env = cleanEnvironment({ python, pythonRoot, temporary })
    const runtime = JSON.parse(await run([python, "-s", smoke], env)) as { python: string; pdfExtraction: boolean; pdfOcr: boolean }
    if (!runtime.pdfExtraction || !runtime.pdfOcr) throw new Error("Bundled PDF extraction or OCR probe failed")

    const sample = path.join(temporary, "foundation.pdf")
    await run(
      [
        python,
        "-s",
        "-c",
        "from reportlab.pdfgen import canvas; import sys; c=canvas.Canvas(sys.argv[1]); c.drawString(72,720,'OFFICE_NETWORK_PDF_OK'); c.save()",
        sample,
      ],
      env,
    )
    const pdf = JSON.parse(await run([python, "-s", pdfkit, "page_count", "--input", sample], env)) as {
      ok: boolean
      data?: { page_count?: number }
      page_count?: number
    }
    if (!pdf.ok || (pdf.data?.page_count ?? pdf.page_count) !== 1) throw new Error("pdfkit-py minimum task failed")

    const validator = [
      "import sys",
      `sys.path.insert(0, ${JSON.stringify(path.join(governance, "vendor", "mcp_criticagent", "src"))})`,
      "from core.skill_validator import validate_skill_dir",
      `result=validate_skill_dir(${JSON.stringify(governance)})`,
      "print('SKILL_GOVERNANCE_OK' if result.valid else result.to_dict())",
      "raise SystemExit(0 if result.valid else 1)",
    ].join(";")
    const governanceResult = await run([python, "-s", "-c", validator], env)
    if (!governanceResult.includes("SKILL_GOVERNANCE_OK")) throw new Error("skill-governance minimum task failed")

    return {
      python: runtime.python,
      pdfkit: true,
      skillGovernance: true,
      userSiteIsolated: true,
      globalDotnetUsed: false,
      nugetUsed: false,
      networkUsed: false,
    } satisfies OfficeNetworkProbeResult
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

function cleanEnvironment(input: { python: string; pythonRoot: string; temporary: string }) {
  const systemRoot = process.env.SystemRoot ?? "C:\\Windows"
  return {
    SystemRoot: systemRoot,
    WINDIR: systemRoot,
    TEMP: input.temporary,
    TMP: input.temporary,
    USERPROFILE: path.join(input.temporary, "home"),
    APPDATA: path.join(input.temporary, "appdata"),
    LOCALAPPDATA: path.join(input.temporary, "localappdata"),
    PATH: [input.pythonRoot, path.join(input.pythonRoot, "Scripts"), path.join(systemRoot, "System32")].join(path.delimiter),
    PYTHONHOME: input.pythonRoot,
    PYTHONPATH: "",
    PYTHONNOUSERSITE: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONUTF8: "1",
    XIAOXUE_PYTHON: input.python,
    NUGET_PACKAGES: path.join(input.temporary, "nuget"),
    PIP_CACHE_DIR: path.join(input.temporary, "pip-cache"),
    PIP_NO_INDEX: "1",
    HTTP_PROXY: "http://127.0.0.1:9",
    HTTPS_PROXY: "http://127.0.0.1:9",
    ALL_PROXY: "http://127.0.0.1:9",
    NO_PROXY: "127.0.0.1,localhost",
  }
}

async function run(command: string[], env: Record<string, string>) {
  const child = Bun.spawn(command, { env, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code === 0) return stdout.trim()
  throw new Error(`${command[0]} ${command.slice(1, 3).join(" ")} failed (${code})\n${stderr.trim()}\n${stdout.trim()}`)
}

if (import.meta.main) {
  console.log(JSON.stringify(await probeOfficeNetworkRuntime(), null, 2))
}
