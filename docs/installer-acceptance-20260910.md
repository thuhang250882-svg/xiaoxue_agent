# 录井小雪 Windows 安装包验收记录（2026-09-10）

## 结论

**CHANGES_REQUIRED**

安装、启动、MiniMax-M3、文字 PDF、离线 OCR、知识清单后端、检索引用、多轮路径授权、Read 信任边界和卸载均已取得安装版证据。当前安装包仍为 `NotSigned`，且最终重构建后无法通过本轮工具实际听取 TTS 或重新目视知识清单页面，因此不得作为正式客户安装包交付。

## 构建身份

| 项目 | 结果 |
|---|---|
| 目标基线 | `origin/dev` = `cc7076da622cd596831777f0822201a813c005cf` |
| 验收修复 | `ba0fbb96ef5234b3b2e1496af3ba31ac65f3832f`，`fix(desktop): allow configured model providers` |
| 最终构建源码 | `ba0fbb96ef5234b3b2e1496af3ba31ac65f3832f` |
| 产品版本 | `0.9.0-next.10` |
| 发布配置 | `prod` / `internal` / `rc` |
| 安装包 | `packages/desktop/dist/xiaoxue-output/录井小雪-0.9.0-next.10-win-x64.exe` |
| 大小 | `565,908,765` bytes |
| SHA-256 | `05FA493607BC7099530C8973C57FE72BCA97FDD27DE67F21E70DBB1084DC4A6B` |
| Authenticode | `NotSigned` |
| 构建日志 | `stage7-package-ba0fbb96ef.log` |

## 构建前检查

| 检查 | 结果 | 证据 |
|---|---|---|
| 依赖 | PASS | `bun install --frozen-lockfile` 成功 |
| Python/OCR 运行时 | PASS | 打包 Python 3.14.4；13 个依赖；`from rapidocr import RapidOCR` 成功 |
| OCR 模型 | PASS | det / rec / cls 共 3 个 ONNX 模型 |
| 离线技能 | PASS | catalog、物化目录均为 29 项，包含 `knowledge-ingestion-pipeline` |
| RC profile | PASS | effective skills 29；RC core skillCount 11；catalog 29；integrity 9837 项 |
| office-network policy | PASS | Foundations 检查通过；`networkUsed=false` |
| `packages/desktop` typecheck | PASS | 0 error |
| `packages/opencode` typecheck | PASS | 0 error |

最终 `package:win -- --x64 --publish never` 成功。构建内置的 Electron sidecar runtime smoke test 通过；打包资源验证通过 9837 个 integrity 条目、Word、文字 PDF、离线 OCR、托管技能、Python 3.14.4、13 个 Python 依赖和 office-network Foundations。

## 安装版全生命周期验收

本轮使用隔离 profile `xiaoxue-stage7-cc7076da`，并仅生成两份带唯一标记的合成 PDF。未使用真实业务数据。GUI 自动化入口在最终重构建后不可用，因此能由本机 HTTP、日志、落盘文件和聚焦测试证明的项目均标为“自动化”；需要看或听的项目保持“待人工观察”。

| # | 验收项 | 结果 | 证据类型 | 实际结果与证据 |
|---|---|---|---|---|
| 1 | 安装并启动 | PASS | 自动化 + 初次构建目视 | NSIS 静默安装成功；主进程、GPU、NetworkService、NodeService、两个 renderer 和 AudioService 均启动；日志显示 server ready、打包 Python 生效；最终运行无 EPIPE 风暴、canvas/DOMMatrix 崩溃或窗口无响应记录。初次同版本构建曾目视主窗口与数字人正常出现。 |
| 2 | MiniMax-M3 | PASS | 安装版 API + 日志 | `/global/models` 与 `/provider` 均返回 `xiaoxue/MiniMax-M3`；会话 `ses_f78e90db0ffe7ZcBRAGU41fcrW` 以该模型完成中文回复，`finish=stop`、`hasError=false`。 |
| 3 | 离线扫描件导入 | PASS | 安装版 API + 落盘文件 + 离线探针 | 扫描 PDF 标记 `STAGE7-OCR-CC7076DA-20260910`。打包 Python 在无效 HTTP/HTTPS proxy 与 `HF_HUB_OFFLINE=1` 下完成 OCR；安装版会话 `ses_f78e41641ffeqYlBG7NhmSe6a9` 先 prepare，再在只回复 `standard` 后执行 OCR 与 import。使用 opaque artifact `ee0d1333-76de-43b5-affe-388d87b32ed7`，生成记录 `KN-852A0B3464E5` 和本地 OCR 文本。工具策略保持 `offline=true`。本机物理网卡未禁用，故离线结论限定为工具策略隔离及无效代理下的 OCR 运行时证据。 |
| 4 | 文字层 PDF 导入 | PASS | 安装版 API + 落盘文件 | 合成 PDF 标记 `STAGE7-TEXT-CC7076DA-20260910`，直接提取第 1 页、`ocrPages=[]`；记录 `KN-FAECBD702E4C` 成功入库。 |
| 5 | 知识库清单 | PASS（后端）/ 待 GUI 目视 | 安装版 API + index | `/config/xiaoxue/knowledge` 与 `knowledge/index.json` 均显示 2 条 active 记录，标题、分类 `standard`、版本和文件路径正确。最终构建的清单面板未重新目视。 |
| 6 | 检索引用 | PASS | 安装版会话 + 工具结果 | 会话 `ses_f78e29244ffek3erTamohedRJW` 的 `knowledge_search` 搜索 2 个文件、无 warning；首条命中 `KN-852A0B3464E5`，返回原件 PDF 路径、1 起始页码及包含唯一 OCR 标记的摘录。 |
| 7 | 多轮路径授权 | PASS | 安装版会话 + 工具结果 | 会话 `ses_f78e51facffeHjFAKkyHyp0LLL`：A 轮在引号中给出完整路径，`knowledge_manage prepare` 返回 source ref `e519476c-ccb2-47a2-a0f2-b1bdffc68c62` 并询问分类；B 轮仅回复 `standard`，随后以 source ref 完成 import，未重新索要原路径授权。 |
| 8 | Read 行为 | PASS（符合设计） | 安装版会话 + 权限结果 | prepare 后模型尝试用 `Read` 读取原路径，权限策略拒绝；没有产生待批准请求，模型改为提示使用 `knowledge_search` / `knowledge_manage`。短期信任引用只授权 knowledge 工具，不扩大为通用 Read 权限。 |
| 9 | 数字人/TTS/无 ASR | **PENDING_MANUAL** | 安装版进程 + 源码契约测试 | 安装版数字人 renderer 与 AudioService 已启动；回答流进入 `XiaoxueVoicePlayback`，本地路径调用 `window.speechSynthesis.speak`。34 个数字人/TTS 聚焦测试通过；契约验证无 `getUserMedia`、`SpeechRecognition`、转写 IPC、ASR 设置入口，并保留 TTS 配置/播报链。当前工具无法听取扬声器输出，尚未取得“实际听到播报”的人工证据。 |
| 10 | 卸载 | PASS | 本机生命周期检查 | 卸载前安装目录、正式快捷方式、注册项和 8 个应用进程存在；静默卸载返回 0。卸载后安装目录、正式桌面/开始菜单快捷方式、卸载注册项和相关进程均不存在。隔离 profile 被保留，符合 NSIS 未启用 `deleteAppDataOnUninstall` 的数据保留设计；取证完成后已人工删除该测试 profile 及 5 个临时验收脚本。历史 `录井小雪 Dev.lnk` 不属于本安装包。 |

## 验收中发现并修复的问题

### P1：RC 默认策略阻止已配置模型供应商

初始安装包能列出 `MiniMax-M3`，但实际请求被 RC 的 `offline=true`、`allowPublicProviders=false` 拒绝，外层表现为 `Model not found`。源码 CLI 使用同一 profile 可以成功请求，确认凭据和模型 ID 正确。

修复提交 `ba0fbb96ef` 保留工具离线策略，只允许已配置 provider 的网络访问。没有修改 shell runtime、通用权限引擎或模型架构。修复后：

- desktop enterprise policy：5/5 PASS
- opencode enterprise policy：6/6 PASS（首次运行发生无关的 afterEach timeout，立即以 30 秒超时重跑通过）
- desktop / opencode typecheck：PASS
- 最终安装版 MiniMax-M3：PASS

## 聚焦回归

| 范围 | 结果 |
|---|---|
| desktop enterprise policy | 5/5 PASS |
| opencode enterprise policy | 6/6 PASS |
| 数字人、TTS、任务账本 | 34/34 PASS |
| Electron sidecar runtime smoke | PASS |
| packaged Windows resources | PASS |
| desktop typecheck | PASS |
| opencode typecheck | PASS |

## 过程修正与非产品故障

1. 路径授权测试首次将英文句号直接紧接在 `.pdf` 后，严格路径边界正确拒绝了该输入。改为引号包裹完整路径后通过；未放宽路径信任规则。
2. 独立运行 packaged verifier 时首次遗漏 `prod` 环境变量，脚本因此查找 `录井小雪 Dev.exe`。补齐与构建一致的环境变量后通过；安装包内容未改变。
3. 第一次安装运行曾记录 `@opencode-ai/plugin@0.0.0-prod-*` 后台安装 warning；最终重构建的验收 run 未再次出现。最终 run 的一次 `AbortError` 来自测试脚本主动终止过短的 Read 观察，随后延长观察并完成验证。
4. sidecar 日志有一次 PDF.js `Setting up fake worker` warning，未导致导入、OCR 或检索失败。

## 遗留问题与交付门槛

| 优先级 | 项目 | 处置 |
|---|---|---|
| P0 | 安装包 `NotSigned` | 取得正式代码签名证书并重签/重构建；复核安装包和内部二进制签名链。签名前只可作为内部测试候选。 |
| P1 | TTS 实际播放未人工听验 | 在最终签名构建上发送一条数字人问题，确认扬声器实际播报、状态切换正常、没有麦克风入口。 |
| P1 | 最终构建知识清单页未重新目视 | 打开知识库清单，确认 2 条合成记录的数量和标题；后续可用同类合成资料复验。 |

因 P0 和两个 P1 尚未关闭，本安装包不交付客户。
