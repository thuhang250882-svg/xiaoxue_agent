# 录井小雪私有化能力保护清单

## 基线与使用原则

- 原始 `dev` HEAD：`7fcc0a97a14e0d1a5162d0591064bae7f72bf575`
- 保护标签：`pre-upstream-local-merge-20260829`
- 集成分支：`integration-upstream-20260829`
- 本清单记录合并前可定位的私有化能力。融合后必须逐项复核，不得以文件仍存在代替行为验证。
- OpenCode 上游提供平台增量；录井小雪当前 `dev` 是业务能力基线。

## A. 品牌

状态：`PRESENT_BASELINE`

必须保留“录井小雪”名称、Xiaoxue 应用标识、Windows 产品信息、图标和安装器命名。

关键入口：

- `configs/xiaoxue.yaml`
- `configs/xiaoxue/identity.yaml`
- `packages/desktop/package.json`
- `packages/desktop/electron-builder.config.ts`
- `packages/desktop/resources/icons/`
- `packages/app/public/logo-xiaoxue.png`

保护约束：正式产品名仍为“录井小雪”；Windows 安装器仍使用录井小雪产品版本命名；不能退回上游 OpenCode 品牌。

## B. Agent 与业务路由

状态：`PRESENT_BASELINE`

必须保留 `office`、`report`、`tender`、`contract`、`knowledge`、`document` 六个业务 Agent 及其工具、Skill 和权限映射。

关键入口：

- `packages/opencode/src/agent/agent.ts`
- `packages/opencode/src/agent/xiaoxue-router.ts`
- `configs/xiaoxue/router.md`
- `configs/xiaoxue/office.md`
- `configs/xiaoxue/geology_report.md`
- `configs/xiaoxue/tender_review.md`
- `configs/xiaoxue/tender_bid_generation.md`
- `configs/xiaoxue/contract_review.md`
- `configs/xiaoxue/knowledge_query.md`
- `configs/xiaoxue/document_generation.md`

保护约束：上游 Agent 结构变化必须采用“新平台结构加小雪扩展”的手工融合方式，不能用单边版本覆盖路由、提示词或权限。

## C. 模型管理

状态：`PRESENT_BASELINE`

必须保留 Model Registry、稳定 `modelKey`、模型创建/编辑/删除、删除 tombstone、内置模型 disabled、发现模型 hidden、Agent `model_key` 引用、引用迁移和 Provider 重建后的缓存/overlay 一致性。

关键入口：

- `packages/opencode/src/provider/model-registry.ts`
- `packages/opencode/src/provider/provider.ts`
- `packages/opencode/src/agent/agent.ts`
- `packages/app/src/components/settings-v2/model-registry.tsx`
- `packages/app/src/utils/model-registry-client.ts`
- `packages/opencode/test/provider/model-registry/`

保护约束：修改 modelId 后稳定 key 必须解析到新值；删除模型不得在重启或 Provider 重建后复活；同 modelId 的不同 Provider 不得冲突；有引用的删除必须阻止或先完成替换。

## D. 可信附件

状态：`PRESENT_BASELINE`

必须保留以下信任链：

`Electron native picker -> TrustedAttachment 注册 -> attachmentId/受信 URL -> sidecar 校验 -> 文件读取`

关键入口：

- `packages/desktop/src/main/attachment-picker.ts`
- `packages/desktop/src/main/trusted-attachments.ts`
- `packages/core/src/util/trusted-attachment.ts`
- `packages/core/src/util/trusted-attachment-registry.ts`
- `packages/opencode/src/xiaoxue/trusted-attachments.ts`
- `packages/opencode/src/session/office-attachment.ts`
- `packages/opencode/src/tool/xiaoxue-attachments.ts`
- `packages/opencode/test/xiaoxue/reject_untrusted_file_url.test.ts`
- `packages/core/test/trusted-attachment*.test.ts`

保护约束：任意手工构造的 `file://` 不能直接读取；不得退回 cwd 安全根。D 盘、中文/特殊路径、跨盘符、UNC、过期、single-use 和 WebContents 绑定均属于强制回归范围。

## E. Office 与地质报告审核

状态：`PRESENT_BASELINE`

必须保留 `document_engine`、`domains/geology_report`、DOC/DOCX/XLS/XLSX/PDF/TXT/CSV 解析边界、结构化审核、DOCX 导出和审核历史。

关键入口：

- `document_engine/`
- `document_engine/parsers/`
- `document_engine/exporters/`
- `domains/geology_report/`
- `packages/opencode/src/tool/geology-report-review.ts`
- `packages/app/src/components/xiaoxue/ReportReviewResult.tsx`
- `packages/app/src/components/xiaoxue/BusinessReviewResults.tsx`

保护约束：Office 审核必须读取真实受信附件并提供证据位置；扫描 PDF 的 OCR 边界必须明确，不能把不可提取内容写成已审核。

## F. 知识库

状态：`PRESENT_BASELINE`

必须保留 `knowledge_manage`、`knowledge_search`、本地索引/存储、知识库 UI、来源定位和引用。

关键入口：

- `knowledge/`
- `packages/opencode/src/tool/knowledge-manage.ts`
- `packages/opencode/src/tool/knowledge-search.ts`
- `packages/app/src/pages/knowledge-library.tsx`
- `packages/app/src/components/settings-xiaoxue-knowledge.tsx`
- `packages/opencode/test/tool/knowledge-manage.test.ts`
- `packages/opencode/test/tool/knowledge-retrieval-eval.test.ts`

保护约束：只引用真实导入资料；更新保留版本关系；删除按 sourceId 约束；桌面 Node sidecar 可达路径中的 Bun-only API 必须另行完成运行时审计。

## G. Skill

状态：`PRESENT_BASELINE`

合并前 `.opencode/skills/` 有 27 个 Skill。必须保留小雪业务技能、Skill Center、Skill Catalog、企业 Skill、离线策略及真实 `skill` Tool 加载链。

关键入口：

- `.opencode/skills/`
- `packages/opencode/src/skill/`
- `packages/opencode/src/tool/skill.ts`
- `packages/desktop/src/main/skills-sync.ts`
- `packages/app/src/components/settings-v2/skills.tsx`
- `configs/xiaoxue/offline-skill-policy-allowlist.json`
- `configs/xiaoxue/rc-release-profile.json`

保护约束：打包目录、目录治理清单、运行时解析和路由数量必须一致；不得为通过离线检查扩大 allowlist。

## H. 桌面与发布

状态：`PRESENT_BASELINE`

必须保留 Electron 桌面端、2D WebP 桌宠、托盘、Python runtime、Enterprise policy、Skill sync、离线打包和签名策略。

关键入口：

- `packages/desktop/`
- `packages/desktop/src/xiaoxue-pet/`
- `packages/app/src/components/xiaoxue/pet/XiaoxueWebP.tsx`
- `packages/app/public/assets/pet/`
- `packages/desktop/src/main/python-runtime.ts`
- `packages/desktop/src/main/enterprise-policy.ts`
- `packages/desktop/src/main/skills-sync.ts`
- `packages/desktop/electron-builder.config.ts`
- `packages/desktop/script/sign-windows.ps1`

保护约束：当前桌宠是 2D WebP，禁止恢复 GLB、Three.js 或 `@react-three`。托盘必须可重新打开工作台和桌宠。Python 二进制运行时是构建产物而非 Git 源文件，发布验证必须检查实际打包资源。未获得有效 Authenticode 签名的安装包只能标记为 `TEST-ONLY`。

## I. 稳定性修复

状态：`PRESENT_BASELINE`

必须保留 Prompt History OOM 修复、Store preflight、draft/workspace payload sanitation、重复提交防护、Event DB maintenance、当前已有的事件保留/节流机制及数据库迁移。

关键入口：

- `packages/core/src/util/persisted-payload.ts`
- `packages/core/src/database/migration/20260709120000_strip_oversized_attachment_payloads.ts`
- `packages/core/src/database/migration/20260710090000_request_compaction_for_fragmented_databases.ts`
- `packages/app/src/components/prompt-input/submission-state.ts`
- `packages/app/src/components/prompt-input/submit-guard.ts`
- `packages/desktop/src/main/store-repair.ts`
- `packages/opencode/src/xiaoxue/event-db-maintenance.ts`
- `packages/opencode/script/maintain-event-db.ts`

保护约束：不得重新把大附件 base64/数据 URL 持久化进历史；数据库迁移不可删除或重排；重复提交和事件写入治理不能因上游会话重构失效。

## J. Node/Bun 双运行时

状态：`PRESENT_BASELINE_REQUIRES_POST_MERGE_AUDIT`

Electron sidecar 由 `utilityProcess.fork` 启动，因此运行在 Node，而不是 Bun。

关键入口：

- `packages/desktop/src/main/server.ts`
- `packages/desktop/src/main/sidecar.ts`
- `packages/desktop/src/main/sidecar-environment.ts`
- `packages/core/src/database/sqlite.ts`
- `packages/core/src/database/sqlite.node.ts`
- `packages/core/src/database/sqlite.bun.ts`
- `packages/opencode/src/xiaoxue/sqlite.ts`
- `packages/opencode/src/xiaoxue/sqlite.node.ts`
- `packages/opencode/src/xiaoxue/sqlite.bun.ts`

保护约束：sidecar 可达路径不能无条件依赖 `Bun.file`、`Bun.write`、`Bun.Glob`、`Bun.CryptoHasher`、`import.meta.dir` 或 `bun:sqlite`。每个融合后新增命中必须分类为 `SAFE_BUN_ONLY`、`CONDITIONAL_RUNTIME` 或 `BUG_NODE_SIDECAR`；后者必须在候选交付前修复。

## 融合后判定规则

- `PASS`：入口、行为和针对性验证均保持。
- `CHANGED_BUT_PRESERVED`：平台结构变化，但私有行为经适配与验证保持。
- `REGRESSION`：能力丢失、语义变化或产生安全/运行时缺陷。
- `NOT_TESTED`：只能定位代码或静态审查，尚无对应运行证据。

最终判定记录在 `docs/upstream-local-integration-report.md`；无法证明的项目必须写 `NOT_TESTED`。
