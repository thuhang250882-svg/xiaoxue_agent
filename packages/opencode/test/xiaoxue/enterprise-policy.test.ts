import { afterEach, describe, expect, test } from "bun:test"
import { XiaoxueEnterprisePolicy } from "@/xiaoxue/enterprise-policy"

const originalContent = process.env.XIAOXUE_ENTERPRISE_POLICY_CONTENT
const originalPath = process.env.XIAOXUE_ENTERPRISE_POLICY_PATH

afterEach(() => {
  if (originalContent === undefined) delete process.env.XIAOXUE_ENTERPRISE_POLICY_CONTENT
  if (originalContent !== undefined) process.env.XIAOXUE_ENTERPRISE_POLICY_CONTENT = originalContent
  if (originalPath === undefined) delete process.env.XIAOXUE_ENTERPRISE_POLICY_PATH
  if (originalPath !== undefined) process.env.XIAOXUE_ENTERPRISE_POLICY_PATH = originalPath
})

describe("Xiaoxue enterprise execution policy", () => {
  test("does not restrict unmanaged installations", () => {
    delete process.env.XIAOXUE_ENTERPRISE_POLICY_CONTENT
    delete process.env.XIAOXUE_ENTERPRISE_POLICY_PATH
    expect(XiaoxueEnterprisePolicy.allows("model", "openai/gpt-5")).toBeTrue()
  })

  test("enforces exact and wildcard resource allowlists", () => {
    process.env.XIAOXUE_ENTERPRISE_POLICY_CONTENT = JSON.stringify({
      allowedProviders: ["openai"],
      allowedModels: ["openai/gpt-*"],
      allowedMcpServers: ["company-*"],
      allowedSkills: ["bundled", "contract-*"],
      allowedPlugins: ["bundled"],
      allowedConnectors: ["local-files", "smb"],
      allowedArchiveModes: ["auto"],
      allowedExternalHosts: ["corp.example"],
      allowedSkillSources: ["bundled", "project"],
      allowedPluginSources: ["bundled"],
    })
    expect(XiaoxueEnterprisePolicy.allows("model", "openai/gpt-5")).toBeTrue()
    expect(XiaoxueEnterprisePolicy.allows("model", "anthropic/claude")).toBeFalse()
    expect(() => XiaoxueEnterprisePolicy.require("mcp", "public-web")).toThrow("企业托管策略禁止")
    expect(XiaoxueEnterprisePolicy.allowsNetwork("https://api.corp.example/v1")).toBeTrue()
    expect(XiaoxueEnterprisePolicy.allowsNetwork("https://public.example/v1")).toBeFalse()
    expect(XiaoxueEnterprisePolicy.allowsSource("skill", "project")).toBeTrue()
    expect(XiaoxueEnterprisePolicy.allowsSource("skill", "remote")).toBeFalse()
    expect(XiaoxueEnterprisePolicy.allowsSource("plugin", "npm")).toBeFalse()
  })

  test("defaults managed extension sources to bundled only", () => {
    process.env.XIAOXUE_ENTERPRISE_POLICY_CONTENT = "{}"
    expect(XiaoxueEnterprisePolicy.allowsSource("skill", "bundled")).toBeTrue()
    expect(XiaoxueEnterprisePolicy.allowsSource("skill", "project")).toBeFalse()
    expect(XiaoxueEnterprisePolicy.allowsSource("plugin", "npm")).toBeFalse()
  })

  test("fails closed when managed policy JSON is invalid", () => {
    process.env.XIAOXUE_ENTERPRISE_POLICY_CONTENT = "{"
    expect(XiaoxueEnterprisePolicy.allows("skill", "bundled")).toBeFalse()
    expect(XiaoxueEnterprisePolicy.allowsNetwork("https://corp.example")).toBeFalse()
  })

  test("allows localhost but blocks external endpoints in offline mode", () => {
    process.env.XIAOXUE_ENTERPRISE_POLICY_CONTENT = JSON.stringify({ offline: true })
    expect(XiaoxueEnterprisePolicy.allowsNetwork("http://localhost:11434/v1")).toBeTrue()
    expect(XiaoxueEnterprisePolicy.allowsNetwork("https://api.openai.com/v1")).toBeFalse()
  })
})
