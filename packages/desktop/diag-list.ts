import { readdir, stat, readFile } from "node:fs/promises"
import { join } from "node:path"

const userData = "C:\\Users\\Administrator\\AppData\\Roaming\\ai.opencode.desktop.dev"
const now = Date.now()

function storeKind(name: string) {
  if (/^opencode\.draft\..+\.dat$/.test(name)) return "draft"
  if (/^opencode\.workspace\..+\.dat$/.test(name)) return "workspace"
}

async function isEmpty(file: string, size: number) {
  if (size > 128) return false
  const raw = await readFile(file, "utf8").catch(() => undefined)
  if (raw === undefined) return false
  if (raw.trim() === "") return true
  try { return Object.keys(JSON.parse(raw)).length === 0 } catch { return false }
}

const entries = await readdir(userData, { withFileTypes: true })
for (const entry of entries) {
  const kind = storeKind(entry.name)
  if (!kind) continue
  const file = join(userData, entry.name)
  const stats = await stat(file).catch(() => undefined)
  if (!stats?.isFile()) continue
  const ageDays = ((now - stats.mtimeMs) / 86400000).toFixed(2)
  const flag = kind === "draft" && now - stats.mtimeMs > 30 * 86400000 ? " STALE-BY-AGE" : ""
  console.log(`${kind} ${entry.name} size=${stats.size} age=${ageDays}d empty=${await isEmpty(file, stats.size)}${flag}`)
}
