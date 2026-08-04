// opencode-dev.db event 表受控维护入口。
//
// 用法（从仓库根目录）：
//   bun script/maintain-event-db.ts analyze                 # 各表行数/体积、event 类型分布、dataUrl 统计
//   bun script/maintain-event-db.ts dry-run                 # 只读计算可压缩事件与预计释放空间，不写任何字节
//   bun script/maintain-event-db.ts backup                  # 复制为 <db>.bak-<timestamp>（已有备份则复用，不覆盖）
//   bun script/maintain-event-db.ts clean                   # 需先有备份；分批把同 part 的旧快照替换为 tombstone
//   bun script/maintain-event-db.ts checkpoint              # PRAGMA wal_checkpoint(TRUNCATE)
//   bun script/maintain-event-db.ts vacuum                  # 仅在 clean 之后、用户明确需要回收文件空间时执行
//
// 可用 --db <path> 指定数据库副本，默认指向当前开发实例的数据库。
// clean 不删除任何事件行：保留 type/seq/session/part 身份与时间，只剥离旧快照中的
// 正文、工具输出与附件载荷；每个 part 的最新快照、用户消息正文、Provider 错误、
// audit_event 审核链均原样保留。VACUUM 必须由用户在备份确认后再单独执行。

import { Database } from "bun:sqlite"
import { existsSync } from "node:fs"
import path from "node:path"
import os from "node:os"
import { XiaoxueEventDbMaintenance as Maintenance } from "../packages/opencode/src/xiaoxue/event-db-maintenance"
import { XiaoxueSqlite } from "../packages/opencode/src/xiaoxue/sqlite.bun"

const args = process.argv.slice(2)
const command = args[0]
const dbFlag = args.indexOf("--db")
const dbPath =
  dbFlag >= 0 && args[dbFlag + 1]
    ? path.resolve(args[dbFlag + 1])
    : path.join(os.homedir(), ".local", "share", "opencode", "opencode-dev.db")

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

if (!command) fail("缺少子命令：analyze | dry-run | backup | clean | checkpoint | vacuum")
if (!existsSync(dbPath)) fail(`数据库不存在：${dbPath}`)

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`

switch (command) {
  case "analyze": {
    const db = new Database(dbPath, { readonly: true })
    const tables = Maintenance.tableSizes(XiaoxueSqlite.wrap(db))
    const events = Maintenance.analyze(XiaoxueSqlite.wrap(db))
    db.close()
    console.log(`数据库：${dbPath}`)
    console.log("\n各表行数与估算体积：")
    for (const table of tables) console.log(`  ${table.name.padEnd(24)} ${String(table.count).padStart(9)} 行  ${mb(table.bytes).padStart(12)}`)
    console.log(`\nevent 类型分布（前 8）：`)
    for (const type of events.types.slice(0, 8))
      console.log(`  ${type.type.padEnd(32)} ${String(type.count).padStart(9)} 条  ${mb(type.bytes).padStart(12)}`)
    console.log(`\n仍含 data: URL 的事件：${events.dataUrlEvents} 条 / ${mb(events.dataUrlBytes)}`)
    break
  }
  case "dry-run": {
    const db = new Database(dbPath, { readonly: true })
    const plan = Maintenance.planCleanup(XiaoxueSqlite.wrap(db))
    db.close()
    console.log(`event 总量：${plan.eventCount} 条 / ${mb(plan.eventBytes)}`)
    console.log(`可压缩旧 part 快照：${plan.candidates.length} 条 / ${mb(plan.candidatesBytes)}`)
    console.log(`预计释放（替换为 tombstone 后）：约 ${mb(plan.estimatedBytesFreed)}`)
    console.log(`注意：文件空间回收需在 clean + checkpoint 之后，由用户确认再执行 vacuum。`)
    break
  }
  case "backup": {
    const backup = Maintenance.backupDatabase(dbPath)
    console.log(backup.created ? `已创建备份：${backup.path}` : `已存在备份，未覆盖：${backup.path}`)
    break
  }
  case "clean": {
    Maintenance.requireBackup(dbPath)
    const db = XiaoxueSqlite.open(dbPath)
    const plan = Maintenance.planCleanup(db)
    const result = Maintenance.executeCleanup(db, plan)
    Maintenance.checkpoint(db)
    db.close()
    console.log(`已压缩 ${result.updated} 条旧 part 快照（${result.batches} 批），并已 checkpoint WAL。`)
    console.log(`预计释放约 ${mb(plan.estimatedBytesFreed)}；确认无误后再执行 vacuum 回收文件空间。`)
    break
  }
  case "checkpoint": {
    const db = XiaoxueSqlite.open(dbPath)
    Maintenance.checkpoint(db)
    db.close()
    console.log("WAL checkpoint 完成。")
    break
  }
  case "vacuum": {
    Maintenance.requireBackup(dbPath)
    const db = XiaoxueSqlite.open(dbPath)
    db.exec("VACUUM")
    db.close()
    console.log("VACUUM 完成，文件空间已回收。")
    break
  }
  default:
    fail(`未知子命令：${command}`)
}
