import { describe, expect, test } from "bun:test"
import { redactLogText, redactLogValue } from "./log-redaction"
import { allowedExternalURL, isApprovedAppName } from "./security-policy"

describe("desktop security policy", () => {
  test("allows approved external protocols and rejects executable protocols or embedded credentials", () => {
    expect(allowedExternalURL("https://example.com/docs").hostname).toBe("example.com")
    expect(allowedExternalURL("mailto:test@example.com").protocol).toBe("mailto:")
    expect(() => allowedExternalURL("file:///C:/Windows/System32/calc.exe")).toThrow("不允许打开外部协议")
    expect(() => allowedExternalURL("https://user:password@example.com")).toThrow("不能包含嵌入式凭据")
    expect(() => allowedExternalURL("https://blocked.example", ["approved.example"])).toThrow("企业策略批准")
    expect(allowedExternalURL("https://docs.approved.example", ["approved.example"]).hostname).toBe(
      "docs.approved.example",
    )
  })

  test("allows only named desktop applications exposed by the workbench", () => {
    expect(isApprovedAppName("code")).toBeTrue()
    expect(isApprovedAppName("powershell")).toBeTrue()
    expect(isApprovedAppName("C:\\Windows\\System32\\cmd.exe")).toBeFalse()
  })

  test("redacts secrets from structured and exported logs", () => {
    expect(redactLogText("Authorization: Bearer token-value")).toBe("Authorization: <REDACTED>")
    expect(redactLogText("api_key=sk-example-secret-key")).not.toContain("sk-example-secret-key")
    expect(redactLogValue({ nested: { refresh_token: "secret", safe: "visible" } })).toEqual({
      nested: { refresh_token: "<REDACTED>", safe: "visible" },
    })
  })
})
