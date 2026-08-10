# 录井小雪 0.8 RC4 交付代码审核报告

日期：2026-08-10  
分支：`dev`  
二进制源码提交：`11c17c441a44cfbb306b6849ee68e9d10ec1f104`  
代码基线提交：`6e76b59cf2095b6bc28244319d84acbb5767483c`

## 1. 结论

本轮已完成建议中的 Event 增长治理、数据库维护安全、可信附件 TOCTOU 防护、状态文件 OOM 修复、Windows 发布流程和全量回归收敛。代码审核期间发现的数据库归档回收、零阈值扫描、CLI 输出顺序、运行时更新通道和 updater 资产名问题均已修复并回归。

发布建议：**条件通过**。

- 当前产物可作为内部验收和签名流水线输入交付；
- 当前本地安装包未签名，不应作为公司范围或外部正式发布件；
- 正式发布必须由 `xiaoxue-production` 环境运行 Windows 企业工作流，以 Azure OIDC 完成 Authenticode 签名并通过发布脚本的逐文件签名校验；
- RC4 已完成真实启动与 sidecar 日志复验，但未重新执行 RC3 的全部人工 GUI、真实 Provider、真实 U 盘/UNC、Word/WPS 和多 DPI 矩阵。

## 2. 最终代码审核

审核范围是 `17b04580fe` 之后的 RC3/RC4 收敛增量，覆盖 Core Event/数据库、OpenCode 会话与维护 CLI、Desktop 状态修复/附件/更新器、Windows 工作流、测试和发布文档。没有发现仍开放的代码级 P0 数据破坏或任意本地文件读取问题。

审核中发现并已修复：

| 发现 | 风险 | 修复与证据 |
| --- | --- | --- |
| 超大附件归档与工作库同库保存会阻止 `VACUUM` 真正释放空间 | P1 | 清理命令在已验证备份后清空工作库归档；备份仍保留原始 payload；回归验证工作库归档为空且备份归档可读 |
| 旧备份或无效 manifest 可能错误满足清理前置条件 | P1 | 备份改用 SQLite `VACUUM INTO`，记录源库指纹，校验目标 `quick_check`，清理时要求精确匹配 |
| Desktop 状态修复阈值为 0 时会产生 0 字节修复预算 | P1 | 将 0 仅解释为“强制扫描”，修复预算仍使用安全上限；Desktop 全量测试覆盖 |
| Session 文本与工具事件在 JSON 输出中可能乱序 | P1 | 工具开始前强制结束文本 Part；CLI subprocess 测试验证 `text -> tool -> continuation` |
| RC4 以 `internal` 构建，但运行时回落到 `latest` | P1 | 将构建更新通道注入 main bundle，作为无托管策略时的默认值；真实运行日志确认 `channel: 'internal'` |
| 作用域 npm 包名生成含 `/` 的 updater 资产名，手工发布后可能 404 | P1 | 打包元数据使用无作用域名，并生成与 YML URL 同名、同字节的 updater 安装包与 blockmap |
| 同尺寸且恢复 mtime 的附件替换可绕过二次校验 | P1 | Desktop 与服务端流式计算 SHA-256，消费时再次比对；篡改回归通过 |
| 深层 JSON 字符串内的 data URL 仍可能触发启动 OOM | P1 | 持久化状态清理器递归检查嵌套 JSON 字符串并按全局/单文件上限降级修复 |

代码质量检查：

- `git diff --check`：当前工作树通过；
- 最终 7 个 updater 修复文件的 oxlint：0 error；3 个 `consistent-return` warning 位于原有 Vite/构建配置控制流；
- 仓库根级 lint 仍会报告大量历史和 generated SDK warning，未伪装为全绿；
- 未删除业务测试，也未使用 `.only` 规避失败；最终五个包的测试均为 0 fail。

## 3. Event 增长治理

- `message.part.updated.1` 在统一持久化边界按 250ms 窗口合并；UI 的内存流式更新不受影响；
- 正常结束、Abort 和错误路径强制落盘最后有效快照；工具、用户消息、审核和知识类事件不进入文本合并；
- Session turn 稳定后压缩同一 Part 被取代的中间快照；单次跳过超过 10,000 个事件的异常大 Session，避免维护本身造成 OOM；
- SQL 分页在 `LIMIT` 前过滤 tombstone，tombstone 重放保留 sequence，但不再进入普通 projector 或 UI publish；
- durable committed 通知与实时通知分离，避免插件/UI 重复消费；
- 10,000 字基准记录在 [event-growth-benchmark.md](./event-growth-benchmark.md)：事件数和持久化字节均下降约 95%，最终正文与重启重放 SHA-256 一致；
- 正式保留、同步、版本和回滚边界记录在 [event-retention-policy.md](./event-retention-policy.md)。真实远端同步未确认。

## 4. 数据库与 OOM 安全

- 启动不再自动执行 `VACUUM`；只记录待维护状态；
- 备份不覆盖已有文件，使用数据库原生快照并生成 manifest；
- 清理分批事务执行，失败回滚；正式回收空间仍需显式 `checkpoint`/`vacuum`；
- 真实 7.27GB 唯一数据库未操作；副本从 7,271.9MB 缩减为 121.1MB，约 98.3%，`integrity_check=ok`，`foreign_key_check` 无异常；
- 副本 GUI 证据在 [db-rehearsal-gui-acceptance.md](./db-rehearsal-gui-acceptance.md) 和 `docs/evidence/db-rehearsal-gui/`；
- 在 RC4 完整业务抽样和同步风险确认前，不建议自动清理用户唯一真实数据库。

## 5. 可信附件与路径

- 附件只能从原生选择器登记，使用 192-bit 高熵 ID、WebContents 绑定、过期和消费状态；
- Renderer 不再提交任意 `file://`；服务端只消费可信凭据 URL；
- 登记与读取时校验规范路径、链接目标、大小、mtime 和 SHA-256；
- 支持 Windows 跨盘符、中文、空格、`#`、`%`、括号路径；自动化覆盖模拟 UNC；
- 真实企业 SMB/UNC 权限、断线和重连仍需在目标网络人工确认；
- 当前普通 Token 24h TTL 仍偏长，建议后续缩短到 30–60 分钟，失败重试窗口独立保留。

## 6. 全量自动化结果

所有测试均从对应包目录执行，最终结果如下：

| 包 | 命令 | 结果 |
| --- | --- | --- |
| Core | `CI=1 bun test --only-failures --timeout 30000` | 1121 pass / 12 skip / 0 fail |
| OpenCode | `CI=1 bun test --only-failures --timeout 30000` | 3331 pass / 65 skip / 1 todo / 0 fail |
| Desktop | `CI=1 bun test --only-failures --timeout 30000` | 141 pass / 0 fail |
| Session UI | 包内全量 | 79 pass / 0 fail |
| App unit | 包内全量 | 713 pass / 0 fail |
| App browser | 包内 browser 全量 | 30 pass / 0 fail |

OpenCode 首次使用默认 5 秒超时的全量运行出现 6 个 timeout 和 1 个错误；对应文件用 30 秒超时独立复跑为 143 pass / 6 skip / 0 fail，随后同一套 30 秒参数完成整包 3331 pass / 0 fail。最终结论以单次整包绿色运行作为基线。

五包 `bun typecheck` 均通过：

- `packages/core`
- `packages/session-ui`
- `packages/opencode`
- `packages/app`
- `packages/desktop`

## 7. Windows 构建与运行证据

构建环境变量：

```text
OPENCODE_CHANNEL=prod
OPENCODE_VERSION=0.8.0-rc.4
XIAOXUE_PRODUCT_VERSION=0.8.0-rc.4
XIAOXUE_UPDATE_CHANNEL=internal
XIAOXUE_REQUIRE_SIGNING=false
```

从提交 `11c17c441a44cfbb306b6849ee68e9d10ec1f104` 执行 `bun run package:win -- --x64 --publish never`，退出码 0，用时约 146 秒。构建门槛通过：

- Electron sidecar runtime smoke test；
- 433 个资源完整性条目；
- Word DOC/DOCX 解析链路；
- bundled/managed skills；
- Python 3.14.4 与 9 个依赖；
- Electron Node 产物未出现 `bun:sqlite` 协议错误。

真实解包程序启动日志：

`C:\Users\Administrator\AppData\Roaming\ai.opencode.desktop\logs\20260810T034341\main.log`

- `app starting { version: '0.8.0-rc.4', packaged: true }`；
- `channel: 'internal'`，`allowPrerelease: true`；
- sidecar 从 spawn 到 `server ready` 约 1.8 秒；
- 观察窗口内没有 `bun:sqlite`、heap OOM、FATAL 或 Unhandled；
- 当前远端尚无 RC4 internal Release，所以预发布检查进入 `error`；上传签名资产后需再做一次真实升级检查。

详细 RC3 人工 GUI 证据仍保存在 [windows-rc3-gui-acceptance.md](./windows-rc3-gui-acceptance.md) 和 `rc3-acceptance/`。这些证据不能替代 RC4 的完整人工矩阵。

## 8. 安装包信息

| 字段 | 值 |
| --- | --- |
| 中文交付文件 | `packages/desktop/dist/xiaoxue-output/录井小雪-0.8.0-rc.4-win-x64.exe` |
| Updater 文件 | `packages/desktop/dist/xiaoxue-output/xiaoxue-desktop-setup-0.8.0-rc.4.exe` |
| Blockmap | `packages/desktop/dist/xiaoxue-output/xiaoxue-desktop-setup-0.8.0-rc.4.exe.blockmap` |
| 文件大小 | 334,346,828 bytes |
| SHA-256 | `8C7C08E504E39ACCF0BB3425661690EA349A7F730A88B8FEE3BEC99ABA916FF7` |
| Updater SHA-512 | `2/Cl886BYjDQOberuHor67h4hmfOJp1xGMivMTsI4k1yr66cTRKNWDD4lYK3Behat22sV2TNg1QKfeVEg7jJdg==`，与 `internal.yml` 一致 |
| 产品 | 录井小雪 |
| FileVersion | `0.8.0-rc.4` |
| ProductVersion | `0.8.0.0` |
| 构建时间 | 2026-08-10 11:42:58 +08:00 |
| 二进制源码提交 | `11c17c441a44cfbb306b6849ee68e9d10ec1f104` |
| Authenticode | `NotSigned` |
| 冷环境复现 | 未确认；本次使用当前开发机已安装的锁定依赖树 |

中文文件与 updater 文件大小和 SHA-256 完全相同。`internal.yml` 指向的文件及 `.blockmap` 均真实存在。

## 9. Git 提交与状态

本轮关键提交：

- `11c17c441a` `fix(desktop): preserve enterprise update channel`
- `6e76b59cf2` `fix(opencode): harden rc4 delivery`
- `a6c115b7ad` `docs(xiaoxue): finalize rc3 optimization report`
- `64d9d1ef06` `fix(opencode): use conditional xiaoxue sqlite import so desktop sidecar avoids bun:sqlite`
- `47937abbf5` `docs(xiaoxue): RC3 Windows GUI acceptance evidence, retention sync/rollback policy, maintenance UI design`
- `d92af73fb9` `docs: add 121MB db-rehearsal copy GUI acceptance report with screenshots`
- `9a2086bcd2` `test(opencode): add 10k-char streaming coalesce benchmark and growth report`
- `3c03d2eb24` `feat(opencode): compact superseded part snapshots when a session turn settles`
- `bd0fbe74a6` `feat(core): coalesce streaming part snapshots at event persistence boundary`

未跟踪的 `design-qa.md` 是用户既有文件，本轮未修改、未删除、未纳入提交。

## 10. 当前风险分级与发布步骤

### P0：正式发布门槛

- 安装包未做 Authenticode 签名。必须在具备 Azure Trusted Signing 配置和预期证书主题的受控工作流中重建/签名；`script/verify-windows-release.ps1` 会校验所有 `.exe/.dll/.node/.pyd`，未签名时不得发布。

### P1：交付前人工验收

- 用签名后的 RC4 重跑安装、覆盖升级、卸载、真实 Provider 流式回复与错误、Office 全格式、真实 U 盘、真实企业 UNC、Word/WPS、桌宠/托盘、125%/150% DPI；
- 发布 RC4 internal Release 后验证自动更新下载、签名校验和安装；
- 在冷 Windows runner 上执行 `bun install --frozen-lockfile` 后重建，或建设企业依赖镜像；
- 真实远端 `/sync` 未确认；真实 7.27GB 数据库未清理。

### P2：后续优化

- 将普通附件凭据 TTL 从 24h 缩短到 30–60 分钟；
- 收敛仓库历史/generated lint warning；
- 决定是否提交或删除根目录未跟踪的 `design-qa.md`。

正式发布顺序：在 `11c17c441`（以及本报告提交）上运行企业 Windows workflow → Azure 签名 → `verify-windows-release.ps1` → 上传二进制后再上传 YML → 执行 RC4 人工 GUI/升级矩阵 → 归档截图、签名报告和 SHA256SUMS。上述 P0/P1 完成后，发布建议才可提升为“建议正式发布”。
