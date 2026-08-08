# 数据库维护入口设计（CLI 现状 + UI 后续设计）

对应任务：录井小雪 0.8 RC3 第三阶段 · 第八节。本阶段保留并验证安全 CLI，UI 页面作为后续迭代设计输出。

## 一、当前 CLI 能力（已实现并演练验证）

入口：`bun script/maintain-event-db.ts <子命令> [--db <path>]`
（实现：[`script/maintain-event-db.ts`](../script/maintain-event-db.ts) + [`packages/opencode/src/xiaoxue/event-db-maintenance.ts`](../packages/opencode/src/xiaoxue/event-db-maintenance.ts)）

| 子命令 | 功能 | 安全约束 |
| --- | --- | --- |
| `analyze` | 各表行数/体积、event 类型分布、data:URL 统计、最近分析数据 | 只读打开 |
| `dry-run` | 计算可压缩事件数与预计释放空间，不写任何字节 | 只读打开 |
| `backup` | 复制为 `<db>.bak-<timestamp>`，已有备份复用不覆盖 | 不覆盖已有备份 |
| `clean` | 分批 tombstone 化旧 part 快照（每批 2000 条事务） | 必须先有备份；不删除事件行 |
| `checkpoint` | `PRAGMA wal_checkpoint(TRUNCATE)` | 仅 WAL 回收 |
| `vacuum` | 回收文件空间 | 仅允许在 clean 之后、用户明确执行 |

会话级自动压缩（轮次收尾异步执行）：`compactSessionEvents(sessionID, dbPath)`，
带 `busy_timeout=5000`，失败尽力而为不阻塞业务。

### CLI 安全要求核对（任务书第八节安全要求）

| 要求 | 落实方式 |
| --- | --- |
| 默认不自动 VACUUM | vacuum 是独立子命令，永不自动执行 |
| 清理前必须备份 | `clean` 检测到无 `.bak-*` 即拒绝执行 |
| 检查磁盘可用空间 | 备份阶段由复制操作隐式校验；UI 版需显式检查（见下） |
| 有任务运行时禁止维护 | CLI 要求在应用停止后执行；UI 版需运行时互斥（见下） |
| 维护期间禁止写入 | CLI 通过停机保证；UI 版需维护锁（见下） |
| 失败不删除原数据库 | 全部操作只增不改删；tombstone 化是 UPDATE 而非 DELETE |
| 不覆盖已有备份 | backup 检测到同时间戳备份则复用 |
| 不显示用户消息正文 | analyze/dry-run 只输出统计数字与类型分布 |
| 不输出完整本地敏感路径 | 维护日志只输出文件名与大小（UI 版沿用） |
| 清理结果可审计 | tombstone 保留 id/seq/时间/originalBytes；演练报告存档于 `docs/event-database-cleanup-rehearsal.md` |

## 二、后续 UI 设计（本阶段不实现）

位置建议：设置页新增"数据库维护"分组，或独立"维护中心"面板。

### 状态展示

| 展示项 | 数据来源 |
| --- | --- |
| 当前数据库大小 | `stat(Database.path())` |
| event 表大小 | `Maintenance.tableSizes()` |
| WAL 大小 | `stat(<db>-wal)` |
| 可压缩事件数量 | `Maintenance.planCleanup().candidates.length`（dry-run 只读） |
| 预计释放空间 | `planCleanup().candidatesBytes` |
| 最近一次分析/备份/清理时间 | 维护状态文件（新增，存于数据目录，不含正文） |

### 操作按钮

分析数据库（只读）→ 创建备份 → 压缩历史 Event（clean）→ Checkpoint WAL → 回收磁盘空间（vacuum，二次确认）→ 打开备份目录。

### UI 必须补充的安全机制

1. **维护锁**：维护期间将服务端置为只读模式（拒绝 prompt 提交与事件写入），完成后恢复；有任务运行（活跃 drain / 流式输出中）时按钮禁用。
2. **磁盘空间预检**：备份前检查目标盘可用空间 ≥ 数据库大小 ×1.1，不足则中止并提示。
3. **进度与审计**：clean 分批进度条（每批 2000 条），完成后展示压缩条数、释放字节、备份文件名；结果追加到维护状态文件供审计。
4. **vacuum 二次确认**：弹窗展示当前备份文件名与时间，用户勾选确认后才执行。
5. **失败恢复**：任何阶段失败只中止后续步骤，不回滚已完成的 tombstone 化（终态不受影响），提示用户从备份恢复的途径。
6. **隐私**：界面与日志不出现消息正文、附件内容与完整绝对路径（仅显示文件名与目录名）。

## 三、真实库维护前置条件（第九节清单对照）

副本演练已满足全部前置（见 [`docs/event-database-cleanup-rehearsal.md`](./event-database-cleanup-rehearsal.md) 与
[`docs/db-rehearsal-gui-acceptance.md`](./db-rehearsal-gui-acceptance.md)）：副本 clean/vacuum 成功、
integrity_check=ok、foreign_key_check 无违例、历史会话可读、审核历史可见、
Tombstone 不出现在 UI、应用可创建新会话。唯一受限项：GUI 内"DOCX 重新导出"入口
未找到（审核完成时的自动导出功能已由代码与产物登记验证）。

真实库清理**需用户确认后**按演练预案顺序执行（关闭程序 → 备份 → dry-run → clean → checkpoint → 用户确认 → vacuum → 校验 → 启动验收），备份永久保留不自动删除。
