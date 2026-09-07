import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260831113000_ensure_event_created_column",
  up(tx) {
    return Effect.gen(function* () {
      const columns = yield* tx.all<{ name: string }>(`PRAGMA table_info('event')`)
      if (columns.some((column) => column.name === "created")) return
      yield* tx.run(`ALTER TABLE \`event\` ADD \`created\` integer NOT NULL DEFAULT 0;`)
    })
  },
} satisfies DatabaseMigration.Migration
