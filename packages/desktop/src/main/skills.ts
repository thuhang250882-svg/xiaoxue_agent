import { existsSync } from "node:fs"
import { join } from "node:path"
import { app } from "electron"
import { verifyBundledResource } from "./resource-integrity"
import { syncManagedSkills } from "./skills-sync"

// Packaged builds ship the preset xiaoxue skills as an extraResource next to
// the app binary (see electron-builder.config.ts); dev runs load them straight
// from the repository checkout. Resolving against process.resourcesPath at
// runtime keeps the path valid no matter where the app is installed.
export function bundledSkillsDir() {
  const dir = app.isPackaged
    ? join(process.resourcesPath, "skills")
    : join(app.getAppPath(), "..", "..", ".opencode", "skills")
  if (!existsSync(dir)) return undefined
  verifyBundledResource("skills", dir)
  return dir
}

// Keep one writable skill catalog outside the installation directory. The
// packaged copy is an immutable recovery seed and is refreshed on every app
// update; user-created skills with other names remain untouched.
export function managedSkillsDir(bundled = bundledSkillsDir()) {
  if (!bundled) return undefined

  const directory = join(app.getPath("home"), ".xiaoxue", "skills")
  syncManagedSkills(bundled, directory)
  return directory
}
