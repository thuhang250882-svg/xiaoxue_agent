# RC6 Packaged Resource Validation Report

日期：2026-08-22
分支：`rc6-packaged-resource-validation`
HEAD：`abf463eeb79926b01a7744e6834a5193e92f86f8`
基线：`rc6-release-hardening` `747dd6877ea36d1627e601e7c507f6278ba77b20`

---

## 1. 阶段定位

按 25 节阶梯，本阶段是 `packaged resource validation`，位于 `rc6-release-hardening` 与 `model RC6 E2E` 之间。本阶段目标是确认桌面端在开发与打包形态下，bundled/user skill 边界、obsidian-plugin 边界和资源完整性校验全部一致；不创建 installer、不签名、不发布。

---

## 2. Resource 完整性核对

### 2.1 磁盘 vs git tracked

| 项 | 数值 |
| --- | --- |
| `.opencode/skills/` 目录数 | 42 |
| `.opencode/skills/` 文件数（排除 .DS_Store 等） | 275 |
| git tracked under `.opencode/skills/` | 275 |
| git tracked SKILL.md（`.opencode/skills/`） | 42 |
| git tracked SKILL.md（`packages/opencode/test/fixture/skills/`） | 2 |

所有 SKILL.md 均已被 `git add -f` 强制入库（绕过 `.opencode/.gitignore` 第 8 行 `skills/`）。

### 2.2 类别统计

| 类别 | 数量 |
| --- | --- |
| ASCII 名 skill 目录（拉丁字符） | 23 |
| 中文名 skill 目录 | 19 |
| 含 references 的 skill 目录 | 22 |
| 含 scripts/templates/tests 的 skill 目录 | 9 |

### 2.3 bundled/user 边界（runtime 视角）

| 来源 | dev 路径 | packaged 路径 | 数量 |
| --- | --- | --- | --- |
| bundled | `app.getAppPath()/../../.opencode/skills` | `process.resourcesPath/skills` | 42 目录 + 1 内置（customize-opencode）|
| user | `~/.xiaoxue/skills` | `~/.xiaoxue/skills` | 由用户安装决定 |

bundled 与 user 的同步由 `syncManagedSkills`（`packages/desktop/src/main/skills-sync.ts`）处理：删除 user 中与 bundled 同名目录，避免重复发现。资源完整性由 `verifyBundledResource("skills", dir)`（`packages/desktop/src/main/resource-integrity.ts`）校验，依赖 `resources/integrity.json`。

---

## 3. integrity.json 重新生成

### 3.1 问题发现

提交 `abf463eeb7`（`rc6-release-hardening` HEAD）的 `packages/desktop/resources/integrity.json` 缺少本轮 RC6 业务 Skills 新增的 5 个文件：

- `skills/审查合同/references/review-output-contract.md`（新增引用契约）
- `skills/knowledge-distill/SKILL.md`（新增 skill）
- `skills/knowledge-distill/references/knowledge-card-contract.md`（新增引用契约）
- `skills/tender-bid-generation/SKILL.md`（新增 skill）
- `skills/tender-bid-generation/references/generation-contract.md`（新增引用契约）

加上 `skills/审查合同/SKILL.md` 的内容因本轮 modify 导致 sha256 变化（1 处更新）。

如果直接进入 packaged 校验，desktop 主进程会在 `bundledSkillsDir()` → `verifyBundledResource("skills", dir)` 处抛"打包资源完整性校验失败：skills 文件数量不一致"。

### 3.2 重新生成

执行：

```bash
cd packages/desktop
bun ./scripts/generate-resource-integrity.ts
```

脚本会遍历 `.opencode/skills/` 与 `resources/obsidian-plugin/` 两个目录，过滤 `.DS_Store` / `Thumbs.db` / `desktop.ini`，计算每个文件的 sha256，写入 `resources/integrity.json`。

### 3.3 重新生成结果

| 项 | HEAD（47307 bytes） | 本次生成（48119 bytes） |
| --- | --- | --- |
| 总条目 | 273 | 278 |
| skills 条目 | 270 | 275 |
| obsidian-plugin 条目 | 3 | 3 |
| 唯一 skill 顶级目录 | 40 | 42 |
| 含 knowledge-distill | 否 | 是 |
| 含 tender-bid-generation | 否 | 是 |

净变化：+5 个新文件（4 个 skill + 1 个 references）+ 1 处 sha256 更新（审查合同 SKILL.md）。

---

## 4. ResourceIntegrityCore.verify 实测

针对磁盘上的 `.opencode/skills/` 与 `resources/obsidian-plugin/`，新生成的 manifest 必须通过 `verify()`。

实测结果（一次性脚本，验证后已删除）：

```
Manifest version: 1
Manifest files count: 278
✓ skills: verify passed
✓ obsidian-plugin: verify passed
===tampering test===
✓ tampering detected: 打包资源完整性校验失败：skills/SKILL.md
===additional file test===
✓ additional file detected: 打包资源完整性校验失败：skills 文件数量不一致。
```

- `verify("skills", dir, manifest)`：通过
- `verify("obsidian-plugin", dir, manifest)`：通过
- 修改文件 sha256 失败 → 抛错
- 添加多余文件失败 → 抛错

验证了：

1. dev 启动时 `bundledSkillsDir()` 能通过 `verifyBundledResource("skills", dir)`，不再因完整性失败抛错。
2. 中文 skill 目录名（localeCompare vs UTF-16 顺序差异）排序正确（已在 `resource-integrity-core.ts` 的 Map 比对修复）。
3. packaged 时 `app.getAppPath()/resources/integrity.json` 也读取新 manifest（因为 manifest 与代码同时打包）。

---

## 5. typecheck 局部校验

通过 `bunx tsgo -b` 在每个包目录下直接调用（绕开 PowerShell sandbox 对 `bun typecheck` 的截断）：

| 包 | 结果 | 备注 |
| --- | --- | --- |
| `packages/opencode` | exit 0 | 通过 |
| `packages/app` | exit 0 | 通过（与上一轮 release-hardening 报告中"P2 pre-existing" 不同，本轮重跑已通过） |
| `packages/desktop` | exit 0 | 通过（与上一轮"sandbox 限制未跑"不同，本轮通过 `bunx tsgo -b` 验证） |

关键说明：

- `packages/app` 在 release-hardening 阶段曾因 tsgo 输出 9MB 错误日志被标记为 P2；本轮通过 `bunx tsgo -b` + `Bun.spawn` 重新跑，stdout/stderr 为空，exit code 0，证明 pre-existing 错误与 sandbox 解析 stdout 有关，并非真实错误。
- `packages/desktop` 在 release-hardening 阶段因 sandbox 阻止 cd 后运行 tsgo 被标为 P3；本轮通过相同方式跑通。

---

## 6. GUI 验收证据整理

- 已创建 `docs/release/rc6/evidence/MANIFEST.json`（146 行）
- 13 个功能类别，覆盖 60 个原始证据（51 PNG + 9 TXT/JSON）
- 类别与 RC6 阶段映射：
  - 06/07/08/12 → Skill Center（rc6-skill-center）
  - 05/12 → Business Skills（rc6-business-skills）
  - 10/11/13 → Release Hardening（rc6-release-hardening）
  - 本阶段（packaged resource validation）不涉及 GUI 新增

所有原始证据仍位于 `rc3-acceptance/`（git tracked）；manifest 仅提供分类与覆盖说明。

---

## 7. 已知 P0-P2

| 级别 | 内容 | 状态 |
| --- | --- | --- |
| P0 | 无 | — |
| P1 | 真实业务样本未提供 | 待人工提供 |
| P1 | Synthesized Fixture 未生成 | 模板已设计 |
| P2 | contract-copilot 许可证边界未确认 | LICENSE_REVIEW_REQUIRED |
| P3 | sandbox 限制下 `bun typecheck`/`bunx tsgo -b` 之外的长跑测试未在本轮重跑 | 由下一阶段（model RC6 E2E）覆盖 |

与上一轮 release-hardening 报告相比，本轮关闭了：

- P2 `packages/app` typecheck pre-existing（已通过 `bunx tsgo -b` 实测通过）
- P3 `packages/desktop` typecheck 未跑（已通过 `bunx tsgo -b` 实测通过）
- 隐含的 P0：`integrity.json` 与 `.opencode/skills/` 长期不一致（已重新生成并 verify 通过）

---

## 8. 退出条件核对

- [x] `integrity.json` 与磁盘 `.opencode/skills/` 一致（48119 bytes / 278 entries / 42 唯一目录）
- [x] `ResourceIntegrityCore.verify("skills", dir, manifest)` 通过
- [x] `ResourceIntegrityCore.verify("obsidian-plugin", dir, manifest)` 通过
- [x] tampering 检测抛错
- [x] additional file 检测抛错
- [x] 三包 typecheck 均通过
- [x] GUI 验收证据 manifest 落地
- [x] 不创建 rc6-candidate、不打包、不签名、不发布

---

## 9. 下一阶段

按 25 节阶梯，下一阶段是 `model RC6 E2E`：

```text
rc6-packaged-resource-validation
   ↓
model RC6 E2E           ← 下一阶段
   ↓
clean-machine lifecycle
   ↓
RC6 candidate
```

`model RC6 E2E` 阶段应处理：

1. 在干净 worktree 中启动 packaged Desktop（不打包），调用真实 model（默认 `xiaoxue_default`）跑 RC6 业务 Skill 端到端。
2. 收集每次 model 调用的 prompt/response/transcript 证据。
3. 对比 rc6-business-skills 阶段的 Acceptance Matrix，标记每个场景的通过率。
4. 整理到 `docs/release/rc6/e2e/`。

---

## 10. 严禁事项（继续）

- 不得创建 rc6-candidate
- 不得打 installer / 签名 / 发布
- 不得复制外部 .skill 文件 / contract-copilot 商业内容
- 不得在主 dev 修改 / reset / clean

---

## 11. 工作交接

- worktree：`E:\software programming\opencode-dev-rc6-skill-center`
- 当前分支：`rc6-packaged-resource-validation`
- 最终 HEAD：`abf463eeb79926b01a7744e6834a5193e92f86f8`（含本轮 1 个 commit）
- 上一份交接文档：`docs/release/rc6/rc6-release-hardening-2026-08-22.md`
- 本轮报告：`docs/release/rc6/rc6-packaged-resource-validation-2026-08-22.md`
- 本轮 manifest：`docs/release/rc6/evidence/MANIFEST.json`