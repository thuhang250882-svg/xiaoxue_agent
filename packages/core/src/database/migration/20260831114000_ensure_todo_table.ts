import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260831114000_ensure_todo_table",
  up(tx) {
    return Effect.gen(function* () {
      const table = yield* tx.get<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'todo'`)
      if (table) return
      yield* tx.run(`
        CREATE TABLE \`todo\` (
          \`session_id\` text NOT NULL,
          \`content\` text NOT NULL,
          \`status\` text NOT NULL,
          \`priority\` text NOT NULL,
          \`position\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`todo_pk\` PRIMARY KEY(\`session_id\`, \`position\`),
          CONSTRAINT \`fk_todo_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE INDEX \`todo_session_idx\` ON \`todo\` (\`session_id\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
