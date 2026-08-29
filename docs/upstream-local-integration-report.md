# 录井小雪 OpenCode 上游安全融合报告

日期：2026-08-29

集成分支：`integration-upstream-20260829`

结论：`CONDITIONAL`

本报告记录 `dev` 私有化基线与 `upstream-sync-20260828` 的集成结果。报告中的 `PASS` 仅用于已经由代码、自动化测试或本轮 GUI 操作直接证明的内容；无法直接证明的内容标为 `NOT_TESTED`。

## 1. 基线

| 项目 | 值 |
| --- | --- |
| 原 `dev` HEAD | `7fcc0a97a14e0d1a5162d0591064bae7f72bf575` |
| upstream sync HEAD | `5b1ae27a35de5601a8a3a12e5b7a4439e677da35` |
| 已测试的 integration 代码 HEAD | `5416313b68bfd0f4e33df72856916fbbbc04ea10` |
| 集成 merge commit | `58c35e3be515bc3fe58a7e35bb499c9faff422c7` |
| 私有化基线文档 commit | `7b7d866a15` |
| backup tag | `pre-upstream-local-merge-20260829` |
| backup tag 指向 commit | `7fcc0a97a14e0d1a5162d0591064bae7f72bf575` |

保护标签已推送到 `origin`。原 `dev` 分支未合并、未提交、未推送；原工作树已有的 3 个未跟踪文档/目录未被修改。

集成后另增加了 Windows 资源完整性修复：

- `.gitattributes` 将 `packages/desktop/resources/catalog/skill-catalog.json` 固定为 `-text`；
- 原因是 Windows clean checkout 会把 catalog 的 LF 转换成 CRLF，而完整性清单保存的是 LF 内容 SHA-256；
- 修复后资源生成稳定，相关 desktop 校验 10/10 通过。

## 2. 上游更新摘要

`dev..upstream-sync-20260828` 共涉及 979 个文件，约 111,455 行新增、16,683 行删除。主要上游能力包括：

- Azure CLI authentication 与 Azure provider 兼容性调整；
- v1 读取受支持 v2 配置、配置快照比较修复；
- Bedrock reasoning replay/cache 修复；
- legacy database migration history 恢复；
- stacked dialogs focus 恢复、RTL 相关能力与 Web UI 调整；
- stats/console/Go 文档与发布版本更新；
- SDK/client/generated 内容同步；
- Windows Desktop 平台 Skill catalog 打包与资源完整性支持。

## 3. 私有化保护结果

| 私有化领域 | 状态 | 本轮证据 |
| --- | --- | --- |
| 品牌 | `PASS` | Desktop 标题、工作台和 2D 小雪形象均显示“录井小雪”；品牌测试通过。 |
| Agent | `PASS` | 办公、报告、标书、合同、知识库、文档生成等私有入口仍存在；工作台 GUI 显示 6 个业务卡片。 |
| 模型 | `CHANGED_BUT_PRESERVED` | upstream 带来 provider/config 更新；私有 Model Registry 仍存在，52 个专项测试通过；GUI 可见“本地模型管理/新增模型”。真实本地模型 GUI 调用为 `NOT_TESTED`。 |
| 附件 | `PASS` | trusted attachment、跨盘符/Unicode/UNC/native picker/file URL 拒绝等 41 个核心测试通过。 |
| 报告审核 | `PASS` | DOCX/XLSX、legacy DOC/XLS、PDF 边界、ReviewResult 与 DOCX export 共 27 个测试通过。真实 GUI 文件审核为 `NOT_TESTED`。 |
| 知识库 | `CHANGED_BUT_PRESERVED` | 企业知识库界面及导入、更新、列表、查询、删除和来源/版本语义可见；后端/稳定性测试通过。真实知识查询为 `NOT_TESTED`。 |
| Skill | `CHANGED_BUT_PRESERVED` | 项目 Skill 从 27 个增至 28 个，新增 upstream `rtl-aware-development`；GUI 加内置 `customize-opencode` 共显示 29 个且全部启用。真实 Skill 调用为 `NOT_TESTED`。 |
| 桌宠 | `PASS` | 2D WebP 实现仍是 `XiaoxueWebP.tsx`；无 `.glb`、Three.js 或 `@react-three` 依赖；GUI 启动页显示 2D 小雪。浮动桌宠窗口为 `NOT_TESTED`。 |
| 安全 | `PASS` | token expiry、WebContents binding、single-use、symlink revalidation、外部 file URL 拒绝等测试通过；未扩大 allowlist。 |
| 离线 | `CHANGED_BUT_PRESERVED` | bundled Python 及 office-network profile 校验通过；未发现 sidecar 可达路径新增公网安装。真实断网 GUI 业务流为 `NOT_TESTED`。 |
| 数据库 | `CHANGED_BUT_PRESERVED` | Event/数据库稳定性 31 个专项测试通过；Node 条件导出和 sidecar smoke build 通过。Bun runner 的 `node:sqlite` 测试装载问题见 P2。 |

关键私有化路径均保留，没有在本次 merge 中被删除。详细基线见 `docs/private-customization-preservation.md`。

## 4. 冲突清单

本轮从 `integration-upstream-20260829` 执行 `git merge --no-ff upstream-sync-20260828` 的 Git 冲突为 **0**，因此没有逐文件冲突项。

| 类别 | 数量 |
| --- | ---: |
| `UPSTREAM_PLATFORM` | 0 |
| `XIAOXUE_PRIVATE` | 0 |
| `BOTH_NEED_INTEGRATION` | 0 |
| `GENERATED` | 0 |
| `CONFIG` | 0 |
| `TEST` | 0 |
| 合计 | 0 |

说明：`upstream-sync-20260828` 本身是此前已完成冲突处理的同步分支。本报告只统计当前正式集成 merge 可复核的冲突，不反向猜测该分支历史构建过程中的分类数量。

## 5. 静默回归检查

本轮重点审查了 Git 自动合并但可能改变行为的区域：

| 区域 | 结果 |
| --- | --- |
| Model Registry/provider/model ID 请求链 | 私有实现保留；52/52 专项测试通过。 |
| Desktop server/sidecar | Node `utilityProcess.fork` 路径保留；build 中 sidecar runtime smoke test 通过。 |
| generated Client/SDK | `packages/client` 执行 `bun run generate`，legacy JS SDK 执行构建脚本；重新暂存后无内容差异，生成结果稳定。 |
| trusted attachment/file URL | 私有安全链保留；核心和 Office 专项测试通过。 |
| Skill catalog/profile | catalog、manifest、office-network profile 与 GUI 列表均可用；增加 Windows 行尾保护。 |
| 2D 桌宠 | WebP 路径、品牌和禁止 Three.js 合约保留。 |
| Event/数据库/submit guard | 相关专项测试通过；未发现关键私有文件删除。 |

没有发现确认的私有化功能回归。未完成的真实 GUI 业务流仍按 `NOT_TESTED` 处理。

## 6. Node/Bun 审计

对 backup tag 到 upstream sync 的新增 `Bun.*` / `bun:sqlite` 行进行了扫描。命中如下：

- App 测试：`prompt-input/submit.test.ts`、`session-new-design-view.test.ts`、`home-session-open.test.ts`、`pet_task_does_not_duplicate_session.test.ts`、`xiaoxue-branding.test.ts`；
- App browser 测试：`test-browser/prompt-persistence.test.ts`；
- Desktop 测试/构建/验证：`electron-builder.config.test.ts`、`generate-resource-integrity.ts`、`verify-packaged-windows.ts`、`pet-window-contract.test.ts`；
- OpenCode 测试：config snapshot/v2 tests、MCP transport、Azure/Codex/Modal provider tests；
- TUI 测试：`sync-live-hydration.test.tsx`；
- Stats Bun runtime：`packages/stats/core/src/r2-sql.ts`；
- `bun.lock` 仅为锁文件内容。

分类结果：

| 分类 | 结果 |
| --- | --- |
| `SAFE_BUN_ONLY` | 上述测试、构建脚本、验证脚本及 Stats 的 Bun 部署路径；不进入 Desktop Node sidecar。 |
| `CONDITIONAL_RUNTIME` | `@opencode-ai/core` 与 `@opencode-ai/opencode` 的 sqlite 等条件导出；Node 选择 `.node.ts`，Bun 选择 `.bun.ts`。 |
| `BUG_NODE_SIDECAR` | 0。Desktop build 的 `verify-sidecar-runtime.ts` 明确检查产物不得包含 `bun:sqlite`，并已通过 sidecar smoke test。 |

结论：没有确认的新增 Bun-only API 进入 Node sidecar 可达路径。

## 7. 模型管理测试

Model Registry 专项结果：**52 passed / 0 failed**。

已覆盖：

- create/update/delete；
- stable registry key；
- provider ID scope；
- 编辑 model ID 后 provider DB 和 request 使用新 ID；
- tombstone 在 registry rebuild/restart 后仍阻止被删除模型复活；
- 被引用模型删除时阻止删除或要求 replacement。

特别结论：

- **删除模型不会在 rebuild/restart 后复活：`PASS`。**
- **Agent/provider 请求会读取更新后的 modelId：`PASS`。**
- GUI 中可以进入本地模型管理：`PASS`。
- 真实本地模型服务的新增、编辑后立即调用：`NOT_TESTED`。

## 8. 自动化测试

### 8.1 专项测试

| 组别 | 结果 |
| --- | --- |
| Model Registry | 52 passed / 0 failed |
| Core trusted attachments | 41 passed / 0 failed |
| Office/geology + untrusted file URL | 27 passed / 0 failed |
| App knowledge/stability | 23 passed / 0 failed |
| App model client/provider UI logic | 18 passed / 0 failed |
| DB/Event stability | 31 passed / 0 failed |
| Desktop 资源完整性修复复验 | 10 passed / 0 failed |
| Knowledge/Skill broad group | 112 passed / 6 failed |

Knowledge/Skill 的 6 个失败均为 pre-merge baseline 测试债务：3 个 `reference-integrity.test.ts` 使用过时的固定数量 70 并把中文正文误识别为 Skill 名；3 个 production fixture 依赖本地缺失的 `rc6-business-skills` Git tag。相关测试/fixture 相对 backup tag 未修改，未通过扩大 allowlist 或伪造 tag 掩盖失败。

### 8.2 全包测试

| 包 | passed | failed | skipped/todo | 分类 |
| --- | ---: | ---: | ---: | --- |
| `packages/core` | 1151 | 0 | 7 skipped | PASS |
| `packages/session-ui` | 86 | 0 | 0 | PASS |
| `packages/app` unit | 817 | 0 | 0 | PASS |
| `packages/app` browser | 41 | 0 | 0 | PASS |
| `packages/desktop` | 198 | 1 | 0 | `WINDOWS_ENVIRONMENT`：Bun 1.3.14 装载 `draft-store.test.ts` 时没有内建 `node:sqlite`；同一 Node sidecar 的 build/smoke 通过。 |
| `packages/opencode` | 3646 | 11 | 65 skipped / 1 todo | 见下方分类。 |

OpenCode 的 11 个失败：

- 4 个 Cloudflare AI Gateway E2E：upstream 更新后的 `ai-gateway-provider@3.2.0` 拒绝 `anthropic.messages`，分类为 `UPSTREAM_BASELINE`；
- 6 个 Skill 基线/fixture 失败：分类为 `PRE_MERGE_BASELINE TEST_DEBT`；
- 1 个 CLI run-process JSON format：Windows 混合路径导致外部目录权限拒绝，分类为 `WINDOWS_ENVIRONMENT`。

没有删除测试、跳过测试或放宽 allowlist。

## 9. Typecheck

均从各自 package 目录执行 `bun typecheck`：

| 包 | 结果 |
| --- | --- |
| `packages/core` | PASS |
| `packages/session-ui` | PASS |
| `packages/opencode` | PASS |
| `packages/app` | PASS |
| `packages/desktop` | PASS |

五包均为 exit code 0。依赖通过每个 package 内的 `bun install --frozen-lockfile` 安装，没有借用其他 worktree 的 `node_modules`。

## 10. GUI

GUI 使用独立的 `OPENCODE_DESKTOP_TEST_ROOT` 与 XDG data/config/state 目录，不触碰用户正式数据。

| P0 快速验收项 | 结果 | 证据/边界 |
| --- | --- | --- |
| 1. 启动 | `PASS` | 标题“录井小雪”，sidecar `server ready`，工作台可见。 |
| 2. 新建 Session | `PASS` | 新建 Session 控件可操作并创建新页签。 |
| 3. 本地模型调用 | `NOT_TESTED` | 隔离配置未设置真实本地模型。 |
| 4. 编辑 modelId 后立即调用 | `NOT_TESTED` | 自动化链路通过，但没有真实 GUI 模型调用。 |
| 5. DOCX 审核 | `NOT_TESTED` | 自动化解析/审核/export 通过，GUI 实际文件流未执行。 |
| 6. Excel 附件 | `NOT_TESTED` | 自动化 XLS/XLSX 测试通过，GUI 实际文件流未执行。 |
| 7. 知识库查询 | `NOT_TESTED` | GUI 入口与完整管理界面可见，但未建立项目并执行真实查询。 |
| 8. Skill 调用 | `NOT_TESTED` | Skill Center 显示 29/29 已启用；未通过真实模型执行 Skill。 |
| 9. 桌宠 | `PASS` / `NOT_TESTED` | 启动/Session 页 2D 小雪形象可见；独立浮动桌宠窗口未验证。 |
| 10. 托盘 | `NOT_TESTED` | 自动化合约测试通过，真实系统托盘未取得操作证据；关闭主窗口会结束本轮隔离进程。 |
| 11. 重启恢复 | `NOT_TESTED` | 关闭并用同一隔离目录重启后 app、bundled Python、sidecar 均正常就绪；空白 Session 不足以证明真实会话恢复。 |

GUI 还确认了 6 个业务工作台入口、企业知识库页、本地模型管理页和 Skill Center。由于本轮没有配置真实本地模型，也没有选择用户业务文件，不能把相关实际调用写为通过。

## 11. 办公网

| 检查 | 结果 |
| --- | --- |
| bundled Python | Python 3.14.4，10869 文件，599,500,448 bytes；`python.exe` SHA-256 为 `7CA24F26D6E3F463419EE4F537DDD3ACD312C38FE45E678CCE08572F26A8BD1A`。 |
| Python 模块 | `docx/openpyxl/pandas/pdfplumber/fitz/PIL/rapidocr/onnxruntime/reportlab/pypdf/statsmodels/yaml/xlrd` 均验证通过。 |
| 新增公网安装 | 未发现 runtime installer 新增 `winget/brew/apt/CDN/curl/wget` 依赖。 |
| Office-network profile | catalog/manifest/publish policy 通过；未扩大 allowlist。 |
| 已知不可用 Skill | `minimax-docx` 与 `markitdown-skill` 仍按 profile 标为不可用于办公网，不把 setup 中的 winget/dotnet/NuGet 当作可运行时依赖。 |
| 真实断网运行 | `NOT_TESTED`。 |

## 12. 当前 P0/P1/P2

### P0

没有发现已经确认的私有化代码 P0 回归，但下列发布门禁仍未关闭：

- 真实本地模型调用及编辑 modelId 后立即调用；
- GUI DOCX、Excel、知识库、Skill 端到端业务流；
- 独立浮动桌宠、系统托盘、真实持久会话重启恢复；
- 当前 integration tip 的安装包、正式 Authenticode 签名、clean-machine 安装/升级/卸载。

这些是 `NOT_TESTED` 发布门禁，不伪装为代码缺陷或 PASS。

### P1

- upstream 的 Cloudflare AI Gateway E2E 4 个失败；
- Windows CLI run-process mixed-path 权限测试 1 个失败。

### P2

- Skill reference-integrity/production fixture 6 个 pre-merge 基线测试债务；
- Bun 1.3.14 测试 runner 缺少内建 `node:sqlite` 导致 Desktop 1 个测试失败，但 Electron Node sidecar build/smoke 已通过。

## 13. 是否可以合入 dev

**`CONDITIONAL`**

技术融合已经完成，私有化关键模块、五包 typecheck、核心专项测试和 Desktop Node sidecar build 均保留或通过，没有确认的业务代码 P0 回归。但真实模型/文件/知识库/Skill GUI 业务流、托盘/会话恢复及正式发布生命周期仍有 `NOT_TESTED` 项；全包测试还包含可分类的 upstream/baseline/Windows 环境失败。

因此当前建议：

1. 保留 `dev` 和 backup tag 不动；
2. 先对本报告和 integration branch 做人工/ChatGPT 代码审查；
3. 在有真实本地模型和代表性 DOCX/XLSX 的环境关闭 P0 GUI 门禁；
4. 修复或接受 P1/P2 测试基线后，再决定是否合入 `dev`；
5. 面向客户发布前必须重新生成当前 integration 安装包、正式签名并完成 clean-machine 生命周期验证。

本报告完成后停止；不执行 integration → `dev` merge，不 push `dev`，不删除 backup tag。
