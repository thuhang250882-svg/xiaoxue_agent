import { cleanupStoreFiles } from "./src/main/store-cleanup.ts"

const userData = "C:\\Users\\Administrator\\AppData\\Roaming\\ai.opencode.desktop.dev"
console.log("start", new Date().toISOString())
const timeout = setTimeout(() => {
  console.error("TIMEOUT: cleanupStoreFiles hung for 30s even WITH the race guard")
  process.exit(2)
}, 30_000)
const result = await cleanupStoreFiles(userData)
clearTimeout(timeout)
console.log("done", new Date().toISOString(), "deleted:", result.deleted.length, "scanned:", result.scanned)
process.exit(0)
