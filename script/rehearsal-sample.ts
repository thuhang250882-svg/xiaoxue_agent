// 演练收尾抽样：验证 vacuum 后审核结果与 tombstone 状态可读。
import { Database } from "bun:sqlite"

const db = new Database(".db-rehearsal/rehearsal.db", { readonly: true })

const reviewParts = db
  .query("SELECT json_extract(data,'$.type') t, substr(data,1,220) head FROM part WHERE data LIKE '%审核%' AND json_extract(data,'$.type')='tool' LIMIT 2")
  .all()
console.log("审核类 tool part 抽样：")
for (const row of reviewParts as { t: string; head: string }[]) console.log(`  [${row.t}] ${row.head}`)

const tomb = db.query(`SELECT count(*) c FROM event WHERE json_extract(data,'$.compacted')=1`).get() as { c: number }
console.log(`compacted(tombstone) 事件数：${tomb.c}`)

const sample = db.query(`SELECT substr(data,1,300) head FROM event WHERE json_extract(data,'$.compacted')=1 LIMIT 1`).get() as
  | { head: string }
  | undefined
console.log(`tombstone 样本：${sample?.head ?? "(无)"}`)

const latestIntact = db
  .query(
    `SELECT count(*) c FROM event e
     JOIN (SELECT aggregate_id a, json_extract(data,'$.part.id') p, max(seq) m
           FROM event WHERE type LIKE 'message.part.updated.%' GROUP BY 1, 2) x
     ON e.aggregate_id=x.a AND json_extract(e.data,'$.part.id')=x.p AND e.seq=x.m
     WHERE json_extract(e.data,'$.compacted') IS NULL`,
  )
  .get() as { c: number }
console.log(`最新快照未被压缩数：${latestIntact.c}（应为 1588）`)

db.close()
