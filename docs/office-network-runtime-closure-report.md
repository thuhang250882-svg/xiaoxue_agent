# 录井小雪 0.9.0-next.4 办公网运行时整改闭环报告

审查基线：`6cb5ecd0cb..4b238d9c10` 反馈项  
整改源码：`c11466b0b75364f2874fa7ca8a56cad7b111847d`  
构建分支/工作树：`next4-release` / `E:\software programming\opencode-dev-next4-build`  
报告日期：2026-08-27

## 1. 三个 P1 原始问题

1. `markitdown-skill`：OCR、音频转写和文件转 Markdown 被确定性路由，但安装包没有 MarkItDown、OCR 后端、转写模型或 ffmpeg 运行时闭包。
2. `pdfkit-py`：办公网说明一方面禁止联网，另一方面仍包含 setup、pip、winget、apt、brew 和 CDN 等在线安装或下载指令。
3. `minimax-docx`：被列为 Foundation，却依赖全局 .NET、NuGet restore、PackageReference 和 `#r "nuget:..."`，安装包没有 self-contained CLI。

## 2. 真实根因

- 能力声明和确定性路由按“Skill 源文件存在”判定，没有以安装包内可执行运行时和最小真实任务为准入条件。
- Skill 文档混用了开发环境安装指南与办公网运行约束，模型仍可能被诱导修改环境或访问公网。
- 原发布 Gate 主要检查资源存在，未主动隔离用户 Python、全局 .NET、NuGet 缓存、用户目录和网络。

## 3. 最终策略

- MarkItDown / OCR / 音频转写：采用方案 B。本版本不提供 MarkItDown 能力，删除确定性路由；请求返回明确的“办公网版本未包含本地运行时”提示。
- `pdfkit-py`：采用方案 A。保留为 Foundation，但只允许 `XIAOXUE_PYTHON`，强制 `PYTHONNOUSERSITE=1`，缺失依赖直接返回稳定错误码，不进行安装或下载。
- `minimax-docx`：采用方案 B。从 Foundation 和确定性路由移除，Skill Center 标记 unavailable；Word 核心能力统一走现有 `office_document` / `document_engine`。

## 4. 修改文件和关键行号

- `packages/opencode/src/agent/xiaoxue-router.ts:5,78,126,150-151`：路由结果增加可用性；Word 改走 `office_document`；移除 MarkItDown 确定性路由并返回不可用原因。
- `packages/opencode/src/agent/agent.ts:345,489`：办公助手权限仅保留正式 `office_document` 路径，不再放行两个不可用 Skill。
- `configs/xiaoxue/rc-release-profile.json:19,39,57,64,69`：重分 Foundation、核心 PDF 路径、可选项和不可用项。
- `.opencode/skills/pdfkit-py/SKILL.md:49-61,70,130`：只允许安装包 Python，禁止修改环境和自动安装。
- `.opencode/skills/pdfkit-py/scripts/pdfkit.py:28-34,276`：校验解释器和用户 site 隔离，输出稳定缺依赖错误码。
- `.opencode/skills/markitdown-skill/SKILL.md:1-16`、`.opencode/skills/minimax-docx/SKILL.md:1-16`：改为办公网不可用说明。
- `packages/desktop/scripts/offline-skill-policy.ts:52-57,75-85,111-114`：静态政策、显式 allowlist 和精确违规位置输出。
- `packages/desktop/scripts/office-network-runtime.ts:23-49,76-94`：临时用户、Python/.NET/NuGet/网络隔离及真实 Foundation 探针。
- `packages/desktop/scripts/verify-packaged-windows.ts:49-51,141`：验证不可用 Skill 未入包，并在最终资源上执行 Foundation 探针。
- `packages/desktop/src/main/enterprise-policy.ts:29-30,50,72-73`：RC 默认离线且禁止公共 Provider。
- `packages/desktop/src/main/server.ts:235`、`sidecar-environment.ts:1-2`：离线 sidecar 设置 `OPENCODE_DISABLE_MODELS_FETCH=1`。
- `packages/desktop/package.json:4,25-27`：版本升级为 next.4，静态 Gate 与运行时 Gate 接入 Windows 预打包链。

## 5. 安装包新增和固化的运行时资源

- 安装包 Python 3.14.4 及 13 个锁定依赖。
- `pdfkit-py` CLI、PDF 文本/OCR 所需库与 RapidOCR 模型。
- `skill-governance` 校验内核。
- 打包 JavaScript sidecar 中的 `office_document` / `document_engine`。

未新增 MarkItDown、ffmpeg 或 .NET self-contained CLI；对应能力已明确移出发布声明。

## 6. 删除或修改的在线安装指令

- 删除 `pdfkit-py/scripts/setup.sh`、`setup.bat` 和 `requirements-optional.txt`。
- 删除/改写 pip install、winget、apt/apt-get、brew、curl、wget、Invoke-WebRequest、CDN 字体和自动建 venv 指引。
- `pdfkit-py` 缺运行时返回 `PDF_RUNTIME_MISSING`；缺可选依赖返回 `PDF_OPTIONAL_DEPENDENCY_MISSING`，禁止模型自行修复系统环境。
- 发布 Skill 静态扫描命中包管理器、在线还原或公共下载指令即失败；URL 例外必须逐文件逐行显式 allowlist。

## 7. rc-release-profile 调整

- 版本包 Skill 数量：10。
- `FOUNDATIONS` 只保留 `pdfkit-py`、`skill-governance`。
- `OFFICE_NETWORK_UNAVAILABLE` 新增 `markitdown-skill`、`minimax-docx`。
- Word 路由归一到 `office_document` / `document_engine`。
- `local_pdf_processing` 明确依赖 bundled Python 与 RapidOCR 模型。
- 不可用 Skill 在物化和最终包验证阶段均不得进入 `resources/skills`。

## 8. Foundation 最终清单

| Foundation | 运行时 | 入口 | 外部依赖 | 办公网结论 |
|---|---|---|---|---|
| `pdfkit-py` | 安装包 Python 3.14.4 | `resources/skills/pdfkit-py/scripts/pdfkit.py` | 无 | PASS |
| `skill-governance` | 安装包 Python 3.14.4 | `validate_skill_dir` | 无 | PASS |

Word 是核心打包运行时能力，不再通过重复的 `.NET minimax-docx` Foundation 声明。

## 9. Foundation 最小执行探针

- `pdfkit-py`：在临时目录创建单页 PDF，使用打包 CLI 重新打开并确认页数为 1；打包校验同时执行 PDF 文本提取和扫描页离线 OCR smoke。
- `skill-governance`：对打包 Skill 目录真实调用 `validate_skill_dir` 并确认有效。
- 最终 `win-unpacked` 校验结果：9491 个完整性条目、Word DOC/DOCX pipeline、PDF 文本与离线 OCR、Python 3.14.4/13 个依赖、两项 Foundation 均通过。

## 10. 无用户 Python 环境测试

`office-network-runtime.ts` 使用临时空 `USERPROFILE`、`APPDATA`、`LOCALAPPDATA` 和 pip cache；清空 `PYTHONPATH`，设置 `PYTHONNOUSERSITE=1`，以 `-s` 启动且只调用 `XIAOXUE_PYTHON`。结果：PASS，`userSiteIsolated=true`。

## 11. 无全局 .NET 测试

Foundation 探针重建最小 PATH，只保留 bundled Python 和 Windows System32，不包含 dotnet。结果：PASS，`globalDotnetUsed=false`。

## 12. 无 NuGet 测试

NuGet 目录指向新的临时空目录，Foundation 无 .NET/NuGet 路径。结果：PASS，`nugetUsed=false`。

## 13. 无公网测试

- Foundation 探针把 HTTP/HTTPS/ALL proxy 指向不可达本地端口；真实 PDF 与治理任务仍通过，`networkUsed=false`。
- RC 默认离线，公共更新检查被禁用，sidecar 禁止刷新 `models.dev`。
- 最终打包应用使用全新数据目录启动并达到 `server ready`；启动日志及 Chromium netlog 未出现 GitHub 或 `models.dev` 请求。netlog 中唯一公共 URL 是 Chromium netlog 文件格式自身携带的工具说明元数据，不是运行时请求。

## 14. 自动化结果

- Desktop 定向测试：初始整改 20/20；策略补充 6/6；sidecar/策略回归 7/7；干净工作树最终定向测试 11/11。
- Opencode 路由、Office、便携 Skill 测试：27/27。
- Skill `quick_validate.py`：3/3（MarkItDown、minimax-docx、pdfkit-py 均可解析）。
- 最终打包资源验证：PASS。
- 独立运行时探针：`pdfkit=true`、`skillGovernance=true`、`networkUsed=false`、`globalDotnetUsed=false`、`nugetUsed=false`。

## 15. typecheck

- `packages/desktop`: `bun typecheck` PASS。
- `packages/opencode`: `bun typecheck` PASS。
- 干净工作树再次执行两包 typecheck：PASS。

## 16. build

- 从独立干净工作树 `E:\software programming\opencode-dev-next4-build` 构建，没有借用主工作树 `node_modules`。
- `bun install --frozen-lockfile`、`python:prepare`、`rc:skills`、`build`、Windows package 均完成。
- 构建工具自身使用了构建机已有/下载的 electron-builder 工具缓存；这不属于最终安装包运行时断网证明，未将其表述为“离线构建”。

## 17. 安装包路径

`E:\software programming\opencode-dev-next4-build\packages\desktop\dist\xiaoxue-output\录井小雪-0.9.0-next.4-win-x64.exe`

大小：560,574,882 bytes。next.3 未被覆盖。

## 18. SHA-256 与签名

- SHA-256：`9F768B2608C94C0448AF23A02890D6CC632F777DA771622C806AD37D46F43A31`
- Authenticode：`NotSigned`

## 19. 当前 P0 / P1 / P2

- P0：0（Foundation 静态政策和最终包执行探针无失败）。
- P1：2 个交付阻断仍未关闭：正式 Authenticode 签名；独立办公网干净机器上的安装、首次启动、升级和卸载生命周期验收。
- P2：1 个证据增强项：补录最终 UI 中 Skill Center 对两个 unavailable Skill 的人工可视确认。自动路由、Profile 和包内容已验证。

三个原始运行时 P1 已完成代码和自动化整改，不再计为开放项。

## 20. 办公网交付建议与最终结论

next.4 已满足“最终打包资源上的最小真实 Foundation 任务成功”，可作为办公网测试候选；但当前安装器未签名，且尚未在一台独立办公网干净机器上完成安装/升级/卸载与 UI 人工验收，因此不建议作为正式办公网交付版本下发。

**CHANGES_REQUIRED**
