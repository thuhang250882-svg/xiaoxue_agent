# Desktop sidecar Node runtime closure

## 结论

`READY_TO_MERGE_DEV`

ChatGPT 指出的 3 个 Node sidecar P1 已全部关闭，补充发现的地质审核 Node 路径也已修复。最终源码扫描和构建产物 smoke 均得到 `BUG_NODE_SIDECAR = 0`。真实 integration Desktop 的 DOCX 审核、知识导入、即时查询、完整重启后再次查询均通过。

本结论仅表示 `integration-upstream-20260829` 已满足合并 `dev` 的代码与业务门禁；本任务没有合并或修改 `dev`，没有删除保护 tag，也没有生成正式签名安装包。

## 1. ChatGPT 确认的 3 个 P1

| P1 | 原问题 | 修复文件 | 状态 |
| --- | --- | --- | --- |
| P1-1 | `trusted-attachments.ts` 使用 `Bun.file(...).arrayBuffer()` | `packages/opencode/src/xiaoxue/trusted-attachments.ts` | 已改为 `node:fs/promises.readFile`；100 MB、realpath、SHA-256、single-use token 不变 |
| P1-2 | `knowledge-manage.ts` 使用 `Bun.CryptoHasher`、`Bun.write`、`Bun.file` | `packages/opencode/src/tool/knowledge-manage.ts` | 已改为 `node:crypto` 和 `node:fs/promises`；SHA 去重、归档、索引和版本语义不变 |
| P1-3 | `knowledge-search.ts` 使用 `Bun.file`、`Bun.Glob`、`import.meta.dir` | `packages/opencode/src/tool/knowledge-search.ts` | 已改为 `readFile`、`stat`、`readdir({ withFileTypes: true })` 和 `path.dirname(fileURLToPath(import.meta.url))` |

补充关闭的实际 sidecar 可达路径：

- `domains/geology_report/upload_review.ts`：可信附件改用 Node `readFile`。
- `domains/geology_report/rules/loader.ts`：自定义规则文件改用 Node `readFile`。
- `domains/geology_report/rule_engine.ts`：内置 YAML 规则作为文本打包，避免 Node sidecar 依赖源码目录位置。
- `document_engine/exporters/*`：HTML/DOCX 落盘改为执行时动态加载 `node:fs/promises.writeFile`；同时保持 renderer 的 Blob 导出路径可构建。
- `packages/desktop/scripts/verify-sidecar-runtime.ts`：构建后拒绝 `bun:sqlite` 以及 `Bun.file/write/Glob/CryptoHasher/spawn` 进入 sidecar chunk。

## 2. 最终 Bun-only 搜索结果

扫描最终源码，而不是只扫描新增 diff。范围包括：

- `packages/opencode/src/xiaoxue/`
- `packages/opencode/src/tool/`
- `packages/opencode/src/session/`
- `packages/opencode/src/agent/`
- `packages/core/src/`、`packages/protocol/src/`、`packages/server/src/`
- `domains/`、`document_engine/`
- `packages/desktop/src/` 和 `packages/desktop/scripts/`

搜索项：`Bun.file`、`Bun.write`、`Bun.Glob`、`Bun.CryptoHasher`、`Bun.spawn`、`import.meta.dir`、`bun:sqlite`。

### 2.1 生产条件实现

| 文件与行号 | 调用链 | 运行时 | 分类 |
| --- | --- | --- | --- |
| `packages/opencode/src/xiaoxue/sqlite.bun.ts:3` | `memory.ts` / `obsidian.ts` / `governance.ts` / `event-db-maintenance.ts` → `#xiaoxue-sqlite` | package import conditions：Bun 选 `.bun.ts`；Electron sidecar 的 Node 条件选 `sqlite.node.ts` | `CONDITIONAL_RUNTIME` |
| `packages/core/src/database/sqlite.bun.ts:1` | Core Database → Server/Session/Tool | package import conditions：Bun 选 `.bun.ts`；Node 选 `sqlite.node.ts` | `CONDITIONAL_RUNTIME` |

生产 sidecar 可达模块没有其他命中。

### 2.2 Bun 构建、发布和测试入口

以下命中均由 `bun` 明确启动，或者是 `*.test.ts` 测试源文件，不进入打包后的 Electron Node sidecar，分类均为 `SAFE_BUN_ONLY`：

| 文件 | 命中 |
| --- | --- |
| `packages/desktop/scripts/verify-sidecar-runtime.ts` | `Bun.file`、`Bun.Glob`、`Bun.spawn`；其中字符串匹配项用于拒绝 sidecar 中的 Bun API |
| `packages/desktop/scripts/verify-python-runtime.ts` | `Bun.spawn` |
| `packages/desktop/scripts/verify-packaged-windows.ts` | `Bun.file`、`Bun.spawn` |
| `packages/desktop/scripts/python-launcher-normalize.ts` | `Bun.file` |
| `packages/desktop/scripts/prepare.ts` | `Bun.file`、`Bun.write` |
| `packages/desktop/scripts/prepare-python-runtime.ts` | `Bun.spawn` |
| `packages/desktop/scripts/generate-resource-integrity.ts` | `import.meta.dir`、`Bun.file`、`Bun.write` |
| `packages/desktop/scripts/package-windows.ts` | `Bun.write`、`Bun.spawn` |
| `packages/desktop/scripts/offline-skill-policy.ts` | `Bun.file` |
| `packages/desktop/scripts/finalize-latest-yml.ts` | `Bun.file`、`Bun.write` |
| `packages/desktop/scripts/finalize-latest-json.ts` | `Bun.file`、`Bun.write` |
| `packages/desktop/scripts/office-network-runtime.ts` | `Bun.spawn` |
| `packages/desktop/scripts/copy-metainfo.ts` | `Bun.write` |
| `packages/desktop/scripts/materialize-xiaoxue-rc-skills.ts` | `import.meta.dir`、`Bun.file`、`Bun.write`、`Bun.spawn` |
| `packages/desktop/scripts/{markitdown-offline-runtime,office-network-capability-matrix,minimax-docx-offline}.test.ts` | `Bun.file` |
| `domains/office/__tests__/office_docx_exporter.test.ts` | `import.meta.dir`、`Bun.file` |
| `domains/geology_report/__tests__/docx_parser_exporter.test.ts` | `import.meta.dir`、`Bun.file` |
| `packages/desktop/src/xiaoxue-pet/{pet-window-contract,task-ledger}.test.ts` | `Bun.file`、`bun:sqlite` |
| `packages/desktop/src/renderer/{startup-route,html}.test.ts` | `Bun.file` |
| `packages/desktop/src/main/{branding,enterprise-policy,python-runtime,rc-release-profile,skills,xiaoxue-localization}.test.ts` | `Bun.file`、`Bun.write`、`import.meta.dir` |

最终分类：

- `CONDITIONAL_RUNTIME`：2 个生产条件实现文件。
- `SAFE_BUN_ONLY`：构建/发布脚本和测试入口，均不进入 sidecar。
- `BUG_NODE_SIDECAR`：**0**。

## 3. Node 真实运行 Gate

命令：`cd packages/opencode && bun run test:node-sidecar`

业务进程由系统 `node.exe v24.15.0` 启动，并断言 `typeof globalThis.Bun === "undefined"`。最终输出覆盖：

- 真实临时 DOCX 可信附件读取：PASS。
- 地质可信读取、内置规则、审核、DOCX 导出：PASS。
- 知识 import、update、list、remove、search、`index.json`：全部 PASS。
- fallback 递归、`_archive` 排除、扩展名语义：全部 PASS。

## 4. GUI 快速验收

隔离 profile：`packages/desktop/.tmp-gui-gate-20260831-real`

| Gate | 结果 | 实际证据 |
| --- | --- | --- |
| 1. 选择真实 DOCX | `PASS` | Windows 原生选择器选择 `真实临时录井报告.docx` |
| 2. 执行地质报告审核 | `PASS` | `geology_report_review` 返回结构化结果并导出 `data/opencode/exports/geology-report/真实临时录井_地质录井报告审核意见.docx`，13,515 bytes |
| 3. 导入知识资料 | `PASS` | 导入 `井控知识验收资料.md`；生成 sourceId `KN-B2839536BAAE`、version 1、active、SHA-256 索引 |
| 4. 查询刚导入知识 | `PASS` | `knowledge_search` 精确命中 `XIAOXUE-KB-20260831-ALPHA`，返回 sourceId、来源路径和原文 |
| 5. 重启后再次查询 | `PASS` | 完整关闭并重启 Desktop 后再次发起新查询，命中同一 sourceId、路径和标记 |

模型选择器在重启前后都只显示隔离 profile 中自行添加的 `glm-5.3-flash`，没有恢复历史测试模型。

## 5. 最终回归

| Gate | 结果 |
| --- | --- |
| Model Registry | `55/55 PASS` |
| Trusted Attachment | `41/41 PASS` |
| Canonical Office/geology | `27/27 PASS` |
| Knowledge 专项 | `9/9 PASS`；top1=0.8、top3=1、top5=1 |
| App provider/onboarding/knowledge/menu focused | `20/20 PASS` |
| Core migration/event | `65/65 PASS`（本轮前序最终修复后通过） |
| 五包 typecheck | core、session-ui、app、desktop、opencode：`5/5 PASS` |
| Node sidecar Gate | `PASS`，`bunGlobal = undefined` |
| Desktop production build / smoke | `PASS`；`Electron sidecar runtime smoke test passed` |
| `git diff --check` | `PASS` |
| 密钥/凭据差异扫描 | 无命中 |

## 6. 提交、审查与风险

- 本轮修复提交：`238cb54208` — `fix(xiaoxue): close runtime and model persistence gates`。
- 报告提交会在该提交之后，仅包含闭环文档；远端最终 HEAD 以本报告推送后的 Git 提交为准。
- `dev` 未修改、未合并；保护 tag 未删除。
- 最终代码审查：没有新的可操作 P0/P1/P2。
- P0：0。
- P1：0。
- P2：0（合并门禁）。正式发布仍需另行生成并验证签名安装包，不属于本次 merge gate。

## 7. 是否 READY_TO_MERGE_DEV

`READY_TO_MERGE_DEV`
