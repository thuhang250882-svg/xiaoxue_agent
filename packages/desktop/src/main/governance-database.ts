import { app } from "electron"
import { join } from "node:path"

export function governanceDatabasePath() {
  return join(app.getPath("userData"), "xiaoxue", "governance.sqlite")
}
