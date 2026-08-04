export * as XiaoxueSqlite from "./sqlite.bun"

import { Database } from "bun:sqlite"
import type { AdapterDatabase } from "./sqlite"

export type { AdapterDatabase } from "./sqlite"

export function open(file: string): AdapterDatabase {
  const database = new Database(file)
  const statements = new Set<ReturnType<Database["prepare"]>>()
  return {
    exec(sql) {
      database.exec(sql)
    },
    prepare(sql) {
      const statement = database.prepare(sql)
      statements.add(statement)
      return statement
    },
    close() {
      statements.forEach((statement) => statement.finalize())
      statements.clear()
      database.close()
    },
  }
}
