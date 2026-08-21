# RC6 高级 Skill Center 迁移与兼容修复报告

日期：2026-08-21
状态：已完成迁移与开发版 Desktop 实机验收；这不是 RC 候选，也未生成安装包。

## 1. 基线与隔离边界

- 版本谱系：`rc6-release-base → rc6-model-base → rc6-registry-recovery → rc6-model-e2e → rc6-skill-center`
- 工作分支：`rc6-skill-center`
- 隔离 worktree：`E:\software programming\opencode-dev-rc6-skill-center`
- 基线提交：`270e0af3736782bea88b91a6bca4b162be7118eb`（`rc6-model-e2e`）
- 产品版本：`0.8.0-rc.6`
- 主 `dev`、主 worktree index、既有 RC6 分支均未被本工作流修改。
- 本轮只迁移 Skill Center Core；未迁移或扩展 Knowledge Distill、标书、合同等业务 Skill。

## 2. 逻辑提交

| 提交 | 内容 |
| --- | --- |
| `53ea588412` | `feat(opencode): add advanced skill lifecycle` |
| `b0359a2d03` | `feat(opencode): expose skill management api` |
| `10ca2246a7` | `feat(app): add advanced skill center` |
| `ac19207f43` | `fix(desktop): preserve user skill ownership` |

相对 `rc6-model-e2e`：21 个源文件，新增 3,808 行、删除 57 行；证据与本报告另行提交。

## 3. 实现结果

### B1：Domain

- `Skill.Info` 统一提供 `name`、`description`、`location`、`source`、`capabilities`、`enabled`、`health`、`diagnostics`，同时保留已有可选字段。
- 来源覆盖 `bundled`、`user`、`project`、`remote`；能力由来源派生，软件内置和远端来源保持只读。
- 完成创建、编辑、重命名、删除、启用、禁用、校验、健康诊断、来源优先级、同优先级冲突和安全导入。
- 启停状态持久化到 `xiaoxue.skills.disabled`。
- 本地导入先进入 quarantine，校验名称、路径穿越、压缩包边界、文件数量/体积、静态脚本/提示注入和疑似密钥风险，再原子安装。
- 修复实机发现的来源分类缺陷：当 `Global.Path.config` 位于 home 之外时，配置目录 Skill 仍必须判为 `user`，不能误判为 `project` 并被企业策略拦截。

### B2：Server / HttpApi / Client

- 增加 Skill 列表、创建、编辑、删除、导入预检/确认、启停、校验、健康和冲突端点。
- 领域错误映射为结构化 HttpApi 错误；变更响应重新执行 `inspect`，返回最终健康与诊断状态。
- 已在 `packages/client` 执行 `bun run generate`；生成目录最终无未提交差异，未手工编辑生成代码。

### B3：App

- 新增高级 Skill 清单、搜索、来源/启停/健康筛选、详情、编辑和安全导入界面。
- 客户端兼容边界会规范化旧记录；缺失或未知权限一律 fail-safe 为不可编辑、不可删除、不可启停。
- 未知来源显示为 `unknown`；缺失健康/诊断生成兼容警告，不让旧记录导致页面崩溃。
- 搜索覆盖名称、描述、来源、健康状态和启停状态。

### B4：Desktop

- 启动同步只清理软件内置 Skill 的旧镜像和托管根目录中的孤立 `SKILL.md`，保留用户自己创建或导入的 Skill。
- 未扩大 preload、网络代理或其他 Desktop 功能。

## 4. 自动化验证

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| OpenCode Skill | `bun test test/skill/skill.test.ts test/skill/skill-performance.test.ts test/tool/skill.test.ts` | 57 pass，0 fail，202 assertions |
| HttpApi | `bun test test/server/httpapi-instance.test.ts` | 9 pass，0 fail，55 assertions |
| App 兼容边界 | `bun test --preload ./happydom.ts ./src/utils/skill-client.test.ts` | 7 pass，0 fail，23 assertions |
| App Browser | `bun run test:browser` | 30 pass，0 fail，69 assertions |
| Desktop Skill 同步 | `bun test src/main/skills.test.ts` | 3 pass，0 fail，5 assertions |
| 类型检查 | `bun typecheck`（`packages/opencode`、`packages/app`、`packages/desktop`） | 全部通过 |

150 Skill 性能样本：首次发现 606.16 ms、刷新 63.15 ms、500 次搜索 3.12 ms、heap 增量 10.74 MB。

覆盖的兼容/故障样本包括：旧记录、bundled/user/project/remote、缺失 health/diagnostics、未知 source、缺失 description、非法名称、路径穿越、恶意压缩包、脚本/提示注入、疑似密钥、同优先级冲突和启停持久化。

## 5. 同 worktree Desktop GUI 证据

验收使用同一 worktree 内的 App workspace、OpenCode node sidecar 和 Electron 开发版；隔离运行根目录未指向主 `dev`。Desktop 显示版本 `v0.8.0-rc.6`。

| 场景 | 结果 | 证据 |
| --- | --- | --- |
| Skill Center 总览与来源/权限 | 43 个初始 Skill；bundled 仅可禁用，user 可禁用/编辑/删除 | [01](evidence/skill-center-gui/01-skill-center-overview.jpg) |
| 按来源搜索 | “随软件提供”仅返回 bundled 来源 | [02](evidence/skill-center-gui/02-source-search.jpg) |
| 非法导入 | `../rc6-gui-invalid` 被预检拒绝，未写入 | [03](evidence/skill-center-gui/03-invalid-import-rejected.jpg) |
| 合法导入预检 | 展示名称、格式、文件数、大小、SHA-256 和静态风险 | [04](evidence/skill-center-gui/04-valid-import-preview.jpg) |
| 导入并重启 | 43 → 44；`rc6-gui-warning` 重启后仍可见，来源为用户，缺 description 显示警告 | [05](evidence/skill-center-gui/05-restart-persistence-and-health.jpg) |
| 禁用 | UI 立即显示已禁用并给出成功提示 | [06](evidence/skill-center-gui/06-disabled-state.jpg) |
| 禁用后重启 | 仍显示已禁用，可重新启用 | [07](evidence/skill-center-gui/07-disabled-after-restart.jpg) |
| 来源冲突 | 两个同优先级 user 候选显示错误与 `SKILL_SOURCE_CONFLICT` 诊断 | [08](evidence/skill-center-gui/08-conflict-diagnostics.jpg) |

运行日志证据见 [runtime-evidence.txt](evidence/skill-center-gui/runtime-evidence.txt)。

## 6. 实机发现并关闭的缺陷

最初合法导入文件已经写入 `Global.Path.config/skills`，但刷新和完整重启后仍只有 43 个 Skill。日志显示该文件被识别为 `project`，随后被 managed source policy 拦截。

根因是来源分类只把 `~/.config/opencode` 等 home 内路径识别为用户来源，没有把可由 XDG/桌面隔离环境重定向的 `Global.Path.config` 作为权威用户配置根。修复后重新构建 node sidecar并复测，启动日志稳定为 `init count=44`，GUI 重启、健康和启停持久化全部通过。

## 7. 未关闭项与发布边界

- 未生成 RC6 安装包，也未执行 packaged Desktop、签名、升级/卸载或干净机验证。
- 先前的“打包资源完整性校验失败：skills 文件数量不一致”不属于本分支迁移范围，本轮没有通过生成安装包来关闭；在后续发布工作流中仍是明确卡点。
- 开发环境日志有 `@opencode-ai/plugin@local` 后台依赖安装警告，不影响本轮 Skill API/GUI 验收，但发布构建前应在干净依赖环境复核。
- 未迁移业务 Skill，未修改 Knowledge Distill、合同或标书功能。
- 本分支可以作为 Skill Center 迁移评审基线；不能直接标记为 RC 或对外发布。

## 8. 结论

RC6 Skill Center Core 的 Domain、HttpApi、兼容客户端、App UI 和必要 Desktop 同步已经完成，并通过自动化与同 worktree Desktop GUI 验收。下一步应先评审/合并该分支，再由独立发布工作流处理资源完整性和 packaged lifecycle；不要在本分支继续扩业务 Skill 或生成安装包。
