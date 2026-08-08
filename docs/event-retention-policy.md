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

## 五、同步兼容策略

现状：仓库内的同步能力是实验性 workspace 同步（`packages/opencode/src/server/routes/instance/httpapi/groups/sync.ts`
的 `/sync/start|replay|steal|history`），仅在运行时标志 `OPENCODE_EXPERIMENTAL_WORKSPACES`
开启时启用（`src/effect/runtime-flags.ts`）。录井小雪产品默认不开启该标志，
本阶段也未在真实远端环境验证过同步链路：

> **同步兼容性未在真实远端环境确认。**

风险分析（供未来启用同步时参考）：

- `/sync/history` 直接读取 `event` 表全量行（含 tombstone），接收端通过
  `EventV2.replay` 逐条重放（`src/control-plane/workspace.ts` 的 `syncHistory`）。
- tombstone 的 `data` 已剥离正文，若接收端按 `message.part.updated.1` 的完整
  Schema 解码会在该条上失败；现有重放路径对单条失败记录警告日志并跳过，
  不阻断后续事件，且每个 part 的最新完整快照仍会随历史传输，远端终态仍正确。
- seq 序列本身保留（tombstone 不删行），事件序号连续性不被破坏。

若未来启用真实同步，必须先完成以下之一：

1. 接收端显式识别 `compacted: true` 载荷并按 tombstone 语义登记（不解码正文）；
2. 或在同步导出端跳过 tombstone 行，并让接收端容忍 seq 空洞；
3. 或对需要全量历史的聚合禁止在同步完成前执行破坏性压缩。

## 六、版本兼容策略

- **新客户端读旧完整事件**：完全兼容——节流与压缩只影响写入与存量数据形态，
  旧格式完整快照按原 Schema 解码不变。
- **旧客户端读本库新压缩事件**：本地 UI 与读表路径已过滤 tombstone，不受影响；
  仅当第三方直接解析原始 `event` 表时，需识别 `compacted: true` 标记。
  tombstone 保留 `type` / `seq` / 事件 id / 时间 / `originalBytes` 审计字段，
  属于显式标记的载荷降级而非格式破坏。
- 事件类型版本号不变（仍为 `message.part.updated.1`），未引入新 Schema 版本；
  如未来需要跨实例传输 tombstone，应在 data 中补充 schema/version 字段再启用。

## 七、回滚策略

| 场景 | 回滚方式 |
| --- | --- |
| 节流异常 | 设置 `XIAOXUE_EVENT_COALESCE=off` 立即回退逐快照落盘，无需改代码 |
| 压缩异常 | 压缩仅在轮次收尾异步执行且尽力而为（失败即忽略）；停用可回退 `prompt.ts` 挂钩提交 `3c03d2eb24` |
| 已压缩数据 | tombstone 化不可逆（被剥离的中间正文无法恢复），但终态完整；真实库清理前强制备份（`.bak-*`），回滚即恢复备份 |
| 全库清理误操作 | `maintain-event-db.ts backup` 生成的备份不自动覆盖、不自动删除；恢复方式为停止应用后以备份替换 |
