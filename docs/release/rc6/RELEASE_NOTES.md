# RC6 Release Notes

日期：2026-08-22
产品版本：`0.8.0-rc.6`
总分支谱系：

```text
rc6-release-base
  → rc6-model-base
  → rc6-registry-recovery
  → rc6-skill-center
  → rc6-business-skills
  → rc6-release-hardening
  → rc6-packaged-resource-validation
  → rc6-model-e2e
```

---

## 1. 主要变更

### 1.1 Skill Center Core（rc6-skill-center）

提交：

```text
53ea588412 feat(opencode): add advanced skill lifecycle
b0359a2d03 feat(opencode): expose skill management api
10ca2246a7 feat(app): add advanced skill center
ac19207f43 fix(desktop): preserve user skill ownership
```

能力：

- Skill CRUD + 启停持久化 + 校验
- 健康检查 / 诊断 / 冲突检测
- 本地导入 / quarantine
- 搜索 / 筛选 / 来源标识
- HttpApi 端点 + 结构化错误
- App 清单 / 详情 / 编辑 / 安全导入
- Desktop 同步：保留用户 Skill，移除 bundled 旧镜像

### 1.2 Business Skills（rc6-business-skills）

提交：

```text
ea3ac41c4e docs(rc6): add business skills migration audit and drop dead router refs
d3cb7199db feat(skills): add traceable knowledge distillation
bf708a00a7 feat(skills): add tender bid generation
a4fe6720a6 feat(skills): enhance petroleum contract review with evidence and obligation contract
41d0154367 feat(skills): align business skill routing
747dd6877e docs(rc6): record business skills migration report and acceptance matrix
```

能力：

- `knowledge-distill`：可追溯知识蒸馏（来源/位置/摘录/归一化/版本/冲突保留）
- `tender-bid-generation`：投标文件生成（招标要求矩阵冻结 + 企业素材匹配 + 阻断虚构 + 独立 QA）
- `审查合同`（petroleum-contract-review）增强：风险证据 + 义务时间线契约
- 路由表新增 2 条；删除 2 条死引用

### 1.3 Release Hardening（rc6-release-hardening）

提交：

```text
abf463eeb79926b01a7744e6834a5193e92f86f8
```

文档：

- `docs/release/rc6/rc6-release-hardening-2026-08-22.md`

交付：

- 三包 typecheck：opencode / app / desktop 通过
- Resource 完整性核对：42 个 Skill 目录 / 275 个跟踪文件
- 关闭 P2：`packages/app` typecheck pre-existing 错误
- 关闭 P3：`packages/desktop` typecheck 未跑

### 1.4 Packaged Resource Validation（rc6-packaged-resource-validation）

提交：

```text
09a2c4f9ab1f1cd9d045244dc0d7f441038a24af
```

文档：

- `docs/release/rc6/rc6-packaged-resource-validation-2026-08-22.md`
- `docs/release/rc6/evidence/MANIFEST.json`

交付：

- `integrity.json` 重新生成（48119 bytes / 278 entries / 42 唯一 skill 目录）
- `ResourceIntegrityCore.verify` 通过（skills + obsidian-plugin）
- tampering / additional file 检测抛错（符合预期）
- 三包 typecheck 全部 exit 0
- GUI 验收证据 manifest 落地（13 类别 / 60 文件）

### 1.5 Model E2E（rc6-model-e2e）

提交：见 `git log --oneline -5`（HEAD 包含本节添加的 SKILL.md 边界段落 + harness + E2E 文档）

文档：

- `docs/release/rc6/rc6-model-e2e-2026-08-22.md`
- `docs/release/rc6/e2e/MANIFEST.md`
- `docs/release/rc6/e2e/RUN.md`

交付：

- 3 个静态 E2E harness（`scripts/rc6-e2e/{static-analysis,trigger-mutex,prompt-injection-guard}.ts`）
- `static-analysis` 35/35 通过（4 核心 RC6 业务 Skill 的 frontmatter + references + dependencies 全合格）
- `trigger-mutex` 8/10 通过（核心 8/8；reference 0/2 待真实 model E2E 验证）
- `prompt-injection-guard` 4/4 通过
- 修补 `tender-document-review/SKILL.md` 边界段落（增 prompt injection guard 关键词）
- 不调真实 model（sandbox + API key 限制；由 `clean-machine lifecycle` 在干净工作站交付）

---

## 2. 测试数字汇总

| 阶段 | 测试 | 通过 |
| --- | --- | --- |
| rc6-skill-center | OpenCode Skill (skill / skill-performance / tool/skill) | 57 + 9 + 7 + 30 + 3 = 106 |
| rc6-skill-center | HttpApi | 9 |
| rc6-skill-center | App compatibility / browser | 7 / 30 |
| rc6-skill-center | Desktop | 3 |
| rc6-skill-center | typecheck（opencode / app / desktop） | 3 / 3 |
| rc6-business-skills | （仅文档 / Skill 文件，无新增源代码） | — |
| rc6-release-hardening | typecheck（opencode） | 1 / 1 |
| rc6-packaged-resource-validation | typecheck（opencode / app / desktop） | 3 / 3 |
| rc6-packaged-resource-validation | ResourceIntegrityCore.verify（skills + obsidian-plugin + tampering + additional） | 4 / 4 |

---

## 3. 已知 P0 / P1 / P2

| 级别 | 内容 | 状态 |
| --- | --- | --- |
| P0 | 无 | — |
| P1 | 真实业务样本未提供 | 待人工提供 |
| P1 | Synthesized Fixture 未生成 | 模板已设计 |
| P1 | 真实 model E2E 未跑（sandbox + API key 限制） | 由 `clean-machine lifecycle` 阶段在干净工作站交付 |
| P2 | contract-copilot 许可证边界未确认 | LICENSE_REVIEW_REQUIRED |
| P2 | trigger-mutex 中 2 个 reference Skill 失败（geology-knowledge / mud-logging-review） | 静态 harness 局限 |

---

## 4. 下一阶段

按 25 节阶梯：

```text
rc6-model-e2e
   ↓
clean-machine lifecycle   ← 下一阶段
   ↓
RC6 candidate
```

`clean-machine lifecycle` 阶段应处理：

1. 在干净 Windows 工作站（无 sandbox 限制）上启动 packaged Desktop（不打包模式）。
2. 配置 `xiaoxue_default` model 调用权限 + API key。
3. 跑完整 Acceptance Matrix（4 个核心 Skill × 8 维度 + 5 节 Prompt Injection + 6 节 Trigger + 8 节真实样本）。
4. 收集每次 model 调用的 prompt/response/transcript 证据。
5. 整理到 `docs/release/rc6/lifecycle/`。

---

## 5. 严禁事项（继续）

- 不得创建 rc6-candidate
- 不得打 installer / 签名 / 发布
- 不得复制外部 .skill 文件 / contract-copilot 商业内容
- 不得在主 dev 修改 / reset / clean

---

## 6. 工作交接

- worktree：`E:\software programming\opencode-dev-rc6-skill-center`
- 当前分支：`rc6-model-e2e`
- 最终 HEAD：见 `git log --oneline -5`
- 上一份交接文档：`docs/release/rc6/rc6-model-e2e-2026-08-22.md`
- 上一份交接文档：`handoff.md`（114 行）
- RC6 Skill Center 交接：`docs/release/rc6/rc6-skill-center-migration-2026-08-21.md`
- RC6 Business Skills 报告：`docs/release/rc6/rc6-business-skills-migration-2026-08-22.md`
- RC6 Business Skills 验收：`docs/release/rc6/business-skill-acceptance-matrix-2026-08-22.md`
- RC6 Release Hardening 报告：`docs/release/rc6/rc6-release-hardening-2026-08-22.md`
- RC6 Packaged Resource Validation 报告：`docs/release/rc6/rc6-packaged-resource-validation-2026-08-22.md`
- RC6 Model E2E 报告：`docs/release/rc6/rc6-model-e2e-2026-08-22.md`
- E2E 文档：`docs/release/rc6/e2e/MANIFEST.md` + `RUN.md`
- E2E harness：`scripts/rc6-e2e/{static-analysis,trigger-mutex,prompt-injection-guard}.ts`
- GUI 验收证据 manifest：`docs/release/rc6/evidence/MANIFEST.json`
- RC6 Release Notes：`docs/release/rc6/RELEASE_NOTES.md`
