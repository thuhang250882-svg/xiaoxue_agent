export * as XiaoxueSqlite from "./sqlite.node"

import { DatabaseSync } from "node:sqlite"
import type { AdapterDatabase } from "./sqlite"

export type { AdapterDatabase } from "./sqlite"

export function open(file: string): AdapterDatabase {
  return new DatabaseSync(file)
}
