import { randomBytes } from "node:crypto"
import { safeStorage } from "electron"
import { getStore } from "./store"

const KEY = "credential-envelope-key"

export function credentialEncryptionKey() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("系统安全存储不可用，无法安全启动凭据存储。")
  }
  const store = getStore("xiaoxue.security")
  const existing = store.get(KEY)
  if (typeof existing === "string") {
    return safeStorage.decryptString(Buffer.from(existing, "base64"))
  }
  const key = randomBytes(32).toString("base64")
  store.set(KEY, safeStorage.encryptString(key).toString("base64"))
  return key
}
