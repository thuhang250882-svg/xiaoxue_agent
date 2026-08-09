# Event 流式增长基准（10000 字流式输出，节流前后对比）

对应任务：录井小雪 0.8 RC3 第三阶段 · 第三节。基准脚本：[`packages/opencode/script/bench-event-coalesce.ts`](../packages/opencode/script/bench-event-coalesce.ts)。

## 复现方法

```powershell
cd packages/opencode
bun script/bench-event-coalesce.ts
```

脚本在同一进程内先后跑两轮完全相同的流式输出，分别使用 `EventV2.layerWith({ coalesce: { enabled: false } })`（旧行为）与 `{ enabled: true, intervalMs: 300 }`（服务端统一持久化边界节流），各自落到独立的临时 SQLite 数据库，结束后读取 event 行数/字节、数据库与 WAL 文件大小，并用一个全新的 EventV2 层 `readAggregate` 重放，取最后一条 `message.part.updated` 的 `part.text` 计算 SHA-256。

## 流式参数

| 参数 | 值 | 说明 |
| --- | --- | --- |
| 目标正文长度 | 10000 字符 | 中文地质语料重复填充 |
| 每个 delta 增量 | 10 字符 | 每次 publish 携带**全量累积快照**（与真实 Provider 流一致） |
| delta 到达间隔 | 5 ms | 共 publish 1000 次 |
| 节流窗口 | 300 ms | 服务端持久化窗口（要求区间 250~500 ms） |
| 流结束 | 强制 `flush()` | 保证最终完整快照落盘 |

## 基准结果（2026-08-10，Windows，Bun 1.3.14，Git `64d9d1ef06`）

| 指标 | 节流关闭（before） | 节流开启（after） | 变化 |
| --- | ---: | ---: | ---: |
| publish 次数（UI 侧流式事件） | 1000 | 1000 | 不变 |
| **event 新增行数** | 1000 | 49 | **-95.1%** |
| **message.part.updated.1 落盘数量** | 1000 | 49 | **-95.1%** |
| **event data 持久化字节** | 5,160,400 | 257,332 | **-95.0%** |
| 数据库文件大小（含 checkpoint 后） | 15,413,248 B | 4,096 B | -99.97% |
| WAL 文件大小 | 4,161,232 B | 2,274,272 B | -45.3% |
| 首 Token 通知时间 | 5 ms | 1 ms | 无劣化 |
| 流总耗时 | 15,707 ms | 15,521 ms | 无劣化 |
| UI 更新次数（listen 通知数） | 1000 | 1049 | 见下方说明 |
| 最终正文 SHA-256 | `45d56115…fff0ee` | `45d56115…fff0ee` | **完全一致** |
| 重启重放正文 SHA-256 | `45d56115…fff0ee` | `45d56115…fff0ee` | **完全一致** |

完整 SHA-256：`45d56115636cbb80fde9473cc8d2dab74ae62507937b7fc897c82413dbfff0ee`。

### UI 更新次数说明

节流开启后监听器收到的通知为 1049 次 = 1000 次**暂存时的实时通知**（UI 逐 delta 实时刷新，与旧行为完全一致）+ 49 次**落盘确认通知**（flush 持久化后对 durable 事件的二次发布）。实时通知不经过节流窗口，逐 delta 立即发出，因此 UI 流式显示无变化、无卡顿；落盘确认通知携带与最新暂存快照相同的内容，UI 侧幂等覆盖渲染。

## 验收对照

| 验收项 | 要求 | 实测 | 结论 |
| --- | --- | --- | --- |
| Event 数量减少 | ≥ 80% | 95.1%（1000 → 49） | ✅ |
| 持久化字节减少 | ≥ 90% | 95.0%（5,160,400 → 257,332 B） | ✅ |
| 最终正文完全一致 | SHA-256 相同 | before/after/重放三者一致 | ✅ |
| UI 无明显卡顿 | 首 Token 与流耗时不劣化 | 首 Token 0~6 ms，流耗时持平 | ✅ |
| Abort 与 Tool 测试通过 | 单元覆盖 | 见下方 | ✅ |

## Abort 与 Tool 正确性（单元覆盖）

节流语义由 [`packages/core/test/event-coalesce.test.ts`](../packages/core/test/event-coalesce.test.ts) 8 个用例覆盖（全部通过）：

- **流结束/中断强制保存**：`flush()` 将暂存的最新快照立即落盘；finalizer 在层释放时兜底 flush，对应 Abort 保存最后有效状态、Provider 错误保存最后状态。
- **Tool 事件不参与节流**：`message.part.updated` 仅当 `part.type` 为 `text`/`reasoning` 时才合并；step-start、tool part 等非节流事件到达同一聚合时先强制 flush 暂存队列再提交自身，保证 seq 顺序与即时持久化。
- **顺序不变量**：非节流事件强制 flush 的保序行为有专项用例，重放按 seq 回放不受节流影响（本基准 replaySha256 即为证据）。

## 结论

服务端统一事件持久化边界的 300 ms 合并窗口将 10000 字流式输出的落盘事件从 1000 行压到 49 行（约每窗口一次 + 结束强制一次），持久化字节减少 95%，全部验收指标达标，且最终正文与重启重放正文 SHA-256 完全一致。
