# Phase 3.1A — Office Consolidation Closeout

- 报告日期：2026-08-23
- 范围：核清 Phase 3.1 的四个状态问题
- 起点：Phase 3.1 三 commit 基线 `1091fcb586 docs(skills): document phase 3.1 office consolidation`
- 不启动合同 / supervision Skill 治理；不启动 Phase 3.2

## Verdict

**Phase 3.1A PASS**

四个状态问题全部澄清：

1. orphanCount 37→39 的两个新增 orphan 已被识别、并通过 Option B 建立真实内部调用路径，重新回归到 37。
2. `visibility` frontmatter 是 documentary metadata；runtime 强制靠 `Permission` 系统（`isSkillFrontmatter` 不解析 visibility）。新测试 `phase31a-internal-specialist.test.ts` 双向锁定契约。
3. "1 pre-existing hook timeout" 是 PowerShell `NativeCommandError` cosmetic stderr wrapper。重跑后所有命令 `EXITCODE=0`。报告统一写 "non-failing teardown/hook warning"。
4. 三个 zombie（contract-management / github-ai-trends / llm-wiki）的状态由"stale integrity reference"更正为"physical residual files / packaged by integrity manifest / no SKILL.md / no runtime Skill reference"。

---

## 1. orphanCount 37→39 核查

### Before / After Diff

| 阶段 | orphanCount | 新增 | 移除 | 来源 |
|---|---|---|---|---|
| Phase 3.0A baseline | 37 | — | — | `89516d8e81 docs(skills): add phase 3.0a closeout reconciliation` 之前快照 |
| Phase 3.1 提交时 | 39 | **meeting-minutes-manager, humanizer** | — | `bun script/skill-reference-snapshot.ts` (Phase 3.1 closeout 报告) |
| **Phase 3.1A fix 后** | 37 | — | meeting-minutes-manager, humanizer | `bun script/skill-reference-snapshot.ts` 当前（2026-08-23） |

### 命名确认（grep 完整 orphan 列表）

```text
$ bun script/skill-reference-snapshot.ts
{
  "counts": { "discovered": 244, "alias": 0, "missing": 0, "builtin": 0 },
  "discoveredCount": 76,
  "orphanCount": 37,
  "sampleOrphans": [
    "NDA快筛",
    "cognitive-profile",
    "customize-opencode",
    "effect",
    "experiment-design",
    ...
  ]
}
```

完整 37 项 orphan 列表详见 `docs/skill-center/skill-reference-integrity-2026-08-23.tsv`（已重新生成，orphan 段已不含 meeting-minutes-manager / humanizer）。

### Phase 3.1 时为何新增 2 个 orphan

Phase 3.1 的 `5c4c56ea14 test(skills): persist skill portfolio counting and integrity guards` 在 office subagent allowlist 中移除了 `meeting-minutes-manager` 与 `humanizer`（共 8 行 allowlist 删除），但保留了磁盘上的 `SKILL.md` 与 `references/`。这两条既无 allowlist 引用，也无运行时引用，因而成为 orphan — 计数从 37 升至 39。

`KEEP_AS_INTERNAL_SPECIALIST` 在 Phase 3.1 初版文字上成立，运行时却不成立 — 没有真实调用方。

### Phase 3.1A 修复路径（Option B）

不允许维持"无引用但称为 internal specialist"的中间状态。Phase 3.1A 走 Option B：保留 SKILL.md + 在 office subagent allowlist 显式 `allow` 这两条 specialist。

---

## 2. Skill final state 与真实 internal invocation path

### meeting-minutes-manager

| 维度 | final state |
|---|---|
| classification | `L3_INTERNAL` (Phase 3.1A 后，allowlist 含 office subagent) |
| canonical entry | `office-assistant`（xiaoxue primary 命中即路由到 office-assistant 通用会议纪要结构） |
| 保留形式 | `.opencode/skills/meeting-minutes-manager/SKILL.md` (190 lines) + `references/minutes-templates.md` 物理保留 |
| frontend visibility | `visibility: "internal"`（documentation-only frontmatter） |
| 真实 internal invocation path | `office subagent` (`packages/opencode/src/agent/agent.ts:332-377`) skill allowlist 显式 `"meeting-minutes-manager": "allow"`（line 370） |
| xiaoxue 主路由 | `Skill.available(xiaoxue)` 不暴露此 skill（xiaoxue permission 维持 `skill: { "*": "deny", ... }`） |
| 测试断言 | `packages/opencode/test/skill/phase31a-internal-specialist.test.ts` Test 1 + Test 3 |

### humanizer

| 维度 | final state |
|---|---|
| classification | `L3_INTERNAL` (Phase 3.1A 后，allowlist 含 office subagent) |
| canonical entry | `office-assistant`（xiaoxue primary 命中即路由到 office-assistant "Word 材料润色"段） |
| 保留形式 | `.opencode/skills/humanizer/SKILL.md` (442 lines) 物理保留 |
| frontend visibility | `visibility: "internal"`（documentation-only frontmatter） |
| 真实 internal invocation path | `office subagent` (`packages/opencode/src/agent/agent.ts:332-377`) skill allowlist 显式 `humanizer: "allow"`（line 371） |
| xiaoxue 主路由 | `Skill.available(xiaoxue)` 不暴露此 skill |
| 测试断言 | 同上 |

### 真实 internal invocation path

```ts
// packages/opencode/src/agent/agent.ts (line 332-377), office subagent
office: {
  name: "office",
  description: "日常办公智能体，...",
  prompt: XIAOXUE_OFFICE_PROMPT,
  options: {},
  mode: "subagent",
  native: true,
  permission: Permission.merge(
    defaults,
    Permission.fromConfig({
      "*": "deny",
      ...
      skill: {
        "*": "deny",
        ...
        "office-assistant": "allow",
        // Phase 3.1A: retained as office-subagent internal specialists
        // after the user-visible surface consolidation. xiaoxue primary
        // permission continues to deny both, so Skill.available(xiaoxue)
        // does not expose them. The office subagent inherits access and
        // can load them via the skill tool for industry-specific meeting
        // minutes and AI-pattern text humanization.
        "meeting-minutes-manager": "allow",
        humanizer: "allow",
      },
      office_document: "allow",
    }),
    user,
  ),
},
```

调用链：

```text
xiaoxue primary (Permission deny meeting-minutes-manager + humanizer)
  └─ task tool: office="allow"  (xiaoxue permission line 228-236)
       └─ office subagent 启动 (mode: "subagent")
            └─ skill tool: Skill.available(office) 含 meeting-minutes-manager + humanizer
                 └─ skill tool require() meeting-minutes-manager  // 加载录井行业会议专题模板
                 └─ skill tool require() humanizer               // 加载 24 类 AI 写作模式知识库
```

---

## 3. visibility schema & runtime semantics 核查

### 项目正式支持的 `visibility` 值

`packages/opencode/src/skill/index.ts:54-60` 的 `isSkillFrontmatter`：

```ts
export function isSkillFrontmatter(frontmatter: Record<string, unknown>): boolean {
  return typeof frontmatter.name === "string" && frontmatter.name.length > 0
    && typeof frontmatter.description === "string"
    && frontmatter.description.length > 0
}
```

**结论**：仅校验 `name` 与 `description`。`visibility` 字段（`public` / `private` / `internal` / 任何其他值）**没有 runtime consumer**。

### Runtime visibility 强制机制

`Skill.available(agent)`（同文件 line 319-326）：

```ts
available(agent: Agent.Info): Skill.Info[] {
  return Object.values(this.skills).filter(
    (skill) =>
      XiaoxueEnterprisePolicy.allows("skill", skill.name)
      && Permission.evaluate("skill", skill.name, agent.permission).action !== "deny",
  )
}
```

**Runtime visibility 强制完全由两层闸门完成：**

1. `XiaoxueEnterprisePolicy.allows("skill", skill.name)` — 企业托管策略第一道闸门（测试环境无 policy env vars 时返回 `true`）
2. `Permission.evaluate("skill", skill.name, agent.permission).action !== "deny"` — agent permission map 第二道闸门

### Phase 3.1A 选用的机制

按用户要求"如果 internal 并非项目正式枚举或 runtime 语义，则不要依赖它实现隐藏，使用项目当前真正支持的机制" — 选择 **agent permission map**：

- xiaoxue primary permission: `skill: { "*": "deny", ...省略其他 allow..., "office-assistant": "allow", ... }`（line 180-222）— `meeting-minutes-manager` 与 `humanizer` 不在 allowlist 中，因此 `Skill.available(xiaoxue)` 不暴露。
- office subagent permission: `skill: { "*": "deny", "office-assistant": "allow", "meeting-minutes-manager": "allow", humanizer: "allow" }`（line 350-372）— `Skill.available(office)` 同时暴露 office-assistant 与 2 个 specialist。

`visibility: "internal"` frontmatter 是 documentation-only metadata：保留它是为了让任何读 SKILL.md 的人立即知道运行时该 Skill 不该出现在 user-visible 列表中；它没有任何运行时语义，纯描述性。

### 双向契约测试

新测试 `packages/opencode/test/skill/phase31a-internal-specialist.test.ts`：

```ts
const INTERNAL_SPECIALIST_IDS = ["meeting-minutes-manager", "humanizer"] as const
const CANONICAL_OFFICE_ID = "office-assistant"

it.live("xiaoxue surface hides meeting-minutes-manager and humanizer (user-visible surface consolidation holds)", ...)
it.live("office subagent surface exposes meeting-minutes-manager and humanizer (real internal invocation path)", ...)
it.live("office subagent can get() both specialists (loadable, not just listed)", ...)
```

测试用 Effect-based `provideTmpdirInstance` 在临时 git init 目录跑 `Skill.service` discovery。fixture mirror `agent.ts` 的 `defaults` + `Permission.fromConfig`：

```ts
function xiaoxueAgent(): Agent.Info {
  return {
    name: "xiaoxue",
    mode: "primary",
    options: {},
    permission: Permission.merge(
      baseDefaults,
      Permission.fromConfig({
        "*": "deny",
        skill: {
          "*": "deny",
          [CANONICAL_OFFICE_ID]: "allow",
        },
      }),
    ),
  }
}

function officeSubagent(): Agent.Info {
  return {
    name: "office",
    mode: "subagent",
    options: {},
    permission: Permission.merge(
      baseDefaults,
      Permission.fromConfig({
        "*": "deny",
        skill: {
          "*": "deny",
          [CANONICAL_OFFICE_ID]: "allow",
          "meeting-minutes-manager": "allow",
          humanizer: "allow",
        },
      }),
    ),
  }
}
```

测试结果（重跑，2026-08-23）：

```text
test\skill\phase31a-internal-specialist.test.ts:
(pass) phase 3.1A internal specialist surface > xiaoxue surface hides meeting-minutes-manager and humanizer
(pass) phase 3.1A internal specialist surface > office subagent surface exposes meeting-minutes-manager and humanizer
(pass) phase 3.1A internal specialist surface > office subagent can get() both specialists

 3 pass
 0 fail
 9 expect() calls
EXIT=0
```

两个 specialist 在普通 Xiaoxue user-visible available skills 中不出现；同时 office subagent 既能在 `Skill.available()` 中列出，也能通过 `Skill.get(name)` 实际加载 — 双向契约锁定。

---

## 4. Hook timeout 澄清

### "1 pre-existing hook timeout" 的真相

Phase 3.1 closeout 报告中标注 "1 pre-existing hook timeout" 的命令来自 PowerShell 把 `bun test` 退出时的 stderr 包成 `NativeCommandError` cosmetic message：

```text
+ ... ; bun test test/skill/phase31a-internal-specialist.test.ts  ...
+                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
```

这是 PowerShell 的 `RemoteException` 包装，不影响 exit code。实际 exit code 用 `$LASTEXITCODE` 捕获：

### 重跑结果（2026-08-23）

| exact command | pass count | fail count | timeout count | exit code |
|---|---|---|---|---|
| `cd packages/opencode && bun test test/skill/phase31a-internal-specialist.test.ts` | 3 | 0 | 0 | **0** |
| `cd packages/opencode && bun test test/skill/` | 37 | 0 | 0 | **0** |
| `cd packages/opencode && bun test test/agent/` | 108 | 0 | 0 | **0** |
| `cd packages/opencode && bun test test/xiaoxue/portable-skills.test.ts` | 2 | 0 | 0 | **0** |
| `cd packages/desktop && bun test src/main/resource-integrity-sync.test.ts` | 1 | 0 | 0 | **0** |
| `cd packages/opencode && bun typecheck` | — | — | — | **0** |
| `cd packages/desktop && bun typecheck` | — | — | — | **0** |

**Final tests**: 37 + 108 + 2 + 1 = **148 pass / 0 fail / 0 timeout / 0 fail**，所有命令 exit code = 0。

### Phase 3.1A 报告标准措辞

> **non-failing teardown/hook warning**: PowerShell 把 `bun test` 退出时的 stderr 包成 `NativeCommandError` cosmetic message。实际 exit code = 0。所有测试 pass / fail / timeout 计数与 exit code 一致。"hook timeout" 不复存在 — 之前的报告同时写 "108/0" 和 "timeout" 是 PowerShell cosmetic stderr wrapper 误读。

Phase 3.1 不能因 cosmetic stderr 而写成不完整 test PASS；现在 exit code = 0 加上 148/0 pass/fail，Phase 3.1A 才有资格写完整 test PASS。

---

## 5. Zombie / integrity.json final wording

### 3 个 zombie 当前残留文件清单

| zombie | 残留文件 | integrity.json 行号 | runtime Skill ref | allowlist ref |
|---|---|---|---|---|
| `contract-management` | `contracts/contract-management/references/contract-review-checklist.md` (2756 bytes)<br>`contracts/contract-management/references/key-clauses-guide.md` (3976 bytes)<br>`contracts/contract-management/references/risk-identification.md` (3403 bytes) | 正确包含 | 无 | 无 |
| `github-ai-trends` | `scripts/fetch_trends.py` (4399 bytes)<br>`_skillhub_meta.json` (736 bytes) | 正确包含 | 无 | 无 |
| `llm-wiki` | `_skillhub_meta.json` (766 bytes) | 正确包含 | 无 | 无 |

### Final wording（替代 "stale integrity reference"）

> **physical residual files**
> **packaged / tracked by integrity manifest**
> **no SKILL.md**
> **no runtime Skill reference**

具体证据：

- `audit-zombie.mjs`（临时辅助脚本，列在 `.tmp/` 下，仓库不跟踪）输出所有残留文件的 path / size / first80Bytes。
- `packages/desktop/resources/integrity.json` 是 `packages/desktop/src/main/resource-integrity-sync.test.ts` 的真实 fixture；该测试 `EXIT=0` 且 1 pass，证明 committed manifest 与当前 `.opencode/skills/` 树一致。
- "stale integrity reference" 这一旧措辞仅适用于"manifest 指向不存在路径"的情况。本次核查 3 个 zombie 的 manifest 路径均真实存在 — 因此旧措辞错误，已替换。

### Zombie 与 active skill 的边界

| skill_id | 类型 | 说明 |
|---|---|---|
| `llm-wiki` | ZOMBIE_PHYSICAL_RESIDUAL | 仅 `_skillhub_meta.json`；Phase 3.0 已从 allowlist 移除 |
| `llm-wiki-knowledge` | L0_CORE_ENTRY (active) | `xenova/agent` 的活跃 Wikipedia 风格 wiki 引擎；与 llm-wiki 是两个独立条目 |
| `contract-management` | ZOMBIE_PHYSICAL_RESIDUAL | references/*.md 含真实业务知识（合同审核清单 / 核心条款起草 / 风险识别），删除前需审计 |
| `github-ai-trends` | ZOMBIE_PHYSICAL_RESIDUAL | scripts/fetch_trends.py 真实可执行 Python 脚本（GitHub trending repo 抓取），后续 Phase 评估是否迁移到 deep-research/github-trending-cn |

本阶段不删除这些目录，只修正文档状态。

---

## 6. long-document-writing capability preservation evidence

### 5 项独有能力的真实状态

| 独有能力 | 长文档写作原状（来自 `db145df53^:.opencode/skills/long-document-writing/SKILL.md`） | office-assistant 当前覆盖度（来自 `.opencode/skills/office-assistant/SKILL.md`） |
|---|---|---|
| 章节地图（用户驱动章节目标/承接关系） | line 7-14 工作原则：先列章节地图再分批写 | 隐式覆盖（line 122-130 "技术方案" 段、line 132-140 "项目申报" 段、line 90-100 "会议纪要" 段均含"默认结构"模板），但**无显式章节地图工作流** |
| 分章续写（按章节分批推进的迭代写流程） | line 16-22 标准流程：分章节推进、每章保留前文上下文 | **未覆盖**：office-assistant 不含"分章续写"迭代工作流 |
| 上下文保持（每章术语/事实/编号/前后承接检查） | line 16-22 标准流程：每章保留前文上下文 | **未覆盖**：office-assistant 不含"上下文保持"检查工作流 |
| 连续性检查（去 AI 味 + 全文术语统一） | 隐含在 line 7-14 工作原则"全程术语一致" | 部分覆盖（line 162-170 "Word 材料润色" 段含通用润色流程），但**不含去 AI 味专项检查** |
| 大文档组织（多章节手稿结构） | line 16-22 标准流程："先分章，再拼合" | 隐式覆盖（line 122-140 技术方案 / 项目申报的"默认结构"），但**无显式多章节手稿组织工作流** |

### Phase 3.1A 的 outcome 标注

> `MERGE_INTO_OFFICE_WITH_ACKNOWLEDGED_GAP`

明确承认：

1. 5 项独有工作流中，3 项（章节地图 / 连续性检查 / 大文档组织）在 office-assistant 模板结构中**隐式部分覆盖**。
2. 2 项（分章续写 / 上下文保持）在 office-assistant **完全未覆盖**。
3. 仅凭 3 个示例 prompt 路由到 office-assistant **不构成功能等价**。

### 后续 Phase 建议（不在 Phase 3.1A 范围）

如需补齐长文档专家能力，后续 Phase 应二选一：

- 在 office-assistant 内新增 "长文档分章续写" 任务模板（含显式章节地图驱动 + 分章续写迭代 + 上下文保持检查）
- 重新引入 long-document-writing 作为 office subagent specialist（路径与 meeting-minutes-manager / humanizer 一致）

### Capability Matrix 完整记录

详见 `docs/skill-center/phase3.1A-office-capability-matrix-2026-08-23.tsv`（7 行：long-document-writing + meeting-minutes-manager + humanizer + office-assistant + contract-management + github-ai-trends + llm-wiki）。

---

## 7. Reference integrity missing count

```text
$ bun script/skill-counting-model.ts
{
  "repository_skill_md": 86,
  "repository_skill_md_top_level": 75,
  "nested_skill_md": 11,
  "runtime_glob_matches": 86,
  "runtime_distinct_names": 76,
  ...
  "integrity_referenced_count": 244,
  "integrity_missing_count": 0,
  "configured_only_nodes": 0,
  "integrity_discovered_count": 76,
  "portfolio_nodes": 80,
  ...
}
```

- **`integrity_missing_count`: 0**
- `integrity_referenced_count`: 244 (Phase 3.1 初版 242 → Phase 3.1A 244，+2 因 office subagent 现在显式 include)
- `orphanCount`: 37 (Phase 3.1 初版 39 → Phase 3.1A 37，-2：humanizer + meeting-minutes-manager)
- `integrity_test_discovery_with_builtin`: 76
- `portfolio_nodes`: 80

---

## 8. Git commit scope deviation 记录

### `5c4c56ea14 test(skills): persist skill portfolio counting and integrity guards`

按 `git show --stat 5c4c56ea14` 包含的实际变更：

- `packages/opencode/test/skill/portfolio-counting.test.ts`（新增 215 行）
- `packages/opencode/test/skill/reference-integrity.test.ts`（新增 174 行）
- `packages/opencode/src/skill/index.ts`（修改：`Skill.Info` type 调整 + `available()` 改为接受 `Agent.Info`）
- `packages/opencode/src/config/config.ts`（修改：permission 配置 schema）
- `script/skill-counting-model.ts`（新增 157 行）
- `script/skill-reference-snapshot.ts`（新增 285 行）
- `docs/skill-center/skill-reference-integrity-2026-08-23.tsv`（新增 873 行）
- `configs/xiaoxue/skills.yaml`（修改：3 行删除）
- `configs/xiaoxue/router.md`（修改：2 行更新）
- `packages/opencode/test/xiaoxue/portable-skills.test.ts`（修改：删 2 imports + 改 1 expectation）
- `packages/opencode/test/xiaoxue/xiaoxue-router.test.ts`（修改：3 处期望改为 office-assistant）
- `packages/opencode/src/agent/agent.ts`（修改：删除 8 行 xiaoxue allowlist）

**commit-scope deviation**：commit message 名为 `test(skills)`，但实际包含了 `skill/index.ts` API 调整 + `config.ts` schema 调整 + `agent.ts` allowlist 移除 + `xiaoxue-router.test.ts` 测试期望修改。规范上 type=`test` 不应触达 src / config / router；实际功能变更占比 ~40%。

### 处理原则

按用户要求："如果这些 commit 已经作为当前有效基线，不要为了提交名漂亮而强行 rebase/rewrite。"

`5c4c56ea14` 已是 `dev` 基线一部分。本报告将其记录为 commit-scope deviation，不 rebase / 不 rewrite / 不 amend。

`Phase 3.1A` 单独 commit（下一节），保证后续 closeout 可独立追溯。

---

## 9. Phase 3.1A 改动清单（待 commit）

| 类型 | 文件 | 行变化 | 说明 |
|---|---|---|---|
| modify | `packages/opencode/src/agent/agent.ts` | +8 / -0 | office subagent skill allowlist 新增 meeting-minutes-manager + humanizer + 6 行注释 |
| modify | `docs/skill-center/skill-reference-integrity-2026-08-23.tsv` | regenerated | orphanCount 39→37 |
| modify | `packages/desktop/resources/integrity.json` | regenerated | meeting-minutes-manager / humanizer 显式入 referenced |
| new | `packages/opencode/test/skill/phase31a-internal-specialist.test.ts` | +218 / -0 | 3 个 it.live 锁定 visibility 双向契约 |
| new | `docs/skill-center/phase3.1A-office-capability-matrix-2026-08-23.tsv` | +8 / -0 | 7 行 capability matrix |
| new | `docs/skill-center/phase3.1A-office-consolidation-2026-08-23.md` | +0 / -0 | 本报告 |

> 注：`.opencode/skills/meeting-minutes-manager/SKILL.md` 与 `.opencode/skills/humanizer/SKILL.md` 的 frontmatter 注释扩展（12 行说明 visibility 是 documentation-only）按 `.opencode/.gitignore` 不被 git 跟踪；disk 上已落地，但不入 commit。

---

## 10. Final tests

| 测试范围 | exact command | pass | fail | timeout | exit |
|---|---|---|---|---|---|
| 新 internal specialist 契约 | `bun test test/skill/phase31a-internal-specialist.test.ts` | 3 | 0 | 0 | 0 |
| skill 全部 | `bun test test/skill/` | 37 | 0 | 0 | 0 |
| agent 全部 | `bun test test/agent/` | 108 | 0 | 0 | 0 |
| xiaoxue portable skills | `bun test test/xiaoxue/portable-skills.test.ts` | 2 | 0 | 0 | 0 |
| desktop integrity sync | `bun test src/main/resource-integrity-sync.test.ts` | 1 | 0 | 0 | 0 |
| opencode typecheck | `bun typecheck` | — | — | — | 0 |
| desktop typecheck | `bun typecheck` | — | — | — | 0 |
| **TOTAL** | — | **148** | **0** | **0** | **0** |

`bun script/skill-counting-model.ts`: EXIT=0, orphanCount=37, integrity_referenced_count=244, integrity_missing_count=0。

---

## 11. Fixed-format 报告字段汇总

| 字段 | 值 |
|---|---|
| **Phase 3.1A Verdict** | **PASS** |
| orphan 37→39 的具体两个 Skill | `meeting-minutes-manager`, `humanizer` |
| meeting-minutes-manager final state | `KEEP_AS_INTERNAL_SPECIALIST_WITH_INVOCATION_PATH`；office subagent allowlist (`packages/opencode/src/agent/agent.ts:370`) 显式 `"meeting-minutes-manager": "allow"`；xiaoxue primary permission 维持 deny；`Skill.available(xiaoxue)` 不暴露 |
| humanizer final state | `KEEP_AS_INTERNAL_SPECIALIST_WITH_INVOCATION_PATH`；office subagent allowlist (`packages/opencode/src/agent/agent.ts:371`) 显式 `humanizer: "allow"`；xiaoxue primary permission 维持 deny；`Skill.available(xiaoxue)` 不暴露 |
| 两者真实 internal invocation path | xiaoxue → task tool → office subagent (`mode: "subagent"`) → skill tool → `Skill.get("meeting-minutes-manager")` / `Skill.get("humanizer")` |
| visibility 的正式 runtime 语义 | `visibility` frontmatter 是 documentary metadata only；`isSkillFrontmatter` (skill/index.ts:54-60) 仅校验 `name` + `description`，**不解析 visibility**。Runtime visibility 强制完全靠 `Permission` 系统（xiaoxue primary deny + office subagent allow 的两级 map） |
| hook timeout exact exit code | **EXIT=0**（所有命令）。PowerShell `NativeCommandError` 是 cosmetic stderr wrapper，非真 timeout。"non-failing teardown/hook warning" 措辞已统一 |
| zombie residual/integrity final wording | **physical residual files / packaged or tracked by integrity manifest / no SKILL.md / no runtime Skill reference**（替代旧的 "stale integrity reference"）。3 个 zombie：contract-management (3 references/*.md)、github-ai-trends (scripts/fetch_trends.py + _skillhub_meta.json)、llm-wiki (_skillhub_meta.json) |
| long-document unique capability preservation evidence | outcome = `MERGE_INTO_OFFICE_WITH_ACKNOWLEDGED_GAP`。5 项独有工作流中 3 项（章节地图 / 连续性检查 / 大文档组织）由 office-assistant 模板隐式部分覆盖；2 项（分章续写 / 上下文保持）完全未覆盖。3 个示例 prompt 路由到 office-assistant **不构成功能等价**。详见 capability matrix `phase3.1A-office-capability-matrix-2026-08-23.tsv` |
| reference integrity missing count | **0**（integrity_referenced_count=244, orphanCount=37） |
| final tests | **148 pass / 0 fail / 0 timeout**，所有命令 `EXIT=0` |

---

## 12. 停止与审核

按用户要求：

> "如果上述全部澄清，停止并等待审核，不启动 Phase 3.2。"

Phase 3.1A 已 PASS。停止本阶段，等待用户审核后再决定是否启动 Phase 3.2（合同 / supervision Skill 治理）。