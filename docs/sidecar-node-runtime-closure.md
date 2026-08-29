# Desktop sidecar Node runtime closure

## 结论

`CHANGES_REQUIRED`

Node sidecar 的 3 个既定 P1 已完成修复，最终生产源码扫描得到 `BUG_NODE_SIDECAR = 0`，Node 真实运行 Gate、专项回归、五包 typecheck 和 Desktop sidecar smoke 均通过。但是 integration Desktop 的地质报告审核 GUI Gate 失败：模型选择器实际显示的 `anthropic/claude-sonnet-4-6` 和 `anthropic/claude-sonnet-5` 均被 sidecar 拒绝为 `Model not found`。按照“5 项任一失败即停止交付”的规则，未继续知识导入、查询和重启后查询，不得合并 `dev`。

## 1. ChatGPT 确认的 3 个 P1

| P1   | 原问题                                                                 | Node sidecar 风险                                        | 状态   |
| ---- | ---------------------------------------------------------------------- | -------------------------------------------------------- | ------ |
| P1-1 | `trusted-attachments.ts` 使用 `Bun.file(...).arrayBuffer()`            | Electron `utilityProcess.fork` 运行在 Node，无全局 `Bun` | 已修复 |
| P1-2 | `knowledge-manage.ts` 使用 `Bun.CryptoHasher`、`Bun.write`、`Bun.file` | 导入、更新、列表、删除链路在 Node sidecar 中失败         | 已修复 |
| P1-3 | `knowledge-search.ts` 使用 `Bun.file`、`Bun.Glob`、`import.meta.dir`   | 索引读取和 fallback 递归扫描在 Node sidecar 中失败       | 已修复 |

## 2. 实际修复文件

- `packages/opencode/src/xiaoxue/trusted-attachments.ts`
  - 使用 `node:fs/promises.readFile` 读取附件。
  - 保留 100 MB 限制、`realpath`、SHA-256 复核、`TrustedAttachment` 注册表和 single-use token 语义。
- `packages/opencode/src/tool/knowledge-manage.ts`
  - SHA-256 改用 `node:crypto.createHash("sha256")`。
  - 文件读写和存在检查改用 `readFile`、`writeFile`、`stat`。
  - `index.json` 继续使用临时文件原子替换，并在 `rename` 前执行文件 `fsync`。
  - 保留 SHA 去重、`_archive`、`sourceId`、`version`、`active`、`supersedes` 和路径安全语义。
- `packages/opencode/src/tool/knowledge-search.ts`
  - 文件和索引读取改用 `readFile`，存在检查改用 `stat`。
  - fallback 扫描改用 `readdir({ withFileTypes: true })` 递归实现。
  - 继续只收集 `md/txt/csv/docx/xlsx`，并排除整个 `_archive` 目录。
  - 模块目录改为 `path.dirname(fileURLToPath(import.meta.url))`。
- `packages/opencode/test/xiaoxue/node-runtime-gate.ts`
- `packages/opencode/test/xiaoxue/node-runtime-gate-entry.ts`
- `packages/opencode/package.json`
  - 新增 `test:node-sidecar` Gate。

## 3. 最终 Bun-only 审计

扫描的是最终 integration 源码，不是仅扫描 `dev..integration` 新增 diff。生产范围：

- `packages/opencode/src/xiaoxue/`
- `packages/opencode/src/tool/`
- `packages/opencode/src/session/`
- `packages/opencode/src/agent/`
- `packages/core/src/`
- `packages/protocol/src/`
- `packages/server/src/`
- `packages/desktop/src/`

搜索项：`Bun.file`、`Bun.write`、`Bun.Glob`、`Bun.CryptoHasher`、`Bun.spawn`、`import.meta.dir`、`bun:sqlite`。

### 3.1 生产源码命中

| 文件与行号                                                    | 调用链                                                                                        | 实际运行时                                                                                            | 分类                  |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------- |
| `packages/opencode/src/xiaoxue/sqlite.bun.ts:3`，`bun:sqlite` | `memory.ts` / `event-db-maintenance.ts` / `governance.ts` / `obsidian.ts` → `#xiaoxue-sqlite` | `packages/opencode/package.json:33-36` 按条件映射；Bun 选 `.bun.ts`，Node sidecar 选 `sqlite.node.ts` | `CONDITIONAL_RUNTIME` |
| `packages/core/src/database/sqlite.bun.ts:1`，`bun:sqlite`    | `database/database.ts` → `#sqlite` → Core Database → Server/Session/Tool 消费者               | `packages/core/package.json:27-30` 按条件映射；Bun 选 `.bun.ts`，Node sidecar 选 `sqlite.node.ts`     | `CONDITIONAL_RUNTIME` |

生产源码没有其他命中。

### 3.2 Bun 专用辅助入口命中

下列文件由 `bun` 脚本直接启动，或属于 Bun 测试/打包/校验入口，不进入 Electron Node sidecar 的可达模块图，分类均为 `SAFE_BUN_ONLY`：

| 文件                                                                | 命中行号                   | 调用链 / 运行时                                                                   |
| ------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------- |
| `packages/opencode/test/xiaoxue/node-runtime-gate.ts`               | 8, 86, 87                  | Bun Gate runner 构建 Node bundle，再由 `node.exe` 启动业务 Gate                   |
| `packages/desktop/scripts/copy-metainfo.ts`                         | 42                         | Desktop Bun 构建脚本                                                              |
| `packages/desktop/scripts/generate-resource-integrity.ts`           | 23, 60, 66, 95, 105        | Desktop Bun 资源完整性脚本                                                        |
| `packages/desktop/scripts/finalize-latest-yml.ts`                   | 74, 119                    | Desktop Bun 发布元数据脚本                                                        |
| `packages/desktop/scripts/finalize-latest-json.ts`                  | 96, 128, 130, 209          | Desktop Bun 发布元数据脚本                                                        |
| `packages/desktop/scripts/minimax-docx-offline.test.ts`             | 7, 8                       | Bun 测试入口                                                                      |
| `packages/desktop/scripts/office-network-capability-matrix.test.ts` | 7, 8                       | Bun 测试入口                                                                      |
| `packages/desktop/scripts/markitdown-offline-runtime.test.ts`       | 8                          | Bun 测试入口                                                                      |
| `packages/desktop/scripts/office-network-runtime.ts`                | 104                        | Bun 网络能力校验入口                                                              |
| `packages/desktop/scripts/materialize-xiaoxue-rc-skills.ts`         | 32, 57, 121, 144, 161, 245 | Desktop Bun RC 物化脚本                                                           |
| `packages/desktop/scripts/prepare-python-runtime.ts`                | 105                        | Desktop Bun Python 准备脚本                                                       |
| `packages/desktop/scripts/package-windows.ts`                       | 30, 31, 74                 | Desktop Bun Windows 打包脚本                                                      |
| `packages/desktop/scripts/python-launcher-normalize.ts`             | 64                         | Desktop Bun Python 规范化脚本                                                     |
| `packages/desktop/scripts/prepare.ts`                               | 6, 8                       | Desktop Bun 准备脚本                                                              |
| `packages/desktop/scripts/offline-skill-policy.ts`                  | 55, 56, 69                 | Desktop Bun 离线策略校验脚本                                                      |
| `packages/desktop/scripts/verify-packaged-windows.ts`               | 56, 64, 67, 94, 138        | Desktop Bun 安装包校验脚本                                                        |
| `packages/desktop/scripts/verify-sidecar-runtime.ts`                | 9, 14, 18, 31, 32, 40      | Bun 构建后检查器；其职责正是拒绝 Node sidecar 中的 `bun:sqlite` 并启动 Node smoke |
| `packages/desktop/scripts/verify-python-runtime.ts`                 | 22                         | Desktop Bun Python smoke 入口                                                     |

### 3.3 最终计数

- `SAFE_BUN_ONLY`: 18 个辅助入口文件。
- `CONDITIONAL_RUNTIME`: 2 个生产条件实现文件。
- `BUG_NODE_SIDECAR`: **0**。

## 4. Node 真实运行 Gate

命令：

```text
cd packages/opencode
bun run test:node-sidecar
```

runner 只负责把生产模块和测试边界构建为 Node ESM；业务验证进程由系统 `node.exe v24.15.0` 启动。子进程首先断言 `typeof globalThis.Bun === "undefined"`，实际输出：

```json
{
  "runtime": "node",
  "node": "v24.15.0",
  "bunGlobal": "undefined",
  "trustedAttachmentDocx": "PASS",
  "knowledge": {
    "import": "PASS",
    "update": "PASS",
    "list": "PASS",
    "remove": "PASS",
    "search": "PASS",
    "index": "PASS"
  },
  "fallback": { "recursiveScan": "PASS", "archiveExcluded": "PASS", "extensionsPreserved": "PASS" }
}
```

覆盖：真实临时 DOCX 可信附件读取与 consumed 标记、知识导入、SHA 去重、更新和 `_archive`、列表、删除、搜索、`index.json` 读取、无索引 fallback 递归、扩展名约束和 `_archive` 排除。

## 5. GUI 快速验收

验收使用 integration Desktop、隔离测试 profile 和真实生成的 DOCX：

| Gate                | 结果      | 证据                                                                                                                             |
| ------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1. 选择真实 DOCX    | `PASS`    | Windows 原生文件选择器选中 `真实录井报告.docx`，附件卡片在会话输入区可见                                                         |
| 2. 执行地质报告审核 | `FAIL`    | 默认 `anthropic/claude-sonnet-4-6` 返回 `Model not found`；改选列表中的 `anthropic/claude-sonnet-5` 重试仍返回 `Model not found` |
| 3. 导入一份知识资料 | `NOT_RUN` | 按任一 GUI Gate 失败即停止的规则终止后续验收                                                                                     |
| 4. 查询刚导入的知识 | `NOT_RUN` | 同上                                                                                                                             |
| 5. 重启后再次查询   | `NOT_RUN` | 同上                                                                                                                             |

因此 DOCX 选择本身通过，但地质报告业务执行未通过；知识导入 GUI、知识查询 GUI 和重启后查询均不能声明通过。

## 6. 回归结果

| Gate                            | 结果                                                                 |
| ------------------------------- | -------------------------------------------------------------------- |
| Model Registry                  | `52/52 PASS`                                                         |
| Trusted Attachment              | `41/41 PASS`                                                         |
| Office/geology 当前直接命名套件 | `24/24 PASS`；当前可定位套件不是要求中的 27 项，因此不能声明 `27/27` |
| Xiaoxue business tools 补充     | `6/6 PASS`                                                           |
| Knowledge backend 专项          | `9/9 PASS`，retrieval top1=0.8、top3=1、top5=1                       |
| Knowledge UI 专项               | `9/9 PASS`                                                           |
| `packages/core` typecheck       | `PASS`                                                               |
| `packages/session-ui` typecheck | `PASS`                                                               |
| `packages/app` typecheck        | `PASS`                                                               |
| `packages/desktop` typecheck    | `PASS`                                                               |
| `packages/opencode` typecheck   | `PASS`                                                               |
| Desktop sidecar build/smoke     | `PASS`，输出 `Electron sidecar runtime smoke test passed`            |

## 7. integration HEAD 与提交

- 基线 HEAD：`3f86142810fb7971d53dd6c7f4a683723fb9faad`
- Node 兼容修复提交：`1cdbdffbcb` — `fix(xiaoxue): make private tools Node sidecar compatible`
- Node Gate 提交 / 最终受测代码 HEAD：`f689068a1a68dc69446da9d16114d143a4b8bcd5`
- 本报告提交后，分支 HEAD 会前移到仅包含本报告的文档提交；最终远端 HEAD 以推送结果为准。
- `dev` 未合并、未修改；保护 tag 未删除。

## 8. 当前 P0 / P1 / P2

- P0：0。
- P1：1 个未关闭。
  - integration Desktop 模型选择器和 sidecar Model Registry/Provider 解析不一致，导致所有依赖模型的 GUI 业务任务在执行前失败。该问题不属于本次 3 个 Bun-only 修复，且本任务明确禁止修改 Model Registry 架构，因此只记录阻断，不在本任务扩张修复。
- P2：1 个证据差异。
  - 要求的 Office/geology `27/27` 与当前可定位的直接命名套件 `24/24` 不一致；不能用补充的 6 个 business tool 测试冒充指定 27 项。

## 9. 是否 READY_TO_MERGE_DEV

`CHANGES_REQUIRED`

Node sidecar Bun-only 闭环已完成，但 GUI 硬门禁和指定 `27/27` 证据未闭环。当前不得合并 `dev`。
