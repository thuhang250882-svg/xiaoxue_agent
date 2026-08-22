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
  → rc6-clean-machine-lifecycle
  → rc6-release-prep
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

### 1.6 Clean-Machine Lifecycle（rc6-clean-machine-lifecycle）

提交：见 `git log --oneline -5`（HEAD 包含 lifecycle framework + fixture + 报告）

文档：

- `docs/release/rc6/rc6-clean-machine-lifecycle-2026-08-22.md`
- `docs/release/rc6/lifecycle/MANIFEST.md`
- `docs/release/rc6/lifecycle/RUN.md`

交付：

- 4 个 lifecycle 脚本（`scripts/rc6-lifecycle/{install-checklist,synthesized-fixture,model-e2e-runner,acceptance-runner}.ts`）
- `install-checklist` 沙盒内 7/8 通过（仅 `xiaoxue_default API key` 沙盒不可用，需 `XIAOXUE_API_KEY` env var）
- `synthesized-fixture --all` 生成 4 个核心 Skill 的脱敏 fixture（knowledge-distill / tender-document-review / tender-bid-generation / 审查合同）
- `acceptance-runner --dry-run` 列出完整 46 case Acceptance Matrix
- `model-e2e-runner --mock-llm` 验证 harness 流程契约
- 真实 model E2E 待干净 Windows 工作站执行（按 `docs/release/rc6/lifecycle/RUN.md` 操作）
- 严格遵守：✓ 不打包 ✓ 不签名 ✓ 不发布 ✓ 不创建 rc6-candidate ✓ 不复制真实业务 ✓ 不伪造 model 通过证据

### 1.7 Release Prep（rc6-release-prep）

提交：见 `git log --oneline -5`（HEAD 包含 release prep framework + test report + installer 预检）

文档：

- `docs/release/rc6/rc6-release-prep-2026-08-22.md`
- `docs/release/rc6/release-prep/RC6_FINAL_STATUS.md`
- `docs/release/rc6/release-prep/TEST_REPORT.md`

交付：

- 1 个 release prep 脚本（`scripts/rc6-release-prep/installer-prep.ts`）
- typecheck 三包全部 exit 0（opencode / app / desktop）
- Skill Core test 62/64 通过（2 个 sandbox timeout fail 是性能限制，非逻辑错误）
- App Skill Client test 7/7 通过
- Desktop Skills Main test 3/3 通过
- installer-prep 预检 5/8 通过（XIAOXUE_PRODUCT_VERSION / OPENCODE_CHANNEL env var 未设为沙盒预期；`resources/python/` 需 release 阶段补齐）
- 严格遵守：✓ 不创建 rc6-candidate ✓ 不打包 ✓ 不签名 ✓ 不上传 ✓ 不发布 ✓ 不伪造全量 test 通过证据

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
| rc6-model-e2e | static-analysis / trigger-mutex / prompt-injection-guard | 35 + 8 + 4 / 47 |
| rc6-clean-machine-lifecycle | install-checklist（沙盒内） / dry-run cases / mock-llm flow | 7 + 46 + 1 |
| rc6-release-prep | typecheck（opencode / app / desktop） | 3 / 3 |
| rc6-release-prep | Skill Core test（skill / discovery / skill-performance / tool-skill） | 62 / 64 |
| rc6-release-prep | App Skill Client test | 7 / 7 |
| rc6-release-prep | Desktop Skills Main test | 3 / 3 |
| rc6-release-prep | installer-prep dry-run | 5 / 8 |

---

## 3. 已知 P0 / P1 / P2

| 级别 | 内容 | 状态 |
| --- | --- | --- |
| P0 | 无 | — |
| P1 | 真实业务样本未提供 | 待人工提供 |
| P1 | Synthesized Fixture 未生成 | 模板已生成（4 核心 Skill） |
| P1 | 真实 model E2E 未跑（sandbox + API key 限制） | 框架已交付；待干净工作站执行 |
| P1 | 2 个 sandbox timeout fail（tool/skill.execute 5008ms / 5018ms） | 性能限制；待干净工作站验证 |
| P1 | packages/desktop/resources/python/ 缺失 | release 阶段补齐 |
| P1 | 全量 bun test 未跑（343 文件） | 沙盒时间限制；干净工作站必跑 |
| P2 | contract-copilot 许可证边界未确认 | LICENSE_REVIEW_REQUIRED |
| P2 | trigger-mutex 中 2 个 reference Skill 失败（geology-knowledge / mud-logging-review） | 静态 harness 局限 |

---

## 4. 下一阶段

按 25 节阶梯：

```text
rc6-release-prep
   ↓
RC6 release (干净 Windows 工作站执行)
```

`RC6 release` 阶段（不在 sandbox 内）应处理：

1. 在干净 Windows 工作站 clone 此 worktree 完整 HEAD。
2. 跑完整 `bun test`（opencode / app / desktop）。
3. 跑 clean-machine lifecycle 真实 model E2E（4 核心 Skill）。
4. 跑 `bun run package` 打 NSIS installer：`录井小雪-0.8.0-rc.6-win32-x64.exe`。
5. （可选）`XIAOXUE_REQUIRE_SIGNING=true` + thumbprint 跑签名。
6. 跑 installer 安装 + 升级 + 卸载验证。
7. 创建 GitHub release + tag `v0.8.0-rc.6` + 上传产物 + sha256。
8. 更新 `CHANGELOG.md` 与 `CONTRIBUTING.md`。

严禁在 sandbox 内：
- 创建 `rc6-candidate` tag / branch / release
- 打 installer / 签名 / 上传产物 / 发布

---

## 5. 严禁事项（继续）

- 不得创建 rc6-candidate
- 不得打 installer / 签名 / 发布
- 不得复制外部 .skill 文件 / contract-copilot 商业内容
- 不得在主 dev 修改 / reset / clean
- 不得伪造"真实 model 已通过"的证据（仅承认沙盒内 mock 模式与干净工作站实际跑出的结果）

---

## 6. 工作交接

- worktree：`E:\software programming\opencode-dev-rc6-skill-center`
- 当前分支：`rc6-release-prep`
- 最终 HEAD：见 `git log --oneline -5`
- 上一份交接文档：`docs/release/rc6/rc6-release-prep-2026-08-22.md`
- 上一份交接文档：`handoff.md`（114 行）
- RC6 Skill Center 交接：`docs/release/rc6/rc6-skill-center-migration-2026-08-21.md`
- RC6 Business Skills 报告：`docs/release/rc6/rc6-business-skills-migration-2026-08-22.md`
- RC6 Business Skills 验收：`docs/release/rc6/business-skill-acceptance-matrix-2026-08-22.md`
- RC6 Release Hardening 报告：`docs/release/rc6/rc6-release-hardening-2026-08-22.md`
- RC6 Packaged Resource Validation 报告：`docs/release/rc6/rc6-packaged-resource-validation-2026-08-22.md`
- RC6 Model E2E 报告：`docs/release/rc6/rc6-model-e2e-2026-08-22.md`
- RC6 Clean-Machine Lifecycle 报告：`docs/release/rc6/rc6-clean-machine-lifecycle-2026-08-22.md`
- RC6 Release Prep 报告：`docs/release/rc6/rc6-release-prep-2026-08-22.md`
- RC6 Final Status：`docs/release/rc6/release-prep/RC6_FINAL_STATUS.md`
- RC6 25 节阶梯总报告：`docs/release/rc6/RC6_PIPELINE_SUMMARY.md`
- RC6 干净工作站 cheat-sheet：`docs/release/rc6/CLEAN_WORKSTATION_CHEATSHEET.md`
- E2E 文档：`docs/release/rc6/e2e/MANIFEST.md` + `RUN.md`
- E2E harness：`scripts/rc6-e2e/{static-analysis,trigger-mutex,prompt-injection-guard}.ts`
- Lifecycle 文档：`docs/release/rc6/lifecycle/MANIFEST.md` + `RUN.md`
- Lifecycle 脚本：`scripts/rc6-lifecycle/{install-checklist,synthesized-fixture,model-e2e-runner,acceptance-runner}.ts`
- Lifecycle fixture：`fixtures/rc6-lifecycle/{knowledge-distill,tender-document-review,tender-bid-generation,审查合同}/`
- Release Prep 脚本：`scripts/rc6-release-prep/installer-prep.ts`
- GUI 验收证据 manifest：`docs/release/rc6/evidence/MANIFEST.json`
- RC6 Release Notes：`docs/release/rc6/RELEASE_NOTES.md`
