# 录井小雪办公网能力矩阵

版本：0.9.0-next.4

Foundation 的准入定义是：安装后断网、使用空临时用户目录、关闭用户 Python 包、PATH 不含全局开发工具且没有预热缓存时，可以直接完成最小真实业务任务。源文件或 `SKILL.md` 存在不构成通过证据。

| 能力 | Skill / 组件 | 运行时 | 安装包资源与入口 | 外部依赖 | 最小探针 | 断网隔离测试 | 临时干净用户测试 | 结论 |
|---|---|---|---|---|---|---|---|---|
| PDF 基础处理与扫描 PDF OCR | `pdfkit-py` | 安装包 Python 3.14，`PYTHONNOUSERSITE=1` | `resources/python/python.exe` + `resources/skills/pdfkit-py/scripts/pdfkit.py` + RapidOCR 模型 | 无 | 创建一页 PDF；用 CLI 重新读取并确认页数；运行 PDF 文本与扫描页 OCR smoke | PASS | PASS | FOUNDATION |
| Skill 治理静态验证 | `skill-governance` | 安装包 Python 3.14，纯标准库内核 | `resources/skills/skill-governance/vendor/mcp_criticagent/src` | 无 | 对打包 Skill 目录运行 `validate_skill_dir` 并确认 valid | PASS | PASS | FOUNDATION |
| Word 核心创建与导出 | `office_document` / `document_engine` | 打包 JavaScript sidecar | `app.asar` 内 Tool 与 document_engine | 无 | 生成 DOCX，回读 ZIP 文件头并验证正文测试 | PASS（自动化测试） | 安装包启动验证后复核 | CORE RUNTIME |
| 通用文件转 Markdown | `markitdown-skill` | 未打包 | 无 | MarkItDown 及格式插件 | 不执行；路由返回明确不可用 | N/A | N/A | UNAVAILABLE |
| 图片 OCR | `markitdown-skill` | 未打包 | 无 | OCR 后端与模型 | 不执行；路由返回明确不可用 | N/A | N/A | UNAVAILABLE |
| 音频转写 | `markitdown-skill` | 未打包 | 无 | 转写模型及音频程序 | 不执行；路由返回明确不可用 | N/A | N/A | UNAVAILABLE |
| OpenXML .NET CLI | `minimax-docx` | 未打包 | 无 | .NET 与包还原闭包 | 不执行；Word 请求改走 `office_document` | N/A | N/A | UNAVAILABLE |

## 自动 Gate

- `offline-skill-policy.ts` 扫描办公网实际发布的全部 Skill，报告 Skill、文件、行号和规则；显式 allowlist 仅允许纯测试夹具。
- `office-network-runtime.ts` 使用空 HOME、APPDATA、Python 缓存和 NuGet 目录，清空 PYTHONPATH，仅保留安装包 Python 与 Windows System32，并把外网代理指向不可达本地端口。
- `verify-packaged-windows.ts` 对最终 `win-unpacked` 再执行资源完整性检查、不可用 Skill 缺席检查和 Foundation 最小任务。
