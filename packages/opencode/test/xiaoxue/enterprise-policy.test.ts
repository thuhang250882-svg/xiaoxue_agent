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
    })
    expect(XiaoxueEnterprisePolicy.allows("model", "openai/gpt-5")).toBeTrue()
    expect(XiaoxueEnterprisePolicy.allows("model", "anthropic/claude")).toBeFalse()
    expect(() => XiaoxueEnterprisePolicy.require("mcp", "public-web")).toThrow("企业托管策略禁止")
  })

  test("fails closed when managed policy JSON is invalid", () => {
    process.env.XIAOXUE_ENTERPRISE_POLICY_CONTENT = "{"
    expect(XiaoxueEnterprisePolicy.allows("skill", "bundled")).toBeFalse()
  })
})
