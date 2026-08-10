# 录井小雪 0.8 RC3 最终优化处理报告

> 本文保留 RC3 阶段的历史结论。当前 RC4 代码、测试、构建与发布门槛请以
> [xiaoxue-0.8-rc4-delivery-audit.md](./xiaoxue-0.8-rc4-delivery-audit.md) 为准。

报告日期：2026-08-10
代码基线：`dev` / `64d9d1ef0693146f30a4c031ebbee3dd93f471ad`
发布结论：**建议小范围试用**

## 1. 执行摘要

本轮没有重复改造上一阶段的可信附件与跨盘符架构，而是完成了未收尾的 Event 增长治理核验、当前 HEAD 全量测试、五包类型检查、Desktop/installer 重建和最终证据归档。

已解决：

- 流式 `message.part.updated.1` 在 SQLite 中按 300ms 窗口合并，UI 仍逐增量通知；
- 流结束、非节流事件、Abort/错误收尾和服务 finalizer 会强制落盘最后快照；
- Session 轮次稳定后异步 tombstone 化同一 Part 被覆盖的中间完整快照；
- 10,000 字基准复测达到事件行数 -95.1%、持久化字节 -95.0%，最终与重放正文哈希一致；
- 当前 HEAD 的五包 typecheck、Desktop build、sidecar runtime gate、Windows installer build 均通过；
- 可信附件、Event/Tool、数据库维护与历史业务结果定向测试 68/68 通过。

仍未解决或未确认：

- 当前最终安装包未签名；
- 已有 60 项 GUI 证据对应较早的 `1f4a242a65` 二进制，不是本轮 `64d9d1ef06` 重建制品；
- 新制品的真实 U 盘、企业 SMB UNC、Provider 错误 UI、PDF、多文件审核、DOCX 重新导出、Word/WPS 全链路未确认，需要人工验证；
- OpenCode 与 Core 全量测试仍有上游期望/Windows 语义基线失败，未伪装为全绿；
- 冷依赖环境构建与真实远端 `/sync` 兼容未确认；
- 唯一真实 7.27GB 数据库未清理，本轮也未获得清理授权。

因此本报告不建议正式发布，建议仅面向研发与指定业务用户小范围试用。

## 2. 优化前问题清单

| 问题 | 状态 | 当前结论 |
| --- | --- | --- |
| 状态文件 OOM | 已解决 | 启动前修复、备份、深度剥离 Base64、History/Workspace/Draft 字节预算已落地 |
| Prompt History 膨胀 | 已解决 | 嵌套 JSON 与 prompt part 均走 `sanitizePersistedValue`，超预算从旧条目裁剪 |
| Workspace/Draft 膨胀 | 已解决 | 分片阈值、草稿保留期、总字节预算与孤儿草稿清理已落地 |
| 重复 Session / 连续 Enter | 已解决 | renderer submit guard 覆盖创建 Session 与提交 prompt 全阶段，失败可释放 |
| Office 附件 Base64 | 已解决 | 本地 Office 附件改为可信凭据 URL，历史持久化剥离大 data URL |
| 跨盘符附件 | 已解决 | 不再以 `process.cwd()` 作为授权根，D 盘/USB 风格/UNC 必须先由原生选择器登记 |
| 任意 `file://` 读取 | 已解决 | 未登记路径、伪造凭据、设备路径、目录、过期/盗用/重复消费均拒绝 |
| Event 数据库持续膨胀 | 已解决（本地） | 300ms 写入合并 + settle 后压缩；远端同步兼容仍未确认 |
| Windows GUI 覆盖 | 部分解决 | 旧 RC3 制品已有 60 项证据；最终重建制品未重新做完整 GUI 验收 |
| 安装包可复现性 | 部分解决 | 当前 HEAD 可构建；仍复用本机 node_modules/Bun/Python runtime，不是冷环境 |
| 安装包签名 | 未解决 | 本地制品 `Authenticode=NotSigned`，正式工作流需 Azure Artifact Signing |

## 3. 根因分析

### 3.1 状态文件 OOM

Renderer 启动时会同步解析 Electron store。历史附件 Base64、嵌套 JSON、Prompt History 与 Draft/Workspace 无字节上限叠加后，单文件可能在 UI 初始化前耗尽 V8 内存。治理边界位于 `packages/desktop/src/main/store-repair.ts:37`、`:93`、`:135` 与 `packages/core/src/util/persisted-payload.ts:29`、`:68`，先备份再原子修复，并对整个嵌套持久化值深度清洗。

### 3.2 SQLite Event 膨胀

根因不是 Office Base64，而是流式输出每个 delta 都写一份不断变大的完整 Part 快照。真实库副本中 `message.part.updated.1` 为 205,022 条、约 6,423.8MB，同一 Part 可有数百份中间快照。统一治理边界在 `packages/core/src/event.ts:209`；合并判断与入队在 `:493`，落盘 flush 在 `:431`/`:458`。

### 3.3 Provider 失败

Provider 网络、凭据、限额与协议错误和本地持久化增长是不同问题。Event 合并会在非节流错误/边界事件前 flush，但不能消除 Provider 自身失败。最终安装版 Provider 错误 UI 未在本轮自然触发，仍需人工验证。

### 3.4 Renderer 提交阻断与重复提交

旧交互允许双击/连续 Enter 在 Session 创建期间重复进入提交路径。`packages/app/src/components/prompt-input/submit-guard.ts:1` 定义 `idle → creating_session → submitting_prompt` 状态机，`submit.ts:633` 通过 `tryBegin()` 互斥，`:638` 在成功或失败后释放。

### 3.5 附件安全

旧链路让 Renderer 构造 `file://`，服务端依赖路径根判断，既可能越权读盘，又错误拒绝 D/U/UNC。新链路由原生选择器登记、生成 192-bit ID、绑定 WebContents，再由服务端消费并复核文件大小、mtime、realpath 与文件头。核心常量见 `packages/core/src/util/trusted-attachment.ts:48-56`，登记/消费见 `trusted-attachment-registry.ts:94`、`:147`。

## 4. 架构优化结果

### 附件链路

```text
旧：Renderer file:// → 服务端按 cwd 判断 → 直接读盘
新：原生选择器 → 主进程登记 → 192-bit attachmentId → WebContents/TTL 校验
   → 服务端消费 → stat/mtime/realpath/文件头复核 → 受控解析
```

### 聊天链路

```text
点击/Enter → submit guard → 创建或复用 Session → Provider
→ 内存/pubsub 逐增量更新 UI → 300ms 持久化合并 → 最终快照强制 flush
```

### 数据库链路

```text
Event 写入 → text/reasoning 快照合并 → Session settle 后聚合级压缩
→ 安全 CLI analyze/dry-run/backup/clean/checkpoint/vacuum
→ 备份、完整性检查与人工恢复边界
```

## 5. 代码修改

相对 `origin/dev`，功能基线共 323 个文件：新增 194、修改 129、删除 0；其中 103 个为 GUI/数据库验收证据文件。完整机器可复现清单：

```powershell
git diff --name-status origin/dev...64d9d1ef06
```

关键代码与测试如下；截图文件按 `docs/evidence/db-rehearsal-gui/` 与 `rc3-acceptance/` 目录整体归档，不逐张重复说明。

| 文件 | 类型 | 关键位置/作用 | 测试覆盖 |
| --- | --- | --- | --- |
| `packages/core/src/event.ts` | 修改 | `layerWith` `:209`；flush `:431/:458`；合并入队 `:493` | `packages/core/test/event-coalesce.test.ts` 8/8 |
| `packages/opencode/src/session/prompt.ts` | 修改 | settle 后调用压缩 `:1544` | aggregate compaction 5 项 |
| `packages/opencode/src/xiaoxue/event-db-maintenance.ts` | 新增 | 全库计划 `:107`；聚合计划 `:155`；Session 压缩 `:204`；批处理 `:266` | 清理/备份/dry-run/业务保留 12 项 |
| `packages/opencode/script/bench-event-coalesce.ts` | 新增 | 可复现 10k 流式增长基准 | 本轮脚本实跑 |
| `script/maintain-event-db.ts` | 新增 | analyze/dry-run/backup/clean/checkpoint/vacuum CLI | 7.27GB 副本演练 |
| `packages/core/src/util/trusted-attachment.ts` | 新增 | browser-safe 协议、错误码、24h TTL、30min retry、100MB、文件头 | attachment 集合 40/40 |
| `packages/core/src/util/trusted-attachment-registry.ts` | 新增 | 192-bit ID、原子存储、WebContents、消费与复核 | attachment 集合 40/40 |
| `packages/desktop/src/main/trusted-attachments.ts` | 新增 | 主进程登记入口 `:59` | desktop picker/contracts |
| `packages/opencode/src/xiaoxue/trusted-attachments.ts` | 新增 | 服务端凭据消费 `:51/:59` | 未授权路径与历史重授权 |
| `packages/core/src/util/persisted-payload.ts` | 新增 | Base64/嵌套 JSON 深度清洗 `:29/:68` | app/desktop 状态测试 |
| `packages/desktop/src/main/store-repair.ts` | 新增 | 启动前备份、修复、History 降级 `:37/:93/:135` | desktop OOM/幂等/备份测试 |
| `packages/app/src/components/prompt-input/submit-guard.ts` | 新增 | 提交阶段互斥 | 双击/连续 Enter/失败释放测试 |
| `packages/desktop/scripts/verify-sidecar-runtime.ts` | 新增 | Electron Node 导入与 `bun:sqlite` 产物门禁 | Desktop build 自动执行 |
| `packages/opencode/src/xiaoxue/sqlite.bun.ts` / `sqlite.node.ts` | 新增 | Bun/Node 双运行时 SQLite 隔离 | sidecar smoke gate |
| `docs/event-retention-policy.md` | 新增 | 保留、压缩、同步、版本与回滚策略 | 文档审计 |
| `docs/event-growth-benchmark.md` | 新增/更新 | 10k 当前 HEAD 数字 | 脚本实跑 |
| `docs/db-rehearsal-gui-acceptance.md` | 新增 | 121MB 副本 GUI 验收 | 43 张截图 |
| `docs/windows-rc3-gui-acceptance.md` | 新增/更新 | Windows 人工证据与最终制品边界 | 60 个证据文件 |
| `docs/release-0.8.0-rc.3.md` | 新增/更新 | 当前制品、哈希、签名与复现边界 | 构建/签名检查 |

## 6. Git 提交

`dev` 相对 `origin/dev` 的功能基线提交如下，当前均仅在本地，**未推送**；每个提交可单独 `git revert <commit>`，但数据库 tombstone 已剥离的中间正文只能通过备份恢复。本报告与三处证据修订以独立 docs 提交归档，不属于二进制源码输入；该提交哈希以最终交付消息中的当前 HEAD 为准。

1. `098c8bf8a9` fix(desktop): make windows packaging reproducible
2. `0370b1219b` fix(core): strip oversized attachment payloads and compact database
3. `59b457c1c6` feat(attachments): reference office documents by trusted local path
4. `47751061c3` feat(xiaoxue): persist knowledge and business runtime
5. `1a5373c579` feat(desktop): stabilize xiaoxue pet and windows integration
6. `9d042718f7` test: add xiaoxue regression and desktop contracts
7. `461b949611` fix(i18n): add missing xiaoxue locale keys
8. `36257e22bb` chore: ignore debug dumps, temporary downloads and third-party skills
9. `9853a659d5` fix(app): guard duplicate submissions and harden global store cleanup
10. `8a6f8ccd59` refactor(opencode): expose sqlite adapter wrap helper
11. `ea8531d2e1` feat(xiaoxue): add event database maintenance tooling
12. `fad88deb9c` fix(app): never submit stripped inline attachments silently
13. `544ca3e01f` fix(app): prompt to re-select stripped history attachments
14. `5cd6544080` fix(core): sanitize oversized payloads inside nested JSON store values
15. `5d268461eb` fix(attachments): register trusted local attachments
16. `6bfeedc0a6` fix(review): allow trusted attachments outside cwd
17. `0d43677f9f` test(attachments): cover cross-drive and token security
18. `3b298ff3ff` docs(test): record windows environment baseline
19. `3f2d6b7ac3` test(db): rehearse event database cleanup
20. `43df3366a9` fix(attachments): split browser-safe trusted attachment module
21. `1f4a242a65` fix(desktop): verify packaged executable name per channel
22. `17b04580fe` chore(release): build xiaoxue 0.8.0 rc3
23. `bd0fbe74a6` feat(core): coalesce streaming part snapshots at event persistence boundary
24. `3c03d2eb24` feat(opencode): compact superseded part snapshots when a session turn settles
25. `9a2086bcd2` test(opencode): add 10k-char streaming coalesce benchmark and growth report
26. `d92af73fb9` docs: add 121MB db-rehearsal copy GUI acceptance report with screenshots
27. `47937abbf5` docs(xiaoxue): RC3 Windows GUI acceptance evidence, retention sync/rollback policy, maintenance UI design
28. `64d9d1ef06` fix(opencode): use conditional xiaoxue sqlite import so desktop sidecar avoids bun:sqlite

## 7. 安全优化

| 项 | 结果 |
| --- | --- |
| `file://` 来源验证 | 手工构造与未登记路径拒绝；服务端只消费当前登记 |
| Token 生命周期 | 192-bit、默认 24h、消费后失败重试窗口 30min、应用退出清空；24h 仍偏长，列为 P2 |
| WebContents 绑定 | 其他窗口盗用测试通过；sidecar 无 caller id 路径由主进程登记表约束 |
| 跨盘符 | D 盘、USB 风格路径自动化通过；真实 U 盘仅旧 GUI 用 `subst U:` 代替 |
| UNC | 原生选择器 UNC 自动化通过；旧 GUI 用管理共享替代，真实企业 SMB 未确认 |
| 路径脱敏 | 错误码区分，不在维护统计输出正文；最终报告不公开用户真实路径正文 |
| 文件类型 | DOC/DOCX/XLS/XLSX/PDF 文件头明显不匹配时拒绝 |
| 大小限制 | 单文件 100MB；选择器还有总预算门禁 |
| Symlink/Junction | 登记固定 canonical target，消费时复核 realpath/size/mtime |
| Provider 凭据 | Core 全量注入测试专用 32-byte key；生产缺密钥时拒绝明文保存 |

## 8. 数据库优化

| 指标 | 数值 |
| --- | ---: |
| 原副本数据库 | 7,271.9MB |
| 原 event 表 | 206,776 行 / 6,589.3MB |
| `message.part.updated.1` | 205,022 行 / 6,423.8MB |
| clean 候选 | 201,856 行 / 6,416.9MB |
| 预计释放 | 约 6,367.7MB |
| clean + vacuum 后数据库 | 121.1MB（本轮现场文件 127,066,112 B） |
| 清理后 event | 206,776 行；不删除行 |
| tombstone | 201,856 行 |
| 当前副本 WAL | 700,432 B |
| `integrity_check` | `ok` |
| `foreign_key_check` | 无违例 |
| part/message/最新快照指纹 | clean 前、clean 后、vacuum 后一致 |

副本 GUI 验收见 `docs/db-rehearsal-gui-acceptance.md`。真实数据库没有执行 clean/vacuum。

## 9. Event 增长治理

当前 HEAD 复测命令：

```powershell
cd packages/opencode
bun script/bench-event-coalesce.ts
```

| 指标 | 修改前 | 修改后 | 变化 |
| --- | ---: | ---: | ---: |
| 窗口 | 关闭 | 300ms | — |
| publish / UI 实时增量 | 1000 | 1000（监听通知 1049，含 49 次 durable 确认） | 实时性保留 |
| event 行 | 1000 | 49 | -95.1% |
| `message.part.updated.1` | 1000 | 49 | -95.1% |
| event data 字节 | 5,160,400 | 257,332 | -95.0% |
| WAL | 4,161,232 B | 2,274,272 B | -45.3% |
| 首 Token | 5ms | 1ms | 无劣化 |
| 流总耗时 | 15,707ms | 15,521ms | 无劣化 |

最终正文、最终落盘正文与重启重放正文 SHA-256 均为
`45d56115636cbb80fde9473cc8d2dab74ae62507937b7fc897c82413dbfff0ee`。

Abort/Tool/顺序/定时 flush 由 `event-coalesce.test.ts` 8/8 与 `session-runner-tool-events.test.ts` 5/5 覆盖。同步默认关闭；真实远端兼容性未确认，需要人工验证。完整策略见 `docs/event-retention-policy.md`。

## 10. 自动化测试

### 10.1 当前 HEAD 全量

| 包 | passed | failed | skipped | todo | 说明 |
| --- | ---: | ---: | ---: | ---: | --- |
| desktop | 138 | 0 | 0 | 0 | 33 files |
| session-ui | 79 | 0 | 0 | 0 | 15 files |
| app | 743 | 0 | 0 | 0 | unit 713 + browser 30，125 files |
| core | 1101 | 17 | 12 | 0 | 1130 tests；为绕过 Bun watcher 卸载崩溃按文件分组汇总 |
| opencode | 3294 | 43 | 58 | 1 | 3396 tests，265 files，1194.45s；日志 `.db-rehearsal/final-validation-opencode.log` |

小雪业务相关定向失败：**0**。环境/定制基线失败：Core 17、OpenCode 43。

### 10.2 Core 17 个失败

- 本地化 Provider Header 期望 16 项：Kilo 3、LLMGateway 1、Nvidia 3、Opencode 5、OpenRouter 1、Vercel 1、Zenmux 2。测试期望 `https://opencode.ai/`/`opencode`，定制运行时返回 `http://localhost/`/`录井小雪`。
- Windows `cross-spawn` 1 项：`captures stdout via .all when no stderr`，PowerShell `echo` 返回带引号文本。
- 未把 `watcher.node` 原生段错误计为测试失败；设置 `CI=1` 后该文件 6 项按设计 skip，避免 Bun 1.3.14 进程退出崩溃掩盖其余文件统计。

### 10.3 OpenCode 43 个失败（完整名称与分类）

定制产品与上游期望差异（16）：

1. `console account display > uses console.opencode.ai as the default login URL`
2. `creates global jsonc config with schema when no global configs exist`
3. `installation > latest > reads release version from GitHub releases`
4. `installation > latest > strips v prefix from GitHub release tag`
5. `installation > latest > reads scoop manifest versions`
6. `installation > latest > reads chocolatey feed versions`
7. `installation > latest > reads brew formulae API versions`
8. `installation > upgrade > returns sanitized typed errors when the curl install script fails`
9. `installation > upgrade > falls back to sh when bash is unavailable during curl upgrade`
10. `hosted nvidia provider adds billing origin header`
11. `custom nvidia baseURL adds billing origin header`
12. `HttpApi Server.listen > default in-process handler does not emit Effect HTTP response logs`
13. `HttpApi UI fallback > serves the web UI through the HTTP API app`
14. `HttpApi UI fallback > strips upstream transfer encoding headers from proxied assets`
15. `session.retry.retryable > maps Go subscription limits to workspace PAYG upsell`
16. `opencode CLI help-text snapshots > every documented command emits stable help text`

Windows 路径、symlink 与权限语义（20）：

1. `symlink handling`
2. `nested symlinks`
3. `tool.assertExternalDirectory > normalizes Windows path variants to one glob`
4. `tool.read external_directory permission > normalizes read permission paths on Windows`
5. `tool.shell permissions > asks for external_directory permission for wildcard external paths [bash]`
6. `tool.shell permissions > asks for external_directory permission for wildcard external paths [powershell]`
7. `tool.shell permissions > asks for external_directory permission for wildcard external paths [cmd]`
8. `tool.shell permissions > asks for external_directory permission for PowerShell paths after switches [powershell]`
9. `tool.shell permissions > asks for nested PowerShell command permissions [powershell]`
10. `tool.shell permissions > asks for external_directory permission for missing PowerShell env paths [powershell]`
11. `tool.shell permissions > asks for external_directory permission for PowerShell env paths [powershell]`
12. `tool.shell permissions > asks for external_directory permission for PowerShell FileSystem paths [powershell]`
13. `tool.shell permissions > asks for external_directory permission for braced PowerShell env paths [powershell]`
14. `tool.shell permissions > treats Set-Location like cd for permissions [powershell]`
15. `tool.shell permissions > asks for external_directory permission for cmd file commands [cmd]`
16. `filesystem > resolve() > resolves symlinked directory to canonical path`
17. `filesystem > resolve() > throws ELOOP on symlink cycle`
18. `Glob > scan() > does not follow symlinks by default`
19. `Glob > scan() > follows symlinks when symlink option is true`
20. `resolveZedDbPath skips candidates that cannot be stated`

CLI 子进程输出（7）：`opencode run (non-interactive subprocess)` 下的成功正文、tool continuation、`--thinking`、unknown finish、JSON、JSON tool ordering、JSON partial output七项。

### 10.4 任务相关定向回归

- Core：53/53（Event coalescing 8、Tool event 5、可信附件 40）；
- OpenCode：15/15（聚合压缩、备份强制、批处理、dry-run、业务结果保留、历史结果）；
- 合计：68/68，0 fail。

## 11. Typecheck 和构建

| 项目 | 命令/证据 | 结果 |
| --- | --- | --- |
| core | `packages/core: bun typecheck` | 通过 |
| session-ui | `packages/session-ui: bun typecheck` | 通过 |
| opencode | `packages/opencode: bun typecheck` | 通过 |
| app | `packages/app: bun typecheck` | 通过 |
| desktop | `packages/desktop: bun typecheck` | 通过 |
| Desktop build | `packages/desktop: bun run build` | 通过 |
| Sidecar runtime | `verify-sidecar-runtime.ts` | 通过；emitted Node chunk `bun:sqlite` 0 命中 |
| Installer | prod env + `bun run package:win` | 通过；日志 `.db-rehearsal/final-installer-build.log` |
| 资源完整性 | 打包后 verifier | 433 integrity entries |
| Python | `python:verify` | Python 3.14.4，9 dependencies |
| PDF Worker/WASM | renderer 构建产物 | 已编入；最终安装版功能未单独人工复测 |
| Office | packaged verifier | Word DOC/DOCX pipeline 通过 |
| 2D 桌宠 | desktop build + 138 tests | 编入并通过自动化；旧包 GUI 基础交互已验收 |

## 12. Windows GUI 人工验收

人工报告：`docs/windows-rc3-gui-acceptance.md`；证据：`rc3-acceptance/`。

| 范围 | 状态 | 边界 |
| --- | --- | --- |
| 安装/覆盖升级/卸载/重装 | 通过（旧包） | 对象 SHA `B2BB…B14681` |
| 主窗口聊天/双击 Enter | 通过（旧包） | Provider 错误 UI 未自然触发 |
| DOC/DOCX/XLS/XLSX | 通过（旧包） | PDF、多文件未测试 |
| D/中文路径 | 通过（旧包） | — |
| U 盘 | 条件通过 | `subst U:` 替代，真实设备未测试 |
| UNC | 条件通过 | 管理共享替代，企业 SMB 未测试 |
| Word/WPS 重新导出 | 未确认 | GUI 无重新导出入口；Word 未安装 |
| 审核历史恢复 | 条件通过 | 数据在，但 global 隐式工作区 UI 不可达 |
| 桌宠展开/折叠/托盘恢复 | 通过（旧包） | 输入任务/错误状态未完整人工覆盖 |
| 125%/150% DPI | 通过（旧包） | — |
| 121MB 清理副本 | 条件通过 | 历史/附件/审核/Tombstone/续聊通过，Provider 错误与重新导出受限 |
| 当前最终包 `D793…1A894F` | **未测试** | 未确认，需要人工验证 |

## 13. 安装包信息

| 项 | 值 |
| --- | --- |
| 文件名 | `录井小雪-0.8.0-rc.3-win-x64.exe` |
| 路径 | `packages/desktop/dist/xiaoxue-output/录井小雪-0.8.0-rc.3-win-x64.exe` |
| 发布标签版本 | 0.8.0-rc.3 |
| Windows VersionInfo / 内核包版本 | 1.18.6 |
| 二进制源码 commit | `64d9d1ef0693146f30a4c031ebbee3dd93f471ad` |
| 构建时间 | 2026-08-10 01:03 +08:00 |
| 文件大小 | 334,343,313 B（318.85 MiB） |
| SHA-256 | `D7932C670646047543023A65A5045A0175526D6207561EBDBE2438AF771A894F` |
| 签名 | `NotSigned`；证书主题为空 |
| 工作树 | 无已跟踪改动；有无关未跟踪 `design-qa.md` |
| Git 可复现性 | 源码 commit 明确；依赖复用本机现有锁定树，不是独立冷启动构建 |
| GUI 验收 | 当前制品未确认，需要人工验证 |

## 14. 回滚与恢复

- 状态文件：修复前生成不覆盖的 `.bak`；停止应用后恢复原文件。
- 数据库：真实库 clean 前强制 `.bak-*`；tombstone 中间正文不可逆，只能从备份恢复。
- Git：功能按第 6 节提交顺序 `git revert`；不要用破坏性 reset。
- 安装包：保留已验收旧包哈希与新包哈希，通过卸载/重装或企业更新通道回滚。
- 数据迁移：恢复备份数据库并回滚对应 migration/maintenance 调用；先跑 integrity/foreign key。
- Token：回滚可信附件提交会恢复旧 `file://` 行为，安全风险高，不建议在生产回滚；优先修复凭据路径。
- Event 合并：设置 `XIAOXUE_EVENT_COALESCE=off` 可立即退回逐快照落盘；已压缩正文只能从备份恢复。

## 15. 遗留问题

### P0

无已确认 P0。真实数据库未操作，未发现数据破坏或小雪业务定向回归。

### P1

| 问题 | 触发/影响 | 当前缓解 | 后续 |
| --- | --- | --- | --- |
| 当前最终安装包未做完整 GUI 验收 | 正式发版可能遗漏安装态回归 | 保留旧包 60 项证据；自动化/构建通过 | 按报告第 12 节对 `D793…` 重验 |
| 安装包未签名 | SmartScreen/企业终端拦截、发布者不可验证 | 仅内部小范围试用 | 受保护工作流 + Azure Artifact Signing |
| global 隐式工作区会话 UI 不可达 | 重启进入其他项目后找不到历史 | 数据层仍完整 | 给 UI 增加 global 会话入口/映射 |
| 审核记录按钮行为异常 | 无法从预期入口浏览记录 | 可从会话/数据库验证结果 | 修复 review-history 路由与工作区选择 |

### P2

| 问题 | 触发/影响 | 后续 |
| --- | --- | --- |
| DOCX 重新导出入口缺失 | 历史审核不能从 GUI 重导 | 暴露 `exportPersistedGeologyReview` UI |
| 可信附件 TTL 24h 偏长 | 凭据暴露窗口大于必要值 | 普通 TTL 缩到 30-60min，retry 独立 30min |
| Core/OpenCode 全量非全绿 | CI 噪声掩盖真实回归 | 更新 fork 期望并隔离 Windows 能力测试，不能删除测试 |
| 冷环境构建未证明 | 新机器可能缺缓存/后安装产物 | 企业 npm/GitHub 代理或离线 Bun 缓存复建 |
| 真实远端同步未验证 | tombstone 可能被旧接收端拒绝 | 启用前增加 tombstone schema/skip 语义与端到端同步测试 |
| 真实 U 盘/企业 UNC/PDF/多文件/Provider 错误 UI 未验 | 自动化不能代替现场能力 | 在业务 Windows 环境补证据 |
| 基准临时目录首次清理出现 Windows 占用警告 | 不影响指标，但留下临时文件 | 关闭 SQLite 句柄后重试清理并纳入脚本回归 |

## 16. 发布建议

最终选择：**建议小范围试用**。

依据：Event 长期增长根因已经治理，任务相关 68/68、五包 typecheck、Desktop build、sidecar gate 和 installer 均通过；附件安全、跨盘符与数据库副本结果可信。但最终安装包未签名、未对新哈希重新做 GUI 验收、全量测试基线仍有 60 个非业务失败，冷依赖构建与真实同步也未确认。

在完成 `D793…1A894F` 安装版复验、代码签名、关键 P1 修复与 fork 测试基线收敛前，不建议正式推广，也不建议自动清理用户唯一真实数据库。
