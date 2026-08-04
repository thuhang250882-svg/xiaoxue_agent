// 演练辅助脚本：对指定数据库做清理前快照 / 清理后核验。
// 用法：bun script/rehearsal-check.ts <dbPath> <before|after>
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"

const dbPath = process.argv[2]
const mode = process.argv[3] ?? "before"
if (!dbPath) {
  console.error("用法：bun script/rehearsal-check.ts <dbPath> <before|after>")
  process.exit(1)
}

const db = new Database(dbPath, { readonly: true })
const get = (sql: string) => db.query(sql).get() as Record<string, unknown>

const sessions = get("SELECT count(*) c FROM session").c
const messages = get("SELECT count(*) c FROM message").c
const parts = get("SELECT count(*) c FROM part").c
const events = get("SELECT count(*) c FROM event").c
const lastSeq = get("SELECT max(seq) s FROM event").s

console.log(`[counts] sessions=${sessions} messages=${messages} parts=${parts} events=${events} last_seq=${lastSeq}`)

// part 类型分布（type 存于 data JSON 内）
const types = db.query("SELECT json_extract(data,'$.type') type, count(*) c FROM part GROUP BY 1 ORDER BY c DESC").all()
console.log("[part types]", JSON.stringify(types))

const dataCol = "data"

if (dataCol) {
  const reviewParts = db
    .query(`SELECT count(*) c FROM part WHERE CAST(${dataCol} AS TEXT) LIKE '%review%' OR CAST(${dataCol} AS TEXT) LIKE '%审核%'`)
    .get() as { c: number }
  console.log(`[review-like parts] ${reviewParts.c}`)

  // 清理前后对比用指纹：对所有 part 的 id+type+data 计算聚合 hash
  const rows = db.query(`SELECT id, json_extract(data,'$.type') type, CAST(${dataCol} AS TEXT) d FROM part ORDER BY id`).all() as {
    id: string
    type: string
    d: string | null
  }[]
  const hash = createHash("sha256")
  for (const row of rows) hash.update(`${row.id}|${row.type}|${row.d ?? ""}\n`)
  console.log(`[part fingerprint] ${hash.digest("hex")}`)
}

// 最新快照指纹：event 表中每个 (aggregate_id, part.id) 的最新 message.part.updated 快照
const latest = db
  .query(
    `SELECT e.data FROM event e
     JOIN (SELECT aggregate_id a, json_extract(data,'$.part.id') p, max(seq) m
           FROM event WHERE type LIKE 'message.part.updated.%' GROUP BY 1, 2) x
     ON e.aggregate_id=x.a AND json_extract(e.data,'$.part.id')=x.p AND e.seq=x.m
     ORDER BY e.seq`,
  )
  .all() as { data: string }[]
const latestHash = createHash("sha256")
for (const row of latest) latestHash.update(row.data + "\n")
console.log(`[latest snapshot count] ${latest.length}`)
console.log(`[latest snapshot fingerprint] ${latestHash.digest("hex")}`)

// message 表指纹
const msgs = db.query("SELECT id, json_extract(data,'$.role') role FROM message ORDER BY id").all() as { id: string; role: string }[]
const msgHash = createHash("sha256")
for (const row of msgs) msgHash.update(`${row.id}|${row.role}\n`)
console.log(`[message fingerprint] ${msgHash.digest("hex")}`)

db.close()
console.log(`[mode] ${mode}`)
