import { afterEach, describe, expect, test } from "bun:test"
import { CredentialCrypto } from "@opencode-ai/core/credential/crypto"

const original = process.env.XIAOXUE_CREDENTIAL_ENCRYPTION_KEY

afterEach(() => {
  if (original === undefined) delete process.env.XIAOXUE_CREDENTIAL_ENCRYPTION_KEY
  if (original !== undefined) process.env.XIAOXUE_CREDENTIAL_ENCRYPTION_KEY = original
})

describe("credential envelope encryption", () => {
  test("encrypts credential JSON with authenticated encryption", () => {
    process.env.XIAOXUE_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64")
    const value = { type: "key", key: "enterprise-secret" }
    const stored = CredentialCrypto.encrypt(value)

    expect(CredentialCrypto.encrypted(stored)).toBeTrue()
    expect(stored).not.toContain("enterprise-secret")
    expect(CredentialCrypto.decrypt(stored)).toEqual(value)
  })

  test("reads legacy JSON so it can be migrated", () => {
    delete process.env.XIAOXUE_CREDENTIAL_ENCRYPTION_KEY
    expect(CredentialCrypto.decrypt('{"type":"key","key":"legacy"}')).toEqual({
      type: "key",
      key: "legacy",
    })
  })

  test("refuses plaintext credential writes in every runtime", () => {
    delete process.env.XIAOXUE_CREDENTIAL_ENCRYPTION_KEY
    expect(() => CredentialCrypto.encrypt({ type: "key", key: "unsafe" })).toThrow("拒绝以明文保存凭据")
  })
})
