import { describe, expect, test } from "bun:test"
import { reservedProviderIDs, validateCustomProvider } from "./dialog-custom-provider-form"

const t = (key: string) => key

describe("validateCustomProvider", () => {
  test("builds trimmed config payload", () => {
    const result = validateCustomProvider({
      form: {
        providerID: "custom-provider",
        name: " Custom Provider ",
        baseURL: "http://192.168.10.20:8000/v1 ",
        apiKey: " {env: CUSTOM_PROVIDER_KEY} ",
        models: [{ row: "m0", id: " model-a ", name: " Model A ", err: {} }],
        headers: [
          { row: "h0", key: " X-Test ", value: " enabled ", err: {} },
          { row: "h1", key: "", value: "", err: {} },
        ],
        err: {},
      },
      t,
      existingProviderIDs: new Set(),
    })

    expect(result.result).toEqual({
      providerID: "custom-provider",
      name: "Custom Provider",
      key: undefined,
      config: {
        npm: "@ai-sdk/openai-compatible",
        name: "Custom Provider",
        env: ["CUSTOM_PROVIDER_KEY"],
        options: {
          baseURL: "http://192.168.10.20:8000/v1",
          headers: {
            "X-Test": "enabled",
          },
        },
        models: {
          "model-a": { name: "Model A", temperature: true },
        },
      },
    })
  })

  test("flags duplicate rows and active provider IDs", () => {
    const result = validateCustomProvider({
      form: {
        providerID: "custom-provider",
        name: "Provider",
        baseURL: "http://localhost:11434/v1",
        apiKey: "secret",
        models: [
          { row: "m0", id: "model-a", name: "Model A", err: {} },
          { row: "m1", id: "model-a", name: "Model A 2", err: {} },
        ],
        headers: [
          { row: "h0", key: "Authorization", value: "one", err: {} },
          { row: "h1", key: "authorization", value: "two", err: {} },
        ],
        err: {},
      },
      t,
      existingProviderIDs: new Set(["custom-provider"]),
    })

    expect(result.result).toBeUndefined()
    expect(result.err.providerID).toBe("provider.custom.error.providerID.exists")
    expect(result.models[1]).toEqual({
      id: "provider.custom.error.duplicate",
      name: undefined,
    })
    expect(result.headers[1]).toEqual({
      key: "provider.custom.error.duplicate",
      value: undefined,
    })
  })

  test("allows a manually entered public model endpoint", () => {
    const result = validateCustomProvider({
      form: {
        providerID: "public-provider",
        name: "Public Provider",
        baseURL: "https://api.example.com/v1",
        apiKey: "secret",
        models: [{ row: "m0", id: "model-a", name: "Model A", err: {} }],
        headers: [{ row: "h0", key: "", value: "", err: {} }],
        err: {},
      },
      t,
      existingProviderIDs: new Set(),
    })

    expect(result.result?.providerID).toBe("public-provider")
  })

  test("allows an administrator-approved intranet hostname", () => {
    const result = validateCustomProvider({
      form: {
        providerID: "intranet-provider",
        name: "Intranet Provider",
        baseURL: "https://models.corp.internal/v1",
        apiKey: "",
        models: [{ row: "m0", id: "model-a", name: "Model A", err: {} }],
        headers: [{ row: "h0", key: "", value: "", err: {} }],
        err: {},
      },
      t,
      existingProviderIDs: new Set(),
    })

    expect(result.result?.providerID).toBe("intranet-provider")
  })

  test("reuses only disabled custom IDs and keeps active or non-custom IDs reserved", () => {
    expect(
      reservedProviderIDs(
        ["xiaoxue", "active", "builtin"],
        ["xiaoxue", "builtin"],
        {
          xiaoxue: { npm: "@ai-sdk/openai-compatible" },
          active: { npm: "@ai-sdk/openai-compatible" },
          builtin: { npm: "@ai-sdk/openai" },
        },
      ),
    ).toEqual(new Set(["active", "builtin"]))
  })

})
