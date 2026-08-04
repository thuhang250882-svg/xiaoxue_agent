import { cpSync, mkdirSync } from "node:fs"

export function syncManagedSkills(bundled: string, directory: string) {
  mkdirSync(directory, { recursive: true })
  cpSync(bundled, directory, { recursive: true, force: true })
}
