# 录井小雪交付前代码审查与修复记录

日期：2026-09-08。审查对象：`E:/software programming/opencode-dev` 当前 `dev` 工作区及 `HANDOFF-20260908.md` 涉及的知识库、OCR、路由和发布资源链路。

## 结论

首轮修复 13 项问题；续轮增加 3 项数据一致性修复，累计 16 类问题。相关测试增加至 **82 个**。双仓同步、桌面构建和独立启动验证见文末续轮记录。**不等于完整桌面端业务验收或客户安装包验收**。

保留原有未提交工作；没有提交、推送或覆盖 handoff。首轮修改前文件备份在 `artifacts/review-20260908-before/`。续轮已定向同步实际运行仓库，并使用独立数据目录启动测试实例；没有改动已有的桌面语音/UI 工作线。

## 已修复问题

| 编号 | 优先级 | 复现或审查证据 | 修复与客户可见效果 |
|---|---|---|---|
| 1 | P1 | 5 个并发导入全部成功返回，但清单只有 1 条 | 同一物理知识库目录的导入、更新、删除共用进程内互斥锁，覆盖完整读写周期，避免索引丢更新 |
| 2 | P1 | 扫描件命中的 `filePath` 实际是 `.pdf.txt` | 检索仍读取 OCR 副本，引用路径恢复为原 PDF |
| 3 | P1 | `--- Page 2 ---` OCR 文本命中的 `page` 为 undefined；原测试名称虽说页码定位，实际上没有断言页码 | 解析 pdfkit 零起始页标记，返回从 1 开始的 PDF 页码；摘录去掉标记并按页面分段 |
| 4 | P2 | 同时传附件和路径时仍读取路径；多一个无效路径便让有效附件导入失败 | 实现已声明的附件优先语义，并同步单资料 OCR/更新数量校验 |
| 5 | P1 | 两份同名但内容不同的附件只入库第一份 | 删除文件名去重，按现有 SHA-256 内容机制判定重复 |
| 6 | P1 | 将 A 更新成已生效 B 的内容会产生重复资料 ID | 更新前检查已有生效内容，明确引导复用，保留 A 当前版本 |
| 7 | P1 | A→B→A 回滚复用旧 ID，后续删除按 ID 匹配会误选历史记录 | 回滚内容仍创建新版本，历史 ID 冲突时附加 UUID，保留可独立操作的版本身份 |
| 8 | P1 | OCR 副本越界时删除仍成功且原件已被删；更新路径缺少同等检查 | 删除前同时验证原件和副本，更新前验证原件、副本及归档路径；解析真实路径及既有父目录以检查 junction 越界 |
| 9 | P2 | 一个根目录的索引为 `{}`，整个多根检索抛错 | 各根目录独立加载，错误转为 warnings，健康根目录仍返回结果；补充 textPath 类型验证 |
| 10 | P1 | 5 个入库路由用例失败；确定性路由仍返回旧技能，扫描件 OCR 请求被不可用提示提前截断 | 入库请求优先路由到 `knowledge-ingestion-pipeline` / `knowledge_manage`，保留普通 Wiki 维护路由 |
| 11 | P1 | 类型检查报 TS7016，缺少 `pdf.worker.mjs` 声明；仅放在 opencode 包内不足以覆盖桌面编译 | 最终声明位于共享 `document_engine/pdfjs-worker.d.ts`，解析器显式引用；保留既有 worker 注入实现 |
| 12 | P1 | `git check-ignore -v` 显示 OCR 后端、新技能及 references 被忽略 | 精确放行 OCR 后端及新技能资源，继续忽略 Python 缓存；普通 Git 操作可以发现必需文件 |
| 13 | P1 | profile 中 corePaths 未覆盖 `knowledge-ingestion-pipeline`，不满足 materialize 校验 | 补入 knowledge_retrieval 路径；核心技能 11/11、总分区 29/29，未覆盖项为空 |

主要修改：Git 忽略规则、`configs/xiaoxue/rc-release-profile.json`、`packages/opencode/src/tool/knowledge-manage.ts`、`knowledge-search.ts`、`src/agent/xiaoxue-router.ts`、共享 PDF 类型声明及对应管理/路由测试。

## 首轮验证记录（历史快照，最终状态见续轮）

所有 Bun 测试和类型检查均从 `packages/opencode` 执行。

```powershell
bun test --timeout 30000 test/tool/knowledge-manage.test.ts test/tool/knowledge-system-e2e.test.ts test/tool/knowledge-retrieval-eval.test.ts test/agent/xiaoxue-router.test.ts
bun typecheck
bun script/build-node.ts
```

- 最终：79 pass、0 fail、284 次断言，4 个测试文件，约 8.46 秒。含本机既有知识库的两个只读检索用例，不写入客户资料。
- 回归测试在修复前实际出现：第一批 7 个失败；并发与页码 2 个失败；路由 5 个失败。
- 首次运行 handoff 原 46 个用例：46 个功能用例通过，但默认超时下清理 hook 失败。改用项目已有的 30 秒测试超时后，最终清理正常。没有将第一次运行描述为全绿。
- 最终类型检查退出码 0；原先 TS7016 已消除。
- sidecar 构建输出 `Build complete`，退出码 0。
- `git diff --check` 通过。LF/CRLF 提示不属于检查失败。
- 发布配置数量与 corePaths 覆盖检查通过。新资源已可被 Git 发现，但仍是未提交文件。

构建产物：`E:/software programming/opencode-dev/packages/opencode/dist/node/node.js`

SHA-256：`7242AA85F7A001992AD7176D3BFEE54475EBAF631DCF8D3F8F5FF7EB2C32AD35`

这只是开发 sidecar 产物，没有生成新的 EXE 安装包。

## 首轮交付边界（历史快照，已完成项见续轮）

1. **提交/发布仍未完成。** 当前工作区含用户既有的多条工作线。本轮没有执行 handoff 内建议的批量提交命令。发布 materialize 默认从 HEAD 读取技能，必须先把确认归属的源码及新资源纳入发布提交，才能验证完整发布链；仅放行 ignore 不代表已经发布。
2. **双仓运行一致性未确认，需要人工验证。** 本轮仅修改当前 opencode-dev；handoff 指向的 opencode-desktop-feedback 未同步。本轮构建不能证明另一个仓库运行中的应用已生效。
3. **GUI/真实模型工具编排未确认，需要人工验证。** 应在加载修复版本的桌面应用中，用文字层 PDF 和扫描件 PDF 各做一次“导入知识库”，检查实际路由、OCR→import、分类查询、原件引用和页码。当前证据是确定性路由测试及真实解析/文件管理测试。
4. **进程锁不是跨进程或断电事务。** 同一 sidecar 内的多会话写入已覆盖；多个独立应用进程共写同一个知识库，以及文件与索引跨写入阶段的断电/磁盘故障恢复，本轮没有实现事务恢复协议。不要将并发测试通过视作这些场景已验证。
5. OCR 页码恢复依赖 pdfkit 的 `--- Page N ---` 标记，N 为零起始索引。没有标记的手工 OCR 文本仍按正文段落引用，不猜页码。原件内部印刷页码可能与 PDF 物理页序不同。
6. 记忆积累观察、84 页真实 OCR 重跑、桌面语音/UI 的既有改动、签名及安装/升级/卸载生命周期，本轮未重新验收。

建议下一轮先逐文件确认本轮及原有变更归属，形成可发布提交；随后对齐实际启动仓库，在该版本上完成桌面对话验收和安装包验证。

## 续轮：数据一致性、双仓同步及桌面验证

### 新增修复

| 编号 | 优先级 | 修复前复现 | 最终处理 |
|---|---|---|---|
| 14 | P1 | 导入 good.txt 后解析 bad.pdf 失败，清单为空但文件扫描能检索到 good.txt | 批量文件全部读入并校验后统一写入，校验失败不提前落盘 |
| 15 | P1 | 把 index.json.tmp 设为目录模拟索引写入失败，更新/删除报错后原件已丢失 | 新文件使用排他创建并同步磁盘；归档/删除保留可逆操作；索引发布失败按逆序恢复文件。删除成功后清理暂存，失败则在回执明确列出残留路径 |
| 16 | P2 | A→B→A 后重新导入 A，错误提示“与已归档版本相同” | 优先复用已生效的内容记录，只有没有生效版本时才阻止归档内容重新导入 |

这三个回归用例在修复前全部失败，修复后通过。磁盘失败用真实文件系统目录冲突触发，没有模拟底层文件 API。

共享 PDF worker 声明已从 opencode 私有目录迁到 document_engine，由 pdf_parser 显式引用；两个仓库均保留迁移前备份。根 .gitignore 有非 UTF-8 旧字节，采用保留原字节、追加精确放行规则的方式处理。

### 同步范围

确认实际启动命令来自 `E:/software programming/opencode-desktop-feedback`。同步前将该仓文件与首轮修改前备份比较；两个路由文件仅存在换行差异，其他选定文件与备份相同。定向同步后，下列 9 个文件逐字节相同：

- `.opencode/.gitignore`
- `configs/xiaoxue/rc-release-profile.json`
- `packages/opencode/src/tool/knowledge-manage.ts`
- `packages/opencode/src/tool/knowledge-search.ts`
- `packages/opencode/src/agent/xiaoxue-router.ts`
- `packages/opencode/test/tool/knowledge-manage.test.ts`
- `packages/opencode/test/agent/xiaoxue-router.test.ts`
- `document_engine/parsers/pdf_parser.ts`
- `document_engine/pdfjs-worker.d.ts`

根 .gitignore 各自追加了同一条声明文件放行规则，没有全文件互相覆盖。保留 feedback 的其他业务、桌面、SDK 和文档导出改动。

同步前备份：feedback 根目录 `artifacts/codex-review-20260908-before/`；共享声明迁移前备份：两仓各自 `artifacts/codex-review-20260908-types-before/`；桌面资源生成前备份：feedback 根目录 `artifacts/codex-review-20260908-resources-before/`。

### 运行观察

已在独立数据目录 `E:/software programming/opencode-dev/artifacts/review-20260908-desktop-profile/` 启动 feedback 桌面构建，不使用客户知识库和会话库。日志确认 `desktopTestProfile: true`、`server ready`，数字人窗口成功显示，首次启动流程完成。未调用真实模型或传输客户文件。

后续窗口自动化返回 `window is not a usable app window`，刷新窗口列表后无可用目标，因此知识库页面交互尚未验收。测试主进程按本轮保存的 PID 和明确调试端口核验后停止，没有按进程名批量结束其他应用。

### 仍需验收

- 真实模型完成文字层 PDF / 扫描件 PDF 的对话式入库、分类查询及原件页码引用，未确认，需要人工验证。
- 本轮补上可捕获写入错误的回滚，但没有实现跨进程锁或断电后持久事务日志恢复，不将其描述为完整事务数据库。
- 正式发布提交、签名安装包及安装/升级/卸载生命周期尚未执行。
- 原始 handoff 所述记忆积累及其他桌面工作线未追加业务验收。

### 续轮最终验证结果

| 验证项 | 结果 |
|---|---|
| opencode-dev：4 个相关测试文件 | 82 pass / 0 fail，295 次断言 |
| opencode-desktop-feedback：同一测试集合 | 82 pass / 0 fail，295 次断言 |
| 两仓 packages/opencode 的 bun typecheck | 均退出码 0 |
| feedback packages/desktop 的 bun typecheck | 退出码 0，共享 worker 类型声明已覆盖 |
| 两仓 Node sidecar 构建 | 均通过 |
| feedback 完整 Electron 桌面构建 | 通过，最终源码重建后再次通过 sidecar runtime smoke test |
| 定向同步文件内容检查 | 9 个文件逐字节一致 |
| Git 空白错误检查 | 当前仓库及 feedback 本轮修改文件均通过 |
| 独立启动 | sidecar ready + 数字人显示；完整知识库 GUI 流程未验收 |

最终桌面构建日志：`artifacts/review-20260908-continuation/final-desktop-build.log`（opencode-dev 根目录）。构建有既有的 eval、浏览器 Node 模块 externalization 和分包提示，因此“构建通过”不代表这些模块已完成运行验收。

最终开发产物 SHA-256：

```text
opencode-dev/packages/opencode/dist/node/node.js
EC0457D5AD2294A3C057F3D5FF998B1E685F9BD11A0864813977E20D009FDAE9

opencode-desktop-feedback/packages/opencode/dist/node/node.js
F4376B683DF71A451F66811675CDC686D65E38E8F4E44CF47E6562999AF2D92C

opencode-desktop-feedback/packages/desktop/out/main/index.js
19D7292D21E1C2172650E1601508A12C6ED43026BFCAA64BF8B7091C5C680A8D
```

两仓整包构建哈希不同属预期：分支标识、构建时间和其他工作线源码并不相同。只声明定向同步文件一致，不声明两个仓库整体一致。依旧没有生成或签署客户安装包，也没有创建发布提交。

## 第三轮（吴八哥承接）：技能白名单修复、真实对话验收、分批提交

### 新增修复

| 编号 | 优先级 | 修复前复现 | 最终处理 |
|---|---|---|---|
| 17 | P1 | 对话式入库时智能体报 `knowledge-ingestion-pipeline 不在当前可用 Skill 列表中`，回退加载 knowledge-management | server 全局技能列表有该技能（30 个），但 agent.ts 中 primary 与 knowledge 两个 agent 的 `skill: {"*":"deny"}` 白名单漏登；两处补 `"knowledge-ingestion-pipeline": "allow"`，同步双仓。office/document agent 按最小权限不加 |

### 真实对话式端到端验收（此前未完成项，已补齐）

方法：CDP 捕获渲染进程鉴权头 → 直连运行中 server API（http://127.0.0.1:5879）创建会话 → `prompt_async` 发真实消息驱动完整智能体管线（真实模型 MiniMax-M3）。验收后测试记录已删除，知识库仅剩 QSY01018.3 生产资料。

| 验收项 | 结果 | 证据 |
|---|---|---|
| 入库路由（修复 #10） | ✅ | `xiaoxue_route → completed`，路由到 knowledge agent + knowledge_manage + knowledge-ingestion-pipeline |
| 文字层 PDF 对话式入库 | ✅ | KN-908CCBDD2CA3 入库（已清理）；索引/文件/段落均正确 |
| 扫描件两步入库（OCR→import） | ✅ | RapidOCR 提取"录井工程扫描件验收标准/综合录井仪应连续记录全烃组分"→ KN-E4AE9D0077AD 入库，textPath 落盘（已清理） |
| 内容合规审查 | ✅ | 智能体发现测试件与"标准"分类不符，主动发 question 拒绝盲导入（流程铁律生效） |
| 对话式检索 + 原件引用 + 页码 | ✅ | knowledge_search 命中返回原件 PDF 路径（非 .txt）、1 起始页码（44/80/66 页）、摘录、评分 |
| 技能加载（修复 #17 后） | ✅ | `skill → completed`，五环节 + references 路径准确复述 |

### 分批提交（此前未完成项，已执行）

4 个提交（feedback 仓，均含完整验证）：
- `f128b2719f` feat(knowledge): scanned-PDF ingestion pipeline with OCR fallback（管线核心 + 82 测试）
- `d3ada0125c` feat(pdfkit): unified OCR backend with bundled RapidOCR
- `34cb37f2ce` feat(xiaoxue): standardized knowledge ingestion pipeline skill（技能 + 配置 + 资源）
- `d9cf3bb362` fix(desktop): stability and UX fixes from acceptance rounds（EPIPE/折叠/拖拽/设置/知识库页）

提交前验证：82/82 测试 + typecheck 通过。**63 个文件按归属保留未提交**：用户既有语音/UI 工作线（xiaoxue-pet/*）、模型注册工作线（custom-provider/model-registry/reasoning-model）、SDK 行尾噪音（v1 gen + v2 非 gen，`--ignore-cr-at-eol` 无实质差异）、docs 与诊断脚本。未推送。

### 仍待完成

- 客户安装包：签名、安装/升级/卸载生命周期验证未执行（发布决策）
- 未推送远端；opencode-dev 仓改动仍未提交
- 剩余 63 文件的归属确认与提交（用户既有工作线，需用户决策）
