# RC6 Release Notes

日期：2026-08-22
产品版本：`0.8.0-rc.6`
总分支谱系：

```text
rc6-release-base
  → rc6-model-base
  → rc6-registry-recovery
  → rc6-model-e2e
  → rc6-skill-center
  → rc6-business-skills
  → rc6-release-hardening
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

提交（与 rc6-business-skills 同 HEAD；本阶段未引入源代码改动）：

```text
747dd6877ea36d1627e601e7c507f6278ba77b20
```

文档：

- `docs/release/rc6/rc6-release-hardening-2026-08-22.md`
- `docs/release/rc6/RELEASE_NOTES.md`

交付：

- 三包 typecheck：opencode 通过；app 有 pre-existing 错误；desktop 未跑（sandbox 限制）
- Resource 完整性核对：42 个 Skill 目录 / 275 个跟踪文件
- lint / 测试：sandbox 限制未重跑；rc6-skill-center 阶段已通过 146 个测试

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
| rc6-release-hardening | typecheck（app） | 0 / 1（pre-existing） |
| rc6-release-hardening | typecheck（desktop） | 未跑 |

---

## 3. 已知 P0 / P1 / P2

| 级别 | 内容 | 状态 |
| --- | --- | --- |
| P0 | 无 | — |
| P1 | 真实业务样本未提供 | 待人工提供 |
| P1 | Synthesized Fixture 未生成 | 模板已设计 |
| P2 | packages/app typecheck pre-existing 错误 | 仓库长期，不归入本轮 |
| P2 | contract-copilot 许可证边界未确认 | LICENSE_REVIEW_REQUIRED |

---

## 4. 下一阶段

按 25 节阶梯：

```text
rc6-release-hardening
   ↓
packaged resource validation  ← 下一阶段
   ↓
model RC6 E2E
   ↓
clean-machine lifecycle
   ↓
RC6 candidate
```

`packaged resource validation` 阶段应处理：

1. 重新运行 desktop typecheck + 全量 bun test。
2. 关闭 packages/app typecheck pre-existing 错误。
3. 整理 GUI 验收证据到 docs/release/rc6/evidence/。
4. 在新 worktree 中启动 packaged Desktop（不打包）做 bundled/user skill 数量一致性校验。

---

## 5. 严禁事项（继续）

- 不得创建 rc6-candidate
- 不得打 installer / 签名 / 发布
- 不得复制外部 .skill 文件 / contract-copilot 商业内容
- 不得在主 dev 修改 / reset / clean

---

## 6. 工作交接

- worktree：`E:\software programming\opencode-dev-rc6-skill-center`
- 当前分支：`rc6-release-hardening`
- 最终 HEAD：`747dd6877ea36d1627e601e7c507f6278ba77b20`
- 上一份交接文档：`handoff.md`（114 行）
- RC6 Skill Center 交接：`docs/release/rc6/rc6-skill-center-migration-2026-08-21.md`
- RC6 Business Skills 报告：`docs/release/rc6/rc6-business-skills-migration-2026-08-22.md`
- RC6 Business Skills 验收：`docs/release/rc6/business-skill-acceptance-matrix-2026-08-22.md`
- RC6 Release Hardening 报告：`docs/release/rc6/rc6-release-hardening-2026-08-22.md`
- RC6 Release Notes：`docs/release/rc6/RELEASE_NOTES.md`
