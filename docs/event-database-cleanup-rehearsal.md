# 事件数据库清理副本演练报告（录井小雪 0.8 RC3）

演练日期：2026-07-09
真实库：`~/.local/share/opencode/opencode-dev.db`（**本次演练未做任何改动**）
副本位置：仓库内 `.db-rehearsal/rehearsal.db`（已加入 `.gitignore`，演练结束可整目录删除）

## 结论

副本演练证明清理链路安全无损：**7271.9MB → 121.1MB（缩减 98.3%）**，
历史会话、消息、part 与审核结果全部完好。等待用户确认后，可用同一命令序列
对真实库执行（真实库执行前会自动要求备份）。

## 演练步骤与结果

| 步骤 | 命令 | 结果 |
| --- | --- | --- |
| 复制副本 | `Copy-Item`（源 WAL/-shm 均为 0 字节，复制安全） | 7271.9MB 完整复制 |
| analyze | `bun script/maintain-event-db.ts analyze --db <副本>` | event 表 206776 行 / 6589.3MB，其中 `message.part.updated.1` 205022 条 / 6423.8MB；仍含 data: URL 的事件仅 15 条 / 0.5MB |
| dry-run | `... dry-run --db <副本>` | 可压缩旧 part 快照 201856 条 / 6416.9MB，预计释放约 6367.7MB |
| backup | `... backup --db <副本>` | 创建 `rehearsal.db.bak-2026-08-04T10-00-40-013Z`（7271.9MB） |
| clean | `... clean --db <副本>` | 压缩 201856 条旧快照（201 批，每批 2000 条事务），并 checkpoint WAL |
| vacuum | `... vacuum --db <副本>` | VACUUM 完成，文件从 7271.9MB 降至 121.1MB |
| integrity_check | `PRAGMA integrity_check` | `ok` |
| foreign_key_check | `PRAGMA foreign_key_check` | 无违例 |

## 无损验证（清理前 vs clean 后 vs vacuum 后，三组指纹完全一致）

验证脚本：`script/rehearsal-check.ts`（行数/类型分布 + SHA-256 聚合指纹）。

| 指标 | 清理前 | clean 后 | vacuum 后 |
| --- | --- | --- | --- |
| session / message / part / event 行数 | 49 / 343 / 1588 / 206776 | 相同 | 相同 |
| event 最大 seq | 145200 | 相同 | 相同 |
| part 全表指纹 | `b704dd41…594a56` | 相同 | 相同 |
| 每个 part 的最新快照指纹（1588 条） | `e3f19e55…93342` | 相同 | 相同 |
| message 表指纹 | `85c36277…bb027a` | 相同 | 相同 |
| 审核相关 part（含 review/审核 关键词） | 553 | 相同 | 相同 |

补充抽样（`script/rehearsal-sample.ts`）：

- compacted 事件数 201856，与 dry-run 候选数一致；
- 每个 part 的最新快照 1588 条全部未被压缩；
- tombstone 保留 sessionID/part 身份/时间/`originalBytes` 审计字段；
- 审核类 tool part（geology-knowledge skill、xiaoxue_route 地质报告审核）正文 vacuum 后仍可读。

## 真实库执行预案（等待用户确认，本阶段不执行）

```powershell
# 在仓库根目录依次执行（clean 前会自动检查备份，vacuum 前建议再次确认）
bun script/maintain-event-db.ts backup
bun script/maintain-event-db.ts dry-run
bun script/maintain-event-db.ts clean
bun script/maintain-event-db.ts vacuum   # 用户确认备份无误后再执行
```

注意：

1. 执行前确认桌面应用与 sidecar 已退出，避免写入冲突；
2. 真实库备份将占用约 7.3GB 磁盘（与库同目录）；
3. clean 不删除任何事件行，重放最终状态不变；但被压缩的中间快照正文不可恢复，
   属于预期行为（最终快照已包含完整状态）；
4. 空间回收必须 clean + checkpoint 之后由用户确认再 vacuum。

## 增长根因（本阶段不修改，记录备查）

`message.part.updated.1` 在流式输出时每次保存完整 Part 快照，是持续增长主因。
后续方向：流式事件持久化节流、结束时写最终完整快照、Session 结束后自动压缩
中间快照、定期维护策略。
