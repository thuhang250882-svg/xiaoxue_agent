# RC6 Skill Center 迁移交接

更新时间：2026-08-21
当前结论：高级 Skill Center Core 已完成并通过开发版 Desktop 实机验收；当前分支不是 RC，不含安装包。

## 1. 从哪里接手

- 仓库：`E:\software programming\opencode-dev`
- 当前隔离 worktree：`E:\software programming\opencode-dev-rc6-skill-center`
- 分支：`rc6-skill-center`
- 基线：`rc6-model-e2e` / `270e0af3736782bea88b91a6bca4b162be7118eb`
- 当前产品版本：`0.8.0-rc.6`
- 正式迁移报告：`docs/release/rc6/rc6-skill-center-migration-2026-08-21.md`
- GUI 证据：`docs/release/rc6/evidence/skill-center-gui/`

分支谱系必须保持：

```text
rc6-release-base
  → rc6-model-base
  → rc6-registry-recovery
  → rc6-model-e2e
  → rc6-skill-center
```

不要把主 `dev`、主 worktree index 或历史 RC6 分支当作可清理对象。后续工作应继续在独立 worktree/分支完成。

## 2. 已完成内容

### Domain / Core

- 统一 `Skill.Info`：来源、能力、启停、健康和诊断是规范字段。
- 支持 CRUD、启停持久化、校验、健康、冲突和 quarantine 安全导入。
- 来源优先级和权限：bundled/remote 只读，user/project 可写；未知权限在 App 兼容边界 fail closed。
- 修复 `Global.Path.config` 位于 home 外时被误判为 project 的实机缺陷。

### HttpApi / App / Desktop

- HttpApi 提供完整 Skill 管理端点并映射结构化错误。
- 已执行 `packages/client` 的 `bun run generate`，生成目录无净差异。
- App 已有清单、搜索、来源/启停/健康筛选、详情、编辑、安全导入和旧记录防御性规范化。
- Desktop 同步只移除 bundled 旧镜像/孤立入口，保留用户 Skill。

### 提交

```text
53ea588412 feat(opencode): add advanced skill lifecycle
b0359a2d03 feat(opencode): expose skill management api
10ca2246a7 feat(app): add advanced skill center
ac19207f43 fix(desktop): preserve user skill ownership
```

报告与证据将在其后的文档提交中。

## 3. 已通过验证

```text
OpenCode Skill: 57 pass, 0 fail, 202 assertions
HttpApi:         9 pass, 0 fail, 55 assertions
App compatibility: 7 pass, 0 fail, 23 assertions
App browser:    30 pass, 0 fail, 69 assertions
Desktop Skill:  3 pass, 0 fail, 5 assertions
typecheck: packages/opencode, packages/app, packages/desktop 全通过
```

150 Skill 性能：discovery 606.16 ms，refresh 63.15 ms，500 次搜索 3.12 ms，heap 增量 10.74 MB。

开发版 Desktop 同 worktree GUI 已验证：

- bundled/user 权限差异；
- 来源搜索；
- 非法本地导入拒绝；
- 合法导入预检与安装；
- 43 → 44 且完全退出重启后仍存在；
- 缺 description 的 warning health；
- 禁用状态跨重启持久化并可重新启用；
- 同优先级来源冲突显示 `SKILL_SOURCE_CONFLICT`。

## 4. 当前卡点与不能误判的边界

1. **打包资源完整性仍未关闭。** 用户此前遇到“skills 文件数量不一致”。本任务明确禁止生成安装包，因此本分支没有关闭 packaged resource gate。
2. **这不是 RC。** 没有 installer、签名、干净机、升级/卸载或 rollback 证据。
3. **业务 Skill 未迁移。** Knowledge Distill、标书、合同等功能不在本轮范围，不要借此分支扩展。
4. **开发环境警告。** Desktop dev 日志中的 `@opencode-ai/plugin@local` 后台依赖安装失败需要发布环境复核，但不影响本次 Skill Center 验收结论。
5. **主 dev 是用户工作区。** 交接时主 `dev` HEAD 为 `b05ad01202b43b9e73d19902c428312f116ea49b`，状态有 221 条、index 有 7 个路径；这些都不是本分支的清理目标。

## 5. 推荐下一步

只在用户批准后继续：

1. 评审 `rc6-skill-center` 的 4 个逻辑提交与文档提交。
2. 从评审通过的 RC6 集成点新建独立发布治理分支；不要在主 `dev` 上直接操作。
3. 在发布分支单独定位并关闭 packaged `skills` 数量完整性校验，重新验证 bundled/user Skill 边界。
4. 之后才执行 packaged Desktop、签名、干净机 install/upgrade/uninstall；所有通过后才讨论 RC candidate。

## 6. 快速复验命令

```powershell
cd 'E:\software programming\opencode-dev-rc6-skill-center\packages\opencode'
bun test test/skill/skill.test.ts test/skill/skill-performance.test.ts test/tool/skill.test.ts
bun test test/server/httpapi-instance.test.ts
bun typecheck

cd '..\app'
bun test --preload ./happydom.ts ./src/utils/skill-client.test.ts
bun run test:browser
bun typecheck

cd '..\desktop'
bun test src/main/skills.test.ts
bun typecheck
```

若修改公共 Server `HttpApi`，必须回到 `packages/client` 执行 `bun run generate`，不能手工编辑生成目录。
