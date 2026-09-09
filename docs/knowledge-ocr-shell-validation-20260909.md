# Knowledge/OCR shell 验证收尾（2026-09-09）

**代码与本地自动化验证已通过，READY_FOR_REVIEW。PR 保持 Draft；用户复审、GUI/真实模型及安装包验收仍未替代。**

## 原因与修复

仅修改 `packages/opencode/test/tool/shell.test.ts`，不修改 shell 运行时或权限策略。

1. 原流式测试使用 `echo first && sleep 0.1 && echo second`。Windows PowerShell 5 不支持 `&&`，报错内容本身含 first/second，旧测试没有检查退出码，前两个正文断言会误通过。
2. 原路径测试假设 `/Users/...` 在所有 shell 下都指向 Windows 当前盘符根目录；Git Bash 实际按 MSYS 根目录解析，预期错误。

修复后，两类测试均使用已有 shell 矩阵明确覆盖 bash、pwsh、powershell、cmd。Git Bash 仅参与带盘符的 Windows 路径等价测试，已有独立 `/tmp` 用例继续验证 MSYS 语义；其他 shell 保留原生盘符根相对路径测试。

流式测试改用真实 Bun 子进程和确认文件：输出 first 后等待 metadata 回调确认，收到确认才输出 second。检查成功退出、中途仅含 first 的更新、最终完整正文及多次更新。10ms 是等待确认条件的轮询间隔，不是用固定延时猜测输出已到达；工具 10 秒超时约束错误情形。未 mock、跳过测试或放宽权限断言。

## 验证结果

全部命令从 `packages/opencode` 执行，Bun 1.3.14。

| 检查 | 结果 |
|---|---|
| 两类修复用例 × 4 shell | 8 pass / 0 fail，48 assertions |
| 默认 Windows PowerShell 环境完整套件 | 525 pass / 0 fail，28 文件，1395 assertions，107.96s |
| 显式 Git Bash 环境相同完整套件 | 525 pass / 0 fail，28 文件，1395 assertions，86.67s |
| `bun typecheck` | PASS |

完整测试命令：

```text
bun test test/tool test/agent/xiaoxue-router.test.ts test/agent/plan-mode-subagent-bypass.test.ts --timeout 30000
```

第二次显式设置进程级 `SHELL=C:/Program Files/Git/bin/bash.exe`，不修改系统环境。测试数从 519 增至 525，是两个原单例各扩展为四个 shell 用例。

本机日志：`%TEMP%/codex-knowledge-shell-fix-default-20260909.log`、`%TEMP%/codex-knowledge-shell-fix-bash-20260909.log`。

前一提交 `7c8e092380` 已修复三个审查问题并合入远端 dev；SDK 重生成幂等、四个相关包类型检查、桌面构建和 Electron sidecar 模块加载检查已通过，前次推送 hook 的 30 项类型检查也通过。本次仅测试和文档修改，无需重建相同产品源码。

主工作树 `E:/software programming/opencode-dev` 的语音、NEXT_VERSION 及其他私有修改继续保留；隔离工作树为 `E:/software programming/opencode-knowledge-review`。本轮不合入 dev，不构建安装包。应用内实际 OCR/导入、真实模型对话、干净机器离线安装生命周期与签名仍需单独验收。
