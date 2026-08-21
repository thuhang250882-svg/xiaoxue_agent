import { afterEach, describe, expect, test } from "bun:test"
import { enterpriseConnectors, readConnectorFile } from "./enterprise-connectors"
import { defaultUpdateChannel, enterprisePolicy } from "./enterprise-policy"
import { allowedExternalURL, allowedLocalPath, isApprovedAppName } from "./security-policy"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

let directory = ""

afterEach(async () => {
  delete process.env.XIAOXUE_ENTERPRISE_POLICY_PATH
  if (directory) await rm(directory, { recursive: true, force: true })
  directory = ""
})

describe("managed enterprise policy", () => {
  test("allows bundled and reviewed user Skills in the packaged default", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "xiaoxue-policy-default-"))
    const file = path.join(directory, "enterprise-policy.json")
    await Bun.write(file, "{}")
    process.env.XIAOXUE_ENTERPRISE_POLICY_PATH = file

    expect(enterprisePolicy().allowedSkillSources).toEqual(["bundled", "user"])
    expect(enterprisePolicy().offline).toBeTrue()
  })

  test("maps the packaged update channel into the unmanaged default", () => {
    expect(defaultUpdateChannel("internal")).toBe("internal")
    expect(defaultUpdateChannel("beta")).toBe("beta")
    expect(defaultUpdateChannel("latest")).toBe("stable")
    expect(defaultUpdateChannel(undefined)).toBe("stable")
  })

  test("enforces administrator URL, application, and connector allowlists", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "xiaoxue-policy-"))
    const file = path.join(directory, "enterprise-policy.json")
    await Bun.write(
      file,
      JSON.stringify({
        offline: false,
        allowedExternalHosts: ["corp.example"],
        allowedApplications: ["code"],
        allowedConnectors: ["local-files", "smb"],
        retentionDays: 90,
        dataResidency: "china",
        updateChannel: "internal",
        updateURL: "https://updates.corp.example/xiaoxue",
        projectRoots: [directory],
      }),
    )
    process.env.XIAOXUE_ENTERPRISE_POLICY_PATH = file

    expect(enterprisePolicy()).toMatchObject({
      retentionDays: 90,
      dataResidency: "china",
      updateChannel: "internal",
      updateURL: "https://updates.corp.example/xiaoxue",
    })
    expect(allowedExternalURL("https://docs.corp.example").hostname).toBe("docs.corp.example")
    expect(() => allowedExternalURL("https://public.example")).toThrow("企业策略批准")
    expect(isApprovedAppName("code")).toBeTrue()
    expect(isApprovedAppName("cursor")).toBeFalse()
    expect(allowedLocalPath(path.join(directory, "project"))).toBe(path.join(directory, "project"))
    expect(() => allowedLocalPath("C:\\unapproved")).toThrow("企业策略批准")
    expect(enterpriseConnectors().find((item) => item.id === "smb")?.status).toBe("requires_configuration")
    expect(enterpriseConnectors().find((item) => item.id === "wps")?.status).toBe("blocked_by_policy")
  })

  test("fails closed when the managed policy is malformed", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "xiaoxue-policy-invalid-"))
    const file = path.join(directory, "enterprise-policy.json")
    await Bun.write(file, "{ invalid")
    process.env.XIAOXUE_ENTERPRISE_POLICY_PATH = file

    expect(enterprisePolicy()).toMatchObject({ offline: true, allowedConnectors: [] })
    expect(isApprovedAppName("code")).toBeFalse()
    expect(() => allowedExternalURL("https://public.example")).toThrow()
  })

  test("reads only files inside an allowed local connector root", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "xiaoxue-connector-"))
    const root = path.join(directory, "documents")
    const file = path.join(directory, "enterprise-policy.json")
    await mkdir(root)
    await Bun.write(path.join(root, "note.md"), "approved")
    await Bun.write(
      file,
      JSON.stringify({
        allowedConnectors: ["local-files"],
        projectRoots: [root],
      }),
    )
    process.env.XIAOXUE_ENTERPRISE_POLICY_PATH = file

    expect(readConnectorFile("local-files", root, "note.md").toString("utf8")).toBe("approved")
    expect(() => readConnectorFile("local-files", root, "..\\enterprise-policy.json")).toThrow("授权目录之外")
  })
})
