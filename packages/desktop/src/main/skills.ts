import { existsSync } from "node:fs"
import { join } from "node:path"
import { app } from "electron"

// Packaged builds ship the preset xiaoxue skills as an extraResource next to
// the app binary (see electron-builder.config.ts); dev runs load them straight
// from the repository checkout. Resolving against process.resourcesPath at
// runtime keeps the path valid no matter where the app is installed.
export function bundledSkillsDir() {
  const dir = app.isPackaged
    ? join(process.resourcesPath, "skills")
    : join(app.getAppPath(), "..", "..", ".opencode", "skills")
  if (!existsSync(dir)) return
  return dir
}
