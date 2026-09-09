# PR #4 Knowledge/OCR trust boundary closure

日期：2026-09-09。整改基线：`0949fabedc9e53c6abb8e4b65c606d4ecb996049`。
工作树：`E:/software programming/opencode-knowledge-review`。

## P0

本次限定范围内未发现 P0 阻断。PR #4 保持 Draft；不合并 dev，不构建 installer。
相对上述整改基线，shell runtime、shell.test.ts、权限策略、OCR Python 算法、PDF parser、模型架构均无修改。
原工作树的语音、preload、pet 和 NEXT_VERSION 文件继续保留。

## P1：原始路径与 OCR artifact

- `paths` 只接受最后一条用户消息中的完整绝对路径，检查路径两端分隔符与引号闭合；`report.txt.bak`、带引号的 `report.txt backup` 均不能授权 `report.txt`。带空格路径建议使用引号。
- 首次 `prepare` 签发随机 UUID `source_refs`，保存会话、canonical realpath、内容 SHA256 和固定 10 分钟有效期。附件保存为受控源快照；引用解析时重新核对路径和内容。
- `knowledge_manage ocr(source_refs)` 由后端直接调用配置的内置 Python 和既有 pdfkit CLI。模型不能传入命令、输出路径或待登记的 OCR 文本；没有任意文件注册入口。
- OCR 输入快照和输出只写入 `Global.Path.data/ocr-staging/<sessionID>/`，输出为随机 `<token>.txt`。逐层 canonical realpath 检查 staging 和 session 目录，读取前后核对文件 realpath、类型、大小与 SHA256；拒绝 symlink/junction 越界。
- 只有成功的受控 OCR 调用才能登记并返回 opaque `ocr_artifact_id`。artifact 绑定当前会话和原始 PDF SHA256，最多 10 分钟有效，且不超过原引用有效期。
- 消费时在任何异步 I/O 之前删除 token，防止并发/重复消费；错误会话或错误原文件不能消费该 token。原始 PDF 与经验证的 OCR 文本随后走现有事务入库逻辑。
- `ocr_text_path` 字段仅保留用于明确返回迁移错误；所有自由路径均拒绝，包括 staging 内的手写路径。内部入库函数接收已验证文本，不再自行读取 OCR 路径。

权限记录只存在于本进程，不从磁盘文件或会话历史恢复。进程重启、过期、源内容变化后必须重新授权；已消费或失败的 artifact 需重新 OCR。TTL 限制授权有效期，不承诺文件自动销毁：成功消费会删除输出，源附件快照和未消费的过期输出可能留在 staging，但不能凭文件本身获得授权。本轮未加入后台清理任务。

## P2：跨轮授权

工具说明、知识 Agent 提示词和入库 Skill 均要求在询问分类前先 `prepare`，保存返回的 `source_refs`。没有 category 的 `import` 也会返回 prepare 结果，避免先丢弃路径再询问。

自动化实测：用户首次提供路径 → 工具签发引用 → 分类澄清 → 最后一条消息仅为 `standard` → 使用引用 import → 搜索命中。测试故意不提供旧消息，证明不依赖整个 session 历史扫描；同一阶段直接重新传旧 paths 会被拒绝。

## 验证

命令均从 `packages/opencode` 执行。真实 OCR 测试使用现有内置 Python，动态生成只有图像的扫描 PDF，经实际 pdfkit、OCR、artifact 消费、入库、检索和重放拒绝，无 OCR mock。

| 项目               | 结果                                                               |
| ------------------ | ------------------------------------------------------------------ |
| focused tests      | 99 pass / 0 fail，6 文件，369 assertions                           |
| PowerShell suite   | 534 pass / 0 fail，29 文件，1428 assertions，16 snapshots，108.16s |
| Git Bash suite     | 534 pass / 0 fail，29 文件，1428 assertions，16 snapshots，91.37s  |
| opencode typecheck | `bun typecheck` PASS，0 error                                      |

完整套件保留原 525 个用例，新增 9 个信任边界用例，故总数为 534；shell.test.ts 无改动。Windows 无文件 symlink 创建权限，因此该平台用实际目录 junction 验证 artifact 路径及 session 目录两种越界；POSIX 同一用例使用文件 symlink。最终证据运行已配置内置 Python，新增 OCR 集成用例实际执行，没有跳过。

```text
bun test test/tool/knowledge-trust.test.ts test/tool/knowledge-manage.test.ts test/tool/knowledge-system-e2e.test.ts test/tool/knowledge-retrieval-eval.test.ts test/agent/xiaoxue-router.test.ts test/agent/plan-mode-subagent-bypass.test.ts --timeout 30000
bun test test/tool test/agent/xiaoxue-router.test.ts test/agent/plan-mode-subagent-bypass.test.ts --timeout 30000
bun typecheck
```

第一遍完整套件继承 `SHELL=C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe`；第二遍仅在子进程环境设置 `SHELL=C:/Program Files/Git/bin/bash.exe`。两遍完整套件串行执行。
测试环境同时设置 `XIAOXUE_PYTHON=E:/software programming/opencode-dev/packages/desktop/resources/python/python.exe`、`XIAOXUE_BUNDLED_SKILLS_DIR=E:/software programming/opencode-knowledge-review/.opencode/skills`，不修改系统环境。

本机日志：`%TEMP%/knowledge-trust-focused.log`、`knowledge-trust-powershell.log`、`knowledge-trust-bash.log`、`knowledge-trust-typecheck.log`。
资源完整性清单通过本仓 `generate-resource-integrity.ts` 生成，仅两项 Skill 文档 hash 变化；未改变公开 Protocol/HttpApi，无 SDK/client 生成改动。

## PR HEAD 与验收

提交后的 PR HEAD 以本分支包含此文档的整改提交为准，交付消息另列经远端核验的完整 SHA，避免在提交内自引用哈希。
GUI/真实模型对话和应用中 Python 运行环境尚需人工验收；自动化 OCR 成功不替代 GUI 结果。

结论：READY_FOR_GUI_ACCEPTANCE。
