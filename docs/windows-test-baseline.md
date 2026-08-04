# Windows 测试环境基线（录井小雪 0.8 RC3）

记录日期：2026-07-09
适用机器：Windows 25H2 开发机（仓库位于 E: 盘，系统临时目录位于 C: 盘）
用途：区分"环境性失败"与"业务回归"。本文列出的失败允许在本地/CI Windows 环境中存在，
**任何不在本清单中的失败都必须视为业务回归处理，禁止直接加入允许列表。**

## 运行前置条件

- core 包测试必须注入临时密钥，否则 7 个凭据加密测试失败：

  ```powershell
  $env:XIAOXUE_CREDENTIAL_ENCRYPTION_KEY = [Convert]::ToBase64String([byte[]](1..32 | ForEach-Object { Get-Random -Maximum 256 }))
  ```

- 测试必须从包目录运行（如 `packages/opencode`），禁止从仓库根目录运行。
- 类型检查使用 `bun typecheck`，禁止直接运行 `tsc`。

## 业务包基线（必须全绿）

| 包 | 通过 | 失败 | 说明 |
| --- | --- | --- | --- |
| app | 713 | 0 | 含提交防抖、持久化裁剪、i18n parity |
| desktop | 138 | 0 | 含托盘、store 修复、打包契约 |
| session-ui | 79 | 0 | v2 prompt input 契约 |

## core 包环境性失败（17 项）

注入临时密钥后：1098 pass / 7 skip / 17 fail。全部为环境性，无业务回归。

| 分类 | 数量 | 原因 |
| --- | --- | --- |
| Provider Plugin 请求头断言 | 15 | 测试断言 `referer` 为 `https://opencode.ai/`；本机环境解析为 `http://localhost/`。上游测试对部署域名的假设在桌面本地环境不成立 |
| RepositoryCache 超时 | 1 | 5 秒窗口在本机磁盘负载下偶发超时 |
| cross-spawn 生成器 | 1 | Windows 进程生成路径差异 |

## opencode 包环境性失败

第二阶段实测基线（可信附件改造提交前，完整日志存于 `.db-rehearsal/opencode-test-full.log`）：
**3302 pass / 58 skip / 1 todo / 32 fail**，无一与小雪业务交叉（`test/xiaoxue/`、
`test/tool/xiaoxue-business-tools.test.ts`、`test/agent/xiaoxue-router.test.ts` 单独运行 94/94 全绿）。

注意：同一全量套件在高磁盘负载并发跑时曾测得 52 fail（多出部分均为超时型），
判定失败是否回归应以低负载单独运行的结果为准。

分类如下（共 32 项）：

| 分类 | 数量 | 典型用例 | 原因 |
| --- | --- | --- | --- |
| Windows symlink 权限 | 6 | `symlink handling`、`nested symlinks`、`filesystem resolve() ELOOP`、`Glob scan() follows symlinks` | 非开发者模式机器无 SeCreateSymbolicLinkPrivilege |
| 外部网络依赖 | 7 | `installation > latest/upgrade` 全部 7 例 | 测试依赖 GitHub release、scoop/chocolatey/brew API 等公网资源 |
| 超时（5s） | 4 | `revert + compact workflow` 两例、`snapshot state isolation`、`tool execution session diff (snapshot race)` | 重量级 fixture 在本机负载下超 5s |
| 上游快照/环境差异 | 15 | console 登录域名断言、全局 jsonc config、nvidia billing header、HttpApi 快照/UI fallback、CLI help-text snapshot、`opencode run --format json`、Zed db、external_directory 路径归一化、session.retry 映射 | 上游测试对部署域名、平台工具与环境的假设与本机不符 |

判定规则：

1. 失败用例不 import 任何 `xiaoxue`/`trusted-attachment`/`geology`/`business-task` 模块 → 环境性候选；
2. 必须能在干净 HEAD（无本地改动）上复现同样失败，才可记入本清单；
3. 小雪业务测试（`test/xiaoxue/`、`test/tool/xiaoxue-business-tools.test.ts`、`test/agent/xiaoxue-router.test.ts`）必须全绿，例外只有上表"超时"分类中明确列出的用例。

## 可信附件安全测试（第二阶段新增）

全部通过，无环境性豁免：

- core `test/trusted-attachment/`（11 文件 40 用例）：登记、一次性消费与受控重试、
  WebContents 绑定、过期、Windows 设备路径拒绝、目录拒绝、跨盘符、
  中文/特殊字符路径、UNC、符号链接目标校验、重新授权。
- opencode `test/xiaoxue/reject_untrusted_file_url.test.ts`：手工构造 file:// 与
  未登记路径一律拒绝；登记后的兼容模式与凭证读取成功。
- opencode `test/xiaoxue/historical_result_survives_missing_file.test.ts`：
  源文件丢失后审核结果与元数据存活；历史中不含一次性凭证。
