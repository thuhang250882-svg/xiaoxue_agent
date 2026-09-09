# Knowledge/OCR GUI 验收进度（2026-09-09）

代码 HEAD：`677defd66865fcf30441d5ee739806dcf423c5d5`。
本记录为本地验收进度，不改变 PR 的代码结论；PR #4 继续 Draft，不合并 dev，不构建 installer。

## 已验证

- 从该 HEAD 重新执行 `packages/opencode` 的 `bun script/build-node.ts`，成功。
- 从 `packages/desktop` 执行 `bunx --no-install electron-vite build`，成功；仅本地调试输出，没有安装包。
- 使用 Electron 42.3.3 启动本工作树桌面应用，`packaged: false`，`desktopTestProfile: true`。
- 独立 profile：`%TEMP%/knowledge-gui-677defd668`，不复用原知识库、会话数据库或桌面配置。
- 调试资源目录的 Python junction 指向本机既有 `opencode-dev/packages/desktop/resources/python`，未复制生成代码或修改 Python/OCR 算法。
- 2026-09-09 15:28:19 本机日志出现 `server ready`，内置 Python 路径已识别。
- Computer Use 已取得“录井小雪”窗口，实际观察到新建会话页面，并打开“选择模型”弹窗。

## 当前阻断

独立 profile 未配置模型，“选择模型”弹窗为空；没有进行真实模型请求、路径确认对话或 GUI OCR 入库，不能标记 GUI PASS。

只读检查原配置的非敏感元数据：旧默认引用为 `xiaomi-token-plan-cn/mimo-v2.5-pro`；统一模型注册表实际启用的模型是 `xiaoxue2/MiniMax-M3`，对应认证条目存在。不回显密钥，也未将原配置或认证复制到测试 profile。

已向用户询问使用现有 MiniMax-M3，还是手动配置其他模型。此处是验收模型选择，不是要求重新审批已完成的代码整改。

## 待执行

1. 在独立 profile 确定模型，使用合成资料测试，避免真实业务数据外发。
2. 用户完整路径 → prepare/source_refs → 分类澄清 → standard → import → 搜索引用。
3. 扫描 PDF → 受控 ocr → artifact → import → 搜索原 PDF 页码。
4. 记录实际工具调用与界面结果，区分自动化断言和 GUI 验收。

合成文本已准备在 `%TEMP%/knowledge-gui-677defd668/fixtures/trust-standard.txt`，含唯一标记 TRUST677。
日志：`%TEMP%/knowledge-gui-sidecar-build.log`、`knowledge-gui-desktop-build.log`、`knowledge-gui-stdout.log`、`knowledge-gui-stderr.log`。
本地开发启动另有 tray icon 缺失与 Vite browser externalization 警告；未在本轮扩大范围修改。

## 既有自动化证据

上一轮已验证 focused 99/99、PowerShell 534/534、Git Bash 534/534、opencode typecheck PASS；本轮没有修改产品源码，也没有把上述测试重新表述为 GUI PASS。

当前 GUI 验收结论：CHANGES_REQUIRED（待确定验收模型并完成实际对话流程）。
