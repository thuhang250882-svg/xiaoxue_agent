# Event 保留与压缩策略（Event Retention Policy）

适用范围：录井小雪 0.8（opencode EventV2 事件溯源存储）
状态：随 0.8 RC3 落地，服务端统一生效。

## 背景

`event` 表是 append-only 事件溯源存储。历史版本在流式输出期间，`message.part.updated.1`
会为**每个 token 写一次 part 的完整快照**，导致数据库体积与 WAL 线性暴涨（实测曾出现
单库 6.59GB 的洪泛）。本策略定义事件行的保留规则、压缩时机与安全边界。

## 一、写入侧：流式节流（coalescing）

位置：服务端统一事件持久化边界 `packages/core/src/event.ts`。不允许只做前端 debounce。

- **参与节流的范围**：仅 `message.part.updated` 中 `part.type` 为 `text` / `reasoning`
  的流式完整快照。
- **不参与节流、即时落盘**：
  - tool 事件与工具 part（审核、知识、shell、task 等调用与结果）；
  - 用户消息（`message.updated`、user 文本 part）；
  - Provider 错误（`session.error`）与 step 边界事件；
  - 其余所有非 text/reasoning 的 part 类型。
- **持久化窗口**：默认 300ms（任务书建议 250~500ms 区间内）。窗口内同一 part 的多个
  快照合并，只落盘**最新一个**。
- **UI 实时性不受影响**：节流仅作用于 SQLite 落盘，pubsub 实时通知逐 token 发出，
  前端流式显示保持逐字更新。
- **强制落盘时机**：
  - 窗口定时器到期；
  - 同一聚合的下一个非节流事件到达（保证 seq 顺序）；
  - 流结束 / 会话稳定收尾；
  - Abort：保存最后有效状态（通过非节流收尾事件触发 flush）；
  - Provider 错误：保存最后状态 + 错误事件；
  - 服务退出 finalizer 尽力 flush。
- **环境变量**：
  - `XIAOXUE_EVENT_COALESCE=off/0/false`：关闭节流，回退到逐快照落盘旧行为；
  - `XIAOXUE_EVENT_COALESCE_MS=<n>`：调整窗口（最小 50ms，默认 300ms）。

## 二、稳定后：中间快照压缩（compaction）

时机：Session 轮次结束、进入稳定状态后（`prompt.ts` runLoop 正常结束点），
延迟到下一个宏任务异步执行，**不在每个 token 到达时执行**。

实现：`packages/opencode/src/xiaoxue/event-db-maintenance.ts` 的
`planAggregateCleanup` + `compactSessionEvents`。

### 保留规则（保留项）

- 每个 part 的**最新完整快照**；
- 用户消息正文；
- Tool 调用与结果；
- Provider 错误记录；
- 审核结果与知识工具结果。

### 压缩规则（压缩项）

- 同一 Session 内、同一 text/reasoning part **被更晚快照覆盖的中间完整快照**。

### 压缩机制

- 绝不删除事件行：保留 `type` / `seq` / `aggregate_id` / 事件 id，仅把旧快照 `data`
  替换为 **tombstone**（保留身份与时间元数据，标记 `compacted: true`，剥离正文载荷）。
- 重放 / UI 读取 / 聚合读取（`readAggregate`、`readAfter`）一律**跳过 tombstone**，
  因此重放最终状态与未压缩前完全一致，Tombstone 不会显示在 UI。
- 用户消息同一 part 只有一个快照，不会命中 `seq < max_seq`，天然不在压缩范围。

## 三、运维侧：全库清理

`script/maintain-event-db.ts` 提供受控的只读分析与批量压缩（`planCleanup` +
`executeCleanup`），跨 Session 扫描「存在更晚快照」的旧 part 快照。执行前要求
`backup` 生成 `.bak-*` 副本，压缩后可 `checkpoint(TRUNCATE)` 回收 WAL。

## 四、正确性不变量

1. 重放最终状态不变：每个 part 保留最新完整快照，旧快照被新快照覆盖本就不影响终态。
2. seq 顺序不变：节流 flush 按插入顺序提交；非节流事件到达先 flush 同聚合暂存。
3. UI / 读表实时：text/reasoning 投影在暂存时即执行（幂等 upsert），读表不滞后。
4. 无数据丢失：Abort、Provider 错误、流结束均强制落盘最后有效状态。
