# Knowledge/OCR 修复与合并验证（2026-09-08）

状态：**R1/R2/R3 已修复并通过定向回归；冲突已解决；全量 Gate 尚未全绿，保持 Draft，不构建安装包。**

## 代码与工作树

- 工作树：`E:/software programming/opencode-knowledge-review`。
- 分支：`knowledge-ocr-sync-20260908`；以 `da3e9991d9` 为原 HEAD，合入远端 dev `b9fd4cf6a7`。
- 主工作树 `opencode-dev` 保持 `da3e9991d9`，既有语音 9 文件、NEXT_VERSION 3 文件和其他未提交材料未修改。
- 对当前远端 dev 的差异不包含 preload、xiaoxue-pet 或 docs/product。

## 已修复

1. **R1 / Session 权限**：恢复继承父 Session 的全局 deny。Agent 默认权限不作为 Session 权限传入，不能用删除显式拒绝规则解决委派可用性问题。新增回归覆盖 task 允许、其余默认拒绝时，子代理 bash/edit 仍被拒绝。
2. **R2 / 零正文 OCR**：校验去除 pdfkit 页码标记后的正文。只有页码与空白的文件在写索引前失败，新增 CRLF、多页空标记用例；对已有记录提交空 OCR 也不会破坏旧副本。
3. **R3 / OCR 修订**：原 PDF 相同但 OCR 文本不同，update 生成新版本及独立 ID，归档旧 PDF/OCR，检索仅使用新版本。import 遇到不同 OCR 明确要求按 sourceId update，避免静默忽略；相同 PDF+OCR 重试保持幂等。

回归同时验证：原始 PDF 字节不变、旧 OCR 历史可读、修订后页码仍正确、旧内容不再命中、无效更新保留当前版本。

## 冲突及生成物

实际 7 个冲突文件，均已处理：

- knowledge-manage/search：保留 OCR、事务回滚、路径约束和索引降级；逐项确认远端 Node API 迁移已包含。
- knowledge_query：保留远端强制工具流程并补充两步 OCR。
- rc-release-profile：保留远端 rtl-aware-development，加入入库技能，平台 29 / RC 11。
- integrity：由当前工作树源码和目录重新生成，同时生成并纳入对应 skill-catalog。Python 哈希读取本机已有 `opencode-dev/packages/desktop/resources/python`，没有跨仓复制生成物，也未重新准备 Python。
- SDK 两文件：先用合并一侧可解析的 Git 版本启动生成器，再由最终 schema 完整重生成；未手工拼接生成代码。

`bun ./packages/sdk/js/script/build.ts` 成功执行两次；第二次生成相对已暂存结果无差异。相对远端 dev，SDK 只剩知识端点的 80 行新增（36 行 sdk、44 行 types），删除了原分支误提交的临时 openapi.json。未修改生成器脚本。

`packages/client` 的 `bun run generate` 成功，产物与远端 dev 无差异。

## 实测结果

| 检查 | 结果 |
|---|---|
| 知识管理、权限、路由聚焦测试 | 58 pass / 0 fail |
| opencode `bun typecheck` | PASS |
| client `bun typecheck` | PASS |
| sdk/js `bun typecheck` | PASS |
| app `bun typecheck` | PASS |
| opencode `bun script/build-node.ts` | PASS |
| desktop `bun x electron-vite build` | PASS，仅运行产物，无安装包 |
| desktop `bun scripts/verify-sidecar-runtime.ts` | PASS，Electron 加载最终桌面 sidecar chunk |
| 全套 tool + router + permissions，默认 PowerShell | 518 pass / 1 fail，共 519 项、28 文件 |
| 相同全套，显式 Git Bash | 518 pass / 1 fail，共 519 项、28 文件 |

完整测试命令（opencode 包内）：

```text
bun test test/tool test/agent/xiaoxue-router.test.ts test/agent/plan-mode-subagent-bypass.test.ts --timeout 30000
```

默认 PowerShell 下失败的是 `streams metadata updates progressively`：两段正文均收到，但更新次数为 1。该用例在显式 `SHELL=C:/Program Files/Git/bin/bash.exe` 时单独通过。

Git Bash 全套下失败的是 `normalizes external_directory workdir variants on Windows`；该用例在默认 PowerShell 单独通过。shell.ts、shell.test.ts、cross-spawn-spawner.ts 均与当前远端 dev 无差异。本轮确认了环境差异，但未用远端基线独立重跑，不能把它们宣称为已证明的上游缺陷，也不能用不同环境的单项通过拼成全套 PASS。未修改或跳过这两个测试。

隔离工作树的 Electron 安装未下载可执行文件；sidecar 验证显式设置 `ELECTRON_OVERRIDE_DIST_PATH` 使用本机既有、版本相同的 Electron 42.3.3。直接加载裸 Node 构建曾因外部 @lydell/node-pty 解析失败；实际 electron-vite 桌面 bundle 生成并加载后通过。此证据仅覆盖桌面 bundle 模块加载，未覆盖 GUI 实际操作。

原始本机日志（Temp 中，可能被系统清理）：

- `codex-knowledge-full-20260908.log`
- `codex-knowledge-full-bash-20260908.log`
- `codex-knowledge-sdk-20260908.log`
- `codex-knowledge-desktop-build-20260908.log`

本轮修改文件的 whitespace 检查通过。整份 PR diff 的 whitespace 警告来自原有 PDF 测试夹具 xref 固定宽度行，未删改其必要空格；合并全树还含远端 patch 文件的既有空白警告。

## 尚未通过的交付门槛

全套测试的 shell 环境一致性仍需处理；真实模型对话、Electron utilityProcess 内实际 OCR/导入、干净机器离线安装/升级/卸载及正式签名未在本轮验收。保留 Draft，不合入 dev，不生成客户安装包。
