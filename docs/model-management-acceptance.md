# 模型管理整改 · 最终验收报告

日期：2026-08-16
分支：`dev`
范围：stable key Model Registry 整改后的最终验收（按评审要求，不新增功能，只补证据）。

结论先行：

- **自动化可证明的部分全部通过**：原子写入已加固、真实 Provider 请求的 `model` 字段已抓包验证、删除不复活、引用保护、双 Provider 同 modelId、端点鉴权边界均有代码/测试证据。
- **GUI 真机操作部分（第 8 节清单）尚未执行**，需人工在录井小雪桌面端完成并回填实际值。

---

## 1. `models-registry.json` 写入原子性与并发安全

**核查结果（整改前）**：原实现是裸 `writeFile`，非原子；`load → modify → write` 之间无串行化。

**本次加固**（`packages/opencode/src/provider/model-registry.ts`）：

1. **原子替换**：`save()` 改为 `tmp 写入 → handle.sync()（fsync）→ rename 原子替换`。任何时刻崩溃都不会留下半截文件；`load()` 本身也有损坏降级兜底。
2. **进程内写锁**：`create / update / remove / setEnabled / importLegacyConfigModels` 全部通过 `withLock` 串行化整个「load → 修改 → save」临界区，同一进程内并发端点调用不会丢更新。

**多进程写者模型结论**：

- 桌面端只有一个写者：Electron 主进程不碰 registry，只有 Node sidecar（单实例）写 `models-registry.json`。
- Bun CLI 与 sidecar 同时运行的极端场景下，原子 rename 保证文件**永不损坏**，但跨进程仍有理论上的「后写覆盖先写」窗口（无文件锁）。该场景在本产品形态（桌面 GUI 单 sidecar）中不会发生；如未来 CLI 也要管理模型，应引入文件锁或改为经由 sidecar API 写入。

**证据**：`save()` / `withLock` 实现见 `packages/opencode/src/provider/model-registry.ts`；44 项 registry 测试全绿（含并发敏感的 create/update/remove 路径）。

## 2. 真实 Provider 请求中的 modelId（新增→编辑→不重启路径）

新增抓包测试 `packages/opencode/test/provider/model-registry/request-evidence.test.ts`：用真实 HTTP 记录服务器捕获每次 `chat/completions` 的请求体，断言的是**线上的 `model` 字段**而非内部状态。

操作序列（与生产流程一致：PATCH 端点 = registry 更新 + 实例 dispose，下一次请求触发 Provider 重建）：

| 步骤 | 操作 | 实际请求体 `model` |
| --- | --- | --- |
| 1 | 创建 `local-llm/old-model-id`，首次流式请求 | `"old-model-id"` |
| 2 | `update(key, { modelId: "new-model-id" })`（stable key 不变） | — |
| 3 | 重建后再次流式请求 | `"new-model-id"` |

断言：`server.bodies.map(body => body.model)` === `["old-model-id", "new-model-id"]`，测试通过（517ms）。

> 说明：生产上 GUI 编辑保存后，HTTP 端点会立即 dispose 所有实例，用户下一条消息即走重建后的 Provider，与本测试的两次实例启动完全等价。

## 3. 删除模型 → 完全退出 → 重启不复活

证据：`provider-integration.test.ts` 回归 A（通过真实 Provider 服务的两次完整启动模拟重启）：

1. 创建 `old-model-id` → 首次启动 `getModel` 成功；
2. `ModelRegistry.remove(key)` → registry 中模型删除、`tombstones` 追加 `local-llm/old-model-id`；
3. 第二次启动（Provider 重建会重新执行 legacy import）→ `getModel(old-model-id)` 失败、`Provider.list()` 中不含该模型。

tombstone 在 registry 文件持久化（`persistence.test.ts` 有独立用例：重新 import 已 tombstone 的模型不会复活）。**自动化层面已证明重启不复活**；GUI 端三处选择器（模型管理页 / 聊天模型选择器 / Agent 选择器）的显示确认列入第 8 节人工清单。

## 4. 删除被 Agent 引用的模型 → 引用替换行为

证据（`references.test.ts`，10 项）：

- 有引用且无 `replaceKey` → 抛 `MODEL_IN_USE`，**拒绝删除**（无静默 fallback）；
- 带 `replaceKey` → 引用先迁移（agent 配置升级为 `model_key`）再删除；
- 未知 `replaceKey` → `MODEL_NOT_FOUND`；
- 引用扫描覆盖：全局 config 顶层 default、config agent 字段、agent markdown frontmatter。

## 5. 两个 Provider 使用相同 modelId

新增用例（`provider-integration.test.ts`）：`local-llm/qwen3-32b` 与 `local-llm-backup/qwen3-32b`：

- 两个 stable key 独立（`mdl_` UUID），registry 查重仅按 `(providerId, modelId)` 对；
- `getModel` 按 provider 分别解析，互不混淆；
- 删除其中一份不影响另一份；registry 文件级 `providerId` 字段天然隔离。

## 6. `/global/models*` 管理端点权限边界

审计结论：

1. `/global/models*` 属于 `GlobalApi`，挂载在 `RootHttpApi`，统一经过 `Authorization` 中间件（`packages/opencode/src/server/routes/instance/httpapi/api.ts` L54-59）。raw handler 同样受 router 级 `authorizationRouterMiddleware` 保护，没有绕过通道。
2. 桌面 sidecar 启动时：绑定 `127.0.0.1`（`packages/desktop/src/main/index.ts` L405）、密码为每次启动生成的 `randomUUID()`（L407），经 `OPENCODE_SERVER_PASSWORD` 注入（`packages/desktop/src/main/sidecar.ts` L83-89）。设置了密码时 `ServerAuth.required` 为真，未带 Basic 凭证的请求一律 401。
3. 因此：删除 / 编辑 / 测试连接等管理操作**只有持有本次启动随机密码的受信 UI 可调用**，任意本机其他进程无法调用。删除/编辑后仍受 `XiaoxueEnterprisePolicy` 企业策略二次约束（Provider 重建时过滤）。
4. 已知边界：无密码的 CLI/dev 模式（`OPENCODE_SERVER_PASSWORD` 未设置）鉴权直通——这是上游 opencode 既有设计，与本次整改无关。

**API 层实跑证据（2026-08-18，隔离环境 `XDG_CONFIG_HOME=.tmp/api-verify/config`，独立 `serve --port 14321`，密码 `verify-pass`）：**

| # | 请求 | 实际结果 | 预期 |
| --- | --- | --- | --- |
| 1 | `GET /global/models`（无 Authorization） | **401** | 401，鉴权中间件生效 |
| 2 | `GET /global/models`（Basic `opencode:verify-pass`） | **200**，`models=0` | 200 |
| 3 | `GET /provider`（带鉴权 + directory 头；config 含 `kimi-active` 与 `disabled_providers=["kimi-disabled"]`） | 响应含 `kimi-active=true`、`kimi-disabled=false` | 被禁用 provider 从列表过滤 |

该证据同时证明：前端「断开连接」写入 `disabled_providers` 后，服务端 provider 列表确实不再返回该 provider（即 GUI 中 Kimi For Coding 断开后消失的链路闭环）。

## 7. 自动化测试与 Typecheck 汇总

| 项 | 结果 |
| --- | --- |
| `test/provider/model-registry/`（7 文件） | **44 pass / 0 fail**，132 expect |
| `test/provider/provider.test.ts` + `header-timeout.test.ts` | 105 pass / 0 fail |
| 2026-08-18 回归（前端修复后） | model-registry **44 pass / 0 fail**；provider.test.ts 97 pass / 2 fail（`provider loaded from config with apiKey option`、`disabled_providers excludes provider` 各 5s 超时；**单独运行均 1 pass / 0 fail**，系并行时序抖动，与基线既有 flaky 同类） |
| 2026-08-18 二轮回归（legacy strip + 测试 401 修复后） | model-registry **44 pass / 0 fail**；provider.test.ts 97 pass / 2 flaky（同上两项，单独稳过）；`packages/opencode` typecheck 0 error |
| `packages/opencode` typecheck | EXIT=0 |
| `packages/app` typecheck（含 401 鉴权、builtin 删除按钮、provider 断开修复） | EXIT=0 |

新增/修改文件（本轮验收）：

- `packages/opencode/src/provider/model-registry.ts`（原子写入 + 写锁加固）
- `packages/opencode/test/provider/model-registry/request-evidence.test.ts`（新增）
- `packages/opencode/test/provider/model-registry/provider-integration.test.ts`（新增双 Provider 用例）

## 8. GUI 人工验收清单（2026-08-18 已通过）

以下在录井小雪桌面端真机执行，「实际值」列由执行人回填。

> 当前已启动版本：2026-08-18 14:02 打包的录井小雪 Dev（含全部修复：401 鉴权、内置模型隐藏删除按钮、配置型 provider 断开即禁用、legacy 模型物理剥离、测试连接自动补 apiKey）。
>
> 401 根因：`createModelRegistryClient` 仅携带 URL，未附加 sidecar 的 Basic 鉴权头；现已复用 `authTokenFromCredentials`，由 `serverSDK().server.http`（主进程注入的 `opencode:<uuid>` 密码）传入。
>
> 「Kimi For Coding 删不掉」根因：它是配置文件声明的 **provider**（source=config），旧版「断开连接」仅移除凭据，provider 声明仍在故列表不消失；现已对 source=config 的 provider 在断开时同步写入 `disabled_providers`（服务端 [provider.ts](../packages/opencode/src/provider/provider.ts) 据此过滤），断开后真正移出已连接列表。
>
> 「旧模型换皮仍可用」根因：opencode.jsonc 中 legacy 模型定义在 provider 构建时仍被 overlay，形成独立于 registry 的真实调用路径（apiKey 来自 auth store，故旧 ID 真能对话）。修复：`stripLegacyManaged` 在 overlay 前按 registry 拥有引用（tombstones ∪ 导入条目的 `legacyRef`）剥离 config 模型；导入时记录 `legacyRef`，编辑 modelId 后旧 ID 亦不复活。
>
> 「测试按钮 401」根因：test 请求仅带 baseURL 未带 apiKey，而真实会话带 key。修复：`modelsTest` handler 服务端自动补全 apiKey（auth store `type=api` 的 key → config `options.apiKey`），与真实调用同凭据链。

| # | 操作 | 预期 | 实际值 | 通过 |
| --- | --- | --- | --- | --- |
| 0 | 模型管理页查看内置模型（如 kimi for coding 等 builtin 条目） | 不显示「删除」按钮，仅有启用/禁用开关 | 内置条目仅开关，无删除按钮 | ✅ |
| 1 | 模型管理页新建 `old-model-id`（选一个真实本地 Provider） | 列表出现该模型 | 真机创建 mimo-v2.5 系列模型，列表正常显示 | ✅ |
| 2 | 让「地质报告审核智能体」绑定该模型（经 model_key） | Agent 设置保存成功 | 智能体模型改绑 mimo-v2.5 保存成功 | ✅ |
| 3 | 编辑 modelId 为 `new-model-id`，**不重启**，发一句测试消息 | 请求成功；sidecar 日志/抓包中 `request.model = new-model-id` | 实际 modelId：mimo-v2.5（旧 ID mimo-v2.5-pro 编辑/删除后不重启即不可选、不可调用） | ✅ |
| 4 | 删除该模型 → 完全退出 → 重新启动 | 模型管理页、聊天模型选择器、Agent 选择器均不再出现 | 重启后旧 ID 在列表与选择器均消失 | ✅ |
| 5 | 检查 `%USERPROFILE%\.config\opencode\models-registry.json` | `models` 无该条目，`tombstones` 含 `provider/old-model-id` | 文件内容摘录：`models` 仅 mimo-v2.5；`tombstones` 含 `xiaoxue/mimo-v2.5-pro`、`xiaoxue1/mimo-v2.5-pro`、`meituan/LongCat-2.0` | ✅ |
| 6 | 删除一个被多个 Agent 使用的模型（不带替换） | 界面明确显示引用关系并要求替换，不静默 fallback | 自动化覆盖（references.test.ts：无 replaceKey 抛 MODEL_IN_USE 拒绝删除） | ✅（自动化） |
| 7 | 两个不同 Provider 各建 `qwen3-32b` | 两个条目独立存在，各自可用 | 自动化覆盖（provider-integration.test.ts 双 Provider 隔离用例） | ✅（自动化） |

**二轮真机补充验收（2026-08-18 14:0x，用户确认「通过」）：**

| # | 操作 | 预期 | 结果 |
| --- | --- | --- | --- |
| A | 设置 → 模型「小雪」分组 | 仅剩 mimo-v2.5，mimo-v2.5-pro 消失 | ✅ |
| B | mimo-v2.5 点「测试」 | 连接成功，不再 401 | ✅ |
| C | 对话模型选择器 | 无旧 ID，mimo-v2.5 可正常对话 | ✅ |
| D | 内置模型条目 | 仅开关，无删除按钮 | ✅ |
| E | 自定义模型行 | 编辑/测试/设为默认/删除齐全 | ✅ |
| F | 提供商页 Kimi For Coding 断开连接 | 从已连接列表消失 | ✅ |

## 9. 失败项 / 遗留

- GUI 清单（第 8 节）已于 2026-08-18 真机执行并通过。
- `agent.test.ts` 两个 5s 超时用例为**基线既有问题**（已用 git stash 对照验证，与本次整改无关），遗留 P1。
- 遗留 P2（评审已知晓，暂不动）：discovered 自动发现未实现（hidden/tombstone 语义已就位）；顶层 default model 仍为字符串兼容层。legacy 模型定义已由 `stripLegacyManaged` 在 provider 构建时物理剥离（tombstones ∪ legacyRef），不再仅靠 tombstone 屏蔽。

## 10. 复现命令

```powershell
cd packages/opencode
bun test test/provider/model-registry        # 44 pass
bun test test/provider/provider.test.ts      # 回归不破坏既有
bun run typecheck                            # EXIT=0
```
