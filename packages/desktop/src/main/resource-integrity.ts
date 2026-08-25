import { readFileSync } from "node:fs"
import path from "node:path"
import { app } from "electron"
import { ResourceIntegrityCore } from "./resource-integrity-core"

export function verifyBundledResource(prefix: string, directory: string) {
  const manifest = loadManifest()
  ResourceIntegrityCore.verify(prefix, directory, manifest)
}

function loadManifest() {
  const location = app.isPackaged
    ? path.join(process.resourcesPath, "integrity.json")
    : path.join(app.getAppPath(), "resources", "integrity.json")
  const value = (() => {
    try {
      return JSON.parse(readFileSync(location, "utf8")) as unknown
    } catch {
      return undefined
    }
  })()
  if (!ResourceIntegrityCore.isManifest(value)) throw new Error("缺少有效的打包资源完整性清单。")
  return value
}
