# Model Resolution and Business Workflow Closure

## 结论

`READY_TO_MERGE_DEV`

已修复“安装后模型为空；新增一个模型时，之前删除的测试模型又全部出现”的根因。首次安装不再展示公共互联网模型或接入向导；用户通过直接自定义表单新增模型后，只显示自己添加的模型。真实 Desktop 隔离验证中，重启前后模型列表都只有 `glm-5.3-flash`，历史测试模型没有复活。

## 1. 根因

模型删除发生在 `models-registry.json`，但旧 `opencode.json` / `opencode.jsonc` 的 `provider.models` 仍可能保留测试模型定义。随后第一次新增模型触发 Provider 重建时，`importLegacyConfigModels()` 会再次把这些旧定义导入 Registry，因此出现“删除过的模型复活”。

## 2. 修复语义

实际文件：`packages/opencode/src/provider/model-registry.ts`

- Registry 新增持久化标记 `legacyImportCompleted`。
- 用户创建第一个自定义模型时，立即关闭后续隐式 legacy import，防止新增动作把旧测试模型带回来。
- 正常首次兼容迁移仍允许把 legacy 模型导入一次，随后持久化完成标记。
- 删除模型时，同时从全局 `opencode.jsonc`、`opencode.json`、`config.json` 的对应 `provider.models` 中删除定义，并保留 tombstone，阻止新 Registry 再次复活。
- 删除只触及目标模型；provider 的 `npm`、options 和同 provider 的其他模型保留。
- 旧版 Registry 没有新标记时，如果已经存在无 `legacyRef` 的自建 custom 模型，会推导为迁移已完成，升级后不会复活旧模型。
- stable key、bindings、sourceId 方向、Session 历史模型元数据和 Registry-to-Provider 架构未重构。

## 3. 互联网 API 接入向导边界

- 公共 `opencode` provider 无论来自 custom、api 或 config，都从可配置模型列表过滤。
- 删除剩余“免费模型”标题和公共 provider 发现入口。
- runtime provider onboarding wizard 及供应商推荐入口保持移除状态。
- 保留直接自定义 OpenAI-compatible 表单，供用户自行填写 provider、endpoint、model ID 和密钥。
- 没有写入、记录或提交任何真实 API key。

## 4. 回归证据

Model Registry：`55/55 PASS`，其中新增覆盖：

- 首次创建自定义模型关闭 stale legacy import。
- 旧 Registry 缺少新字段但已有自建模型时，不恢复旧测试模型。
- 删除 legacy 模型会同步清除旧配置定义。
- 删除 Registry 后重新迁移，也不会恢复已删除目标；未删除的同 provider 模型仍可正常迁移。

App provider/onboarding/knowledge/menu focused：`21/21 PASS`。

最终代码审查补充修复后，该组为 `21/21 PASS`：V2 模型选择器只对确属公共 OpenCode 免费模型的条目显示“免费”标签，自行添加的模型不再被无条件误标；残留的 `free-models` 容器语义也已移除。

五包 typecheck：core、session-ui、app、desktop、opencode 全部 PASS。

Desktop production build与 sidecar smoke：PASS。

App unit：`824/824 PASS`；App browser：`41/41 PASS`。

HttpApi 本机三模式（coverage、auth、effect）均为 `228/228 PASS`；GitHub Linux source CI 同样三次得到 `pass=228 fail=0 skip=0 missing=0 extra=0`。Windows 主测试 `3521/3521 PASS`，Linux 主测试 `3664/3664 PASS`；Windows E2E 最终 `97 passed`（1 个用例重试后通过），Linux E2E `98 passed`。

## 5. 真实 GUI 验收

使用隔离 profile `packages/desktop/.tmp-gui-gate-20260831-real`：

1. 初始模型列表不包含公共互联网模型。
2. 通过自定义入口添加并调用 `glm-5.3-flash` 成功。
3. 模型选择器只显示该自定义模型和“管理模型”。
4. 完整重启 Desktop 后仍只显示该模型，历史测试模型没有出现。
5. 同一模型完成真实 DOCX 地质审核、知识导入、即时查询和重启后再次查询。

## 6. 最终代码审查

审查覆盖模型持久化、legacy JSON/JSONC 删除、升级兼容、provider 过滤、Node/renderer 构建边界、数据库兼容迁移、地质工具权限和最终测试差异。

- P0：0。
- P1：0。
- P2：审查发现 1 个并已修复，当前未关闭数量为 0。
- 未发现新的可操作代码审查意见。

## 7. 提交与分支状态

- 主要闭环提交：`238cb54208` — `fix(xiaoxue): close runtime and model persistence gates`。
- 最终审查修复：`e98cd6599b` — `fix(app): label only free models`。
- Windows CI 清理稳定化：`8ec0ed825f` — `test(ci): isolate Windows attention suite`。
- Linux CI 性能基准隔离：`31d799d59f` — `test(ci): isolate Linux skill benchmark`；性能门槛保持不变，仅避免共享进程的累计堆内存污染测量。
- 性能基准测量稳定化：`cd1931553f` — `test(opencode): stabilize skill memory benchmark`；连续强制 GC 后取保留堆低水位，256 MB 门槛保持不变；本机连续 10 次 `10/10 PASS`，保留堆增量 10.93–11.35 MB。
- Windows Model Registry 清理隔离：`d74b70c1e7` — `test(ci): isolate Windows model registry`；Model Registry 本机独立回归 `55/55 PASS`，测试逻辑未跳过。
- Linux 浏览器回归串行化：`dee4a03a5e` — `test(ci): serialize Linux browser tests`；Linux 98 个 E2E 用例保留完整范围，仅从 3 workers 调整为 1 worker，30 分钟上限不变。
- HttpApi 跨平台门禁稳定化：`30dfd77f9f` — `test(opencode): stabilize HttpApi gate`；Windows PTY 使用受控 `cmd.exe` 命令，临时目录改用 `os.tmpdir()`，worktree reset 等待真实列表可见，并为完整 Linux HttpApi 步骤设置 15 分钟上限；路由与断言没有跳过。
- 受测源码 HEAD：`30dfd77f9f73df1af048be5ad3443a8a126acc3c`；GitHub source CI run：`34032097353`，Windows/Linux unit 与 E2E 全部成功。
- 同一源码提交的其他门禁：nix-eval run `34032097332`、typecheck run `34032097336`、storybook run `34032097356`、PR standards run `34032096005`，全部成功。
- 报告提交仅增加最终证据；远端最终 HEAD 以推送结果为准。
- `dev` 未修改、未合并；保护 tag 未删除。

## 8. Merge decision

`READY_TO_MERGE_DEV`
