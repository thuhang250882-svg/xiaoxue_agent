# 录井小雪 0.8 RC5 发布就绪报告

## 1. 结论

RC5 已完成代码侧发布缺口修复、受影响包全量回归、本地 Windows 重建和隔离启动验证。当前建议仍为**条件通过，不得直接正式发布**：本地产物未做 Authenticode 签名，签名后的 RC5 也尚未完成最终人工 GUI、真实 Provider、真实 U 盘/企业 UNC、Word/WPS 和自动升级矩阵。

正式发布二进制必须由 `.github/workflows/xiaoxue-windows-enterprise.yml` 从源码提交 `89a9bbe0c8e13721bb37a62c277cf2e811a4732f` 构建。不得上传本报告记录的本地未签名安装包。

## 2. RC5 修复内容

- 审核历史改用 `/experimental/session` 全局会话接口，不再受首页当前目录限制；支持游标翻页，收集到 50 条有效审核记录或列表结束后停止。
- 审核历史继续保留查看结果、重新授权/审核、打开源文件、打开导出文件、重新导出 DOCX 和删除记录入口。
- 可信附件普通凭据默认 TTL 从 24 小时缩短为 60 分钟；消费后的失败重试窗口仍独立保持 30 分钟。
- 桌面产品版本递增为 `0.8.0-rc.5`，确保新修复不会误用旧 RC4 产物发布。

主要源码提交：

```text
89a9bbe0c8e13721bb37a62c277cf2e811a4732f fix(xiaoxue): close rc5 release gaps
```

## 3. 自动化验证

所有测试均从对应包目录运行：

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| App 审核历史定向 | `bun test --preload ./happydom.ts ./src/pages/review-history-model.test.ts` | 3 pass / 0 fail |
| App unit 全量 | `bun run test:unit` | 716 pass / 0 fail |
| App browser 全量 | `bun run test:browser` | 30 pass / 0 fail |
| Core 附件定向 | 两个 trusted attachment 生命周期测试文件 | 9 pass / 0 fail |
| Core 全量 | `bun test --only-failures --timeout 30000` | 1126 pass / 7 skip / 0 fail |
| App typecheck | `bun typecheck` | 通过 |
| Core typecheck | `bun typecheck` | 通过 |
| Desktop typecheck | `bun typecheck` | 通过 |

RC4 已记录的 OpenCode、Session UI 和 Desktop 全量基线未被本次页面模型、TTL 常量和产品版本变更触及；正式签名工作流仍必须执行 Desktop typecheck、打包策略测试、资源校验和签名校验。

## 4. 本地 Windows 构建证据

构建命令使用以下发布参数，签名仅在本地验证阶段显式关闭：

```text
OPENCODE_CHANNEL=prod
OPENCODE_VERSION=0.8.0-rc.5
XIAOXUE_PRODUCT_VERSION=0.8.0-rc.5
XIAOXUE_UPDATE_CHANNEL=internal
XIAOXUE_REQUIRE_SIGNING=false
```

`bun run package:win -- --x64 --publish never` 于 2026-08-10 完成，退出码 0，用时约 154 秒。打包过程验证了 Python 3.14.4、9 个 Python 依赖、Word DOC/DOCX 解析链、managed skills、资源完整性和 Electron sidecar 产物。

| 字段 | 值 |
| --- | --- |
| 本地安装包 | `packages/desktop/dist/xiaoxue-output/录井小雪-0.8.0-rc.5-win-x64.exe` |
| updater 文件 | `packages/desktop/dist/xiaoxue-output/xiaoxue-desktop-setup-0.8.0-rc.5.exe` |
| 大小 | 334,349,209 bytes |
| SHA-256 | `74A2C0CAB00B896DC42FDF0BA4BBD439BC20AB355B781EE9D97FDD9E2E208006` |
| FileVersion | `0.8.0-rc.5` |
| ProductVersion | `0.8.0-rc.5` |
| 二进制源码提交 | `89a9bbe0c8e13721bb37a62c277cf2e811a4732f` |
| Authenticode | `NotSigned` |

中文安装包与 updater 文件大小、SHA-256 一致，`internal.yml` 的版本、文件名、大小和 SHA-512 与 updater 文件一致。

## 5. 解包运行验证

使用 `OPENCODE_TEST_ONBOARDING=1` 在隔离临时用户目录启动 `win-unpacked/录井小雪.exe`，观察约 12 秒后关闭测试进程。日志位于：

```text
C:\Users\Administrator\AppData\Local\Temp\opencode-onboarding-450d6f03-da86-4f4d-bc7e-ff403ecb8ee5\desktop\logs\20260810T153940\main.log
```

确认结果：

- `version: '0.8.0-rc.5'`，`packaged: true`；
- updater channel 为 `internal`，允许预发布更新；
- sidecar 从 spawn 到 `server ready` 约 1.95 秒；
- 新日志中没有 `bun:sqlite`、`Received protocol`、heap OOM、`FATAL` 或 `Unhandled`；
- 更新检查因远端尚无已发布版本进入 `No published versions on GitHub`，属于当前发布源状态，不代表升级链路已验收。

该启动验证不是最终 GUI 人工验收，也没有调用真实 Provider。

## 6. 正式发布门禁

### P0：必须先完成

1. 将提交 `89a9bbe0c8e13721bb37a62c277cf2e811a4732f` 推送到受保护发布分支。
2. 在 GitHub `xiaoxue-production` Environment 配置 Azure OIDC、Trusted Signing 三项配置和 `XIAOXUE_EXPECTED_SIGNER`，并启用 Required reviewers。
3. 人工触发 `Xiaoxue Windows Enterprise`，版本填 `0.8.0-rc.5`，channel 选 `internal`，首次保持两个发布开关关闭。
4. 工作流必须通过 `XIAOXUE_REQUIRE_SIGNING=true` 构建，并由 `verify-windows-release.ps1` 验证所有 `.exe`、`.dll`、`.node`、`.pyd` 的签名主体和时间戳。
5. 下载并归档 `signature-report.json`、`SHA256SUMS.txt`、安装包、blockmap 和 `internal.yml`。任何签名无效、主体不符或文件哈希不一致都必须停止发布。

### P1：签名包人工验收

- 首次安装、RC4 覆盖升级、卸载与历史数据保留；
- 真实 Provider 正常流式回复、错误和重试；
- DOC、DOCX、XLS、XLSX、文本 PDF、多文件审核、审核历史跨项目恢复及 DOCX 重导；
- 真实 D/U 盘、真实企业 UNC 断线/重连、中文及特殊字符路径；
- Word/WPS 打开导出文件；
- 桌宠、托盘恢复、125%/150% DPI；
- 发布 RC5 internal 元数据后验证自动更新下载、签名校验与安装。

### 发布动作

人工矩阵全部通过后，再次审批工作流并选择 `publish_internal=true`。工作流会先复制版本化二进制和 blockmap，最后复制通道 YML。稳定渠道不得直接使用 RC5；若 RC5 试运行通过，应另行生成无预发布后缀的 `0.8.0` 签名构建，并对该最终版本重复签名校验和最小升级回归。

## 7. 未处理事项

- 本机不具备 Azure Trusted Signing 权限，无法代替受控工作流完成 P0。
- 真实 U 盘、企业 UNC、Word/WPS、真实 Provider 和最终升级需要目标环境人工操作，当前未确认。
- 未经用户确认，没有清理唯一真实数据库，也没有删除任何数据库备份。
- 根目录 `design-qa.md` 仍为用户既有未跟踪文件，本轮未修改、未提交。

