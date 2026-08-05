# 数据库副本 GUI 验收（121.1 MB 清理副本）

对应任务：录井小雪 0.8 RC3 第三阶段 · 第四节。验收时间：2026-08-05。

## 验收对象

| 项目 | 值 |
| --- | --- |
| 数据库副本 | `E:\software programming\opencode-dev\.db-rehearsal\rehearsal.db` |
| 副本大小 | 121.1 MB（127,025,152 B，由 7,271.9 MB 原件清理而来） |
| 加载方式 | `OPENCODE_DB` 环境变量指向副本绝对路径，启动已安装桌面端 |
| 副本状态 | event 206,776 条 / 59.2 MB；会话 49 个；tombstone 201,856 行；part 读表 1,588 行 |

## 数据层抽查（只读 SQL）

| 抽查项 | 要求 | 结果 | 结论 |
| --- | --- | --- | --- |
| 普通历史会话 | ≥10 个 | 49 个会话全部可读，GUI 列表显示 ≥10 个标题 | ✅ |
| 含附件的会话 | ≥5 个 | file part 16 条分布于 13 个会话（呼北2井录井报告.doc、储集层地化解释成果表.doc、套管记录.docx、招标文件 PDF 等），GUI 打开 5 个，中文文件名无乱码 | ✅ |
| 地质审核任务 | ≥5 个 | geology_report_review part 90 条 / 13 个会话（session 表业务任务同 13 个），GUI 打开 5 个，任务卡片与审核结果正常 | ✅ |
| Provider 错误记录 | ≥5 个 | **副本中不存在 Provider 级错误**（message.error 0 条、retry part 0 条）；改用工具错误记录 64 条验证错误展示，GUI 中红色错误气泡可读、不崩溃 | ⚠️ 见下方说明 |
| 审核 Part 随机抽查 | ≥20 个 | `ORDER BY RANDOM() LIMIT 20` 抽样 90 个审核 part 中的 20 条：pending 5 / running 13 / completed 2，全部非 tombstone、负载完整（抽查 completed 结果正文 128 字节 JSON 完整可读） | ✅ |
| DOCX 重新导出 | 点击验证 | GUI 未找到重新导出按钮（受限项，见下方） | ⚠️ |
| 旧 Session 继续提问 | 发送一条消息 | 在"呼北2井录井报告审查"会话发送提问，15 秒收到完整中文回复，消息入库、无崩溃 | ✅ |
| 新 Session 创建 | 新建成功 | 新建会话按钮立即创建草稿并激活，可正常输入 | ✅ |
| Tombstone 不显示在 UI | 大会话滚动验证 | 打开事件最多的会话（145,201 条 event，其中绝大多数为 tombstone）滚动两屏：正文连续完整，无 "compacted" 字样、无 JSON 残留、无空白气泡 | ✅ |

### 审核 Part 数量口径说明

任务书"553 个审核 Part"为第一阶段清理前的统计口径。清理后副本中 geology_report_review 工具 part 为 90 条（event 层），part 读表含审核标记 222 行（含审核状态元数据快照）。本次按清理后口径随机抽样 20 条，满足"至少 20 个"的要求。

### Provider 错误说明

副本内 `message.error` 与 retry part 均为 0 条，属于历史数据本身没有 Provider 错误的记录，而非读取失败。错误展示能力由 64 条工具错误 part（read/skill/geology_report_review 等）与 GUI 红色错误气泡验证覆盖。Provider 错误的实时行为验收安排在第六节（RC3 安装版 Provider 错误场景）。

### 受限项：DOCX 重新导出按钮未找到

在审核会话的更多选项菜单、右侧面板、Report 卡片中均未发现"重新导出/导出"入口；另观察到"审核记录"按钮点击后打开了新建会话页（行为异常）。导出功能代码（`exportPersistedGeologyReview`）在首次审核完成时自动执行并有产物登记，此处的"重新导出"入口缺失记入未解决问题（P1），不影响历史数据正确性。

## 结论

副本启动、历史会话、中文附件、地质审核任务、错误记录、旧会话续聊、新建会话、Tombstone 隐藏全部通过；2 项受限（Provider 错误副本无数据、重新导出入口未找到）如实记录。全程无崩溃。

截图证据：[`docs/evidence/db-rehearsal-gui/`](./evidence/db-rehearsal-gui/)（43 张，覆盖上述全部步骤）。
