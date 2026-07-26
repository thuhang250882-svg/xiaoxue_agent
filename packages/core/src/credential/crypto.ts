export * as CredentialCrypto from "./crypto"

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const PREFIX = "xiaoxue-credential:v1:"

export function encrypted(value: string) {
  return value.startsWith(PREFIX)
}

export function keyAvailable() {
  return Boolean(process.env.XIAOXUE_CREDENTIAL_ENCRYPTION_KEY?.trim())
}

export function encrypt(value: unknown) {
  const key = encryptionKey()
  if (!key) throw new Error("缺少凭据加密密钥，拒绝以明文保存凭据。")
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()])
  return [PREFIX, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(
    ".",
  )
}

export function decrypt(value: string) {
  if (!encrypted(value)) return JSON.parse(value) as unknown
  const key = encryptionKey()
  if (!key) throw new Error("凭据已加密，但当前进程没有可用的凭据解密密钥。")
  const [header, iv, tag, ciphertext] = value.split(".")
  if (header !== PREFIX || !iv || !tag || !ciphertext) throw new Error("凭据密文格式无效。")
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"))
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return JSON.parse(
    Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8"),
  ) as unknown
}

function encryptionKey() {
  const value = process.env.XIAOXUE_CREDENTIAL_ENCRYPTION_KEY?.trim()
  if (!value) return undefined
  const key = Buffer.from(value, "base64")
  if (key.byteLength !== 32) throw new Error("凭据加密密钥必须是 32 字节 Base64。")
  return key
}
