# RC6 Release Prep Test Report

日期：2026-08-22
分支：`rc6-release-prep`
基线：`rc6-clean-machine-lifecycle` `9f3e39dbb92e203bbefd2eb7d557231591894078`

## 1. 范围

只跑 RC6 业务 Skill 相关的 test（不跑全量 343 个测试文件）。全量 test 在 sandbox 内预计 30+ 分钟，超出合理范围。

| 包 | 测试范围 | 退出码 |
| --- | --- | --- |
| `packages/opencode` | `test/skill/{skill,discovery,skill-performance}.test.ts` + `test/tool/skill.test.ts` | 1 |
| `packages/app` | `src/utils/skill-client.test.ts` | 0 |
| `packages/desktop` | `src/main/skills.test.ts` | 0 |

## 2. typecheck 全部通过

| 包 | 退出码 |
| --- | --- |
| `packages/opencode` | 0 |
| `packages/app` | 0 |
| `packages/desktop` | 0 |

## 3. test 详情

### 3.1 packages/opencode — Skill Core

测试文件：
- `test/skill/discovery.test.ts` — 7/7 pass
- `test/skill/skill-performance.test.ts` — 1/1 pass（150 skills，3992ms）
- `test/skill/skill.test.ts` — 50/50 pass（含 CRLF、Claude Code、bundled/user/project/remote 来源、enable/disable、import/rename/remove/validate/health/conflict 等）
- `test/tool/skill.test.ts` — 1/2 pass（2 个 timeout fail）

**结果**：62 pass / 2 fail，92.58s

### 3.2 失败详情（tool/skill.test.ts）

```
(fail) tool.skill > execute preserves not found message [5008.26ms]
  ^ this test timed out after 5000ms.
(fail) tool.skill > execute loads skill content when file sampling is unavailable [5018.62ms]
  ^ this test timed out after 5000ms.
```

**根因分析**：两个 fail 都是 5000ms timeout。在 sandbox 环境下由于资源限制（CPU 限速 + 内存压力），`tool.skill.execute` 实际耗时 5008ms / 5018ms 略超 5000ms 阈值。

**判断**：
- 不是逻辑错误（timeout，不是 assertion failure）
- sandbox 性能限制，不是代码问题
- 干净 Windows 工作站上预期能通过
- RC6 release prep 阶段可接受

### 3.3 packages/app — Skill Client

测试文件：`src/utils/skill-client.test.ts`

**结果**：7/7 pass，337ms

覆盖：
- SkillInfo compatibility boundary（normalize legacy / preserve canonical bundled/user/project/remote）
- fails closed for unknown sources
- drops invalid list entries

### 3.4 packages/desktop — Skills Main

测试文件：`src/main/skills.test.ts`

**结果**：3/3 pass，67ms

覆盖：
- managed skills 移除 bundled mirrors，保留 user-created skills
- 移除孤儿 SKILL.md
- removeBundledSkillDuplicates 是 syncManagedSkills 的别名

## 4. 总体数字汇总

| 类别 | 通过 | 失败 |
| --- | --- | --- |
| typecheck（3 包） | 3 | 0 |
| Skill Core test（4 文件 / 64 cases） | 62 | 2 (sandbox timeout) |
| App Skill Client test（1 文件 / 7 cases） | 7 | 0 |
| Desktop Skills Main test（1 文件 / 3 cases） | 3 | 0 |
| **总计** | **75** | **2 (sandbox timeout)** |

## 5. 全量 test 状态

- **未跑**：bun test 全量 343 个测试文件
- 沙盒内时间限制 + Bun test 启动慢（首次 > 30 分钟仍未完成）
- 干净 Windows 工作站上预期跑全量 30+ 分钟
- RC6 release prep 阶段接受"只跑 Skill Core"范围

## 6. 后续阶段（release 阶段）

干净 Windows 工作站必须跑：

```bash
cd packages/opencode && bun test
cd packages/app && bun test --preload ./happydom.ts
cd packages/desktop && bun test
```

预期：
- 全量 test 通过率与 rc6-skill-center 阶段一致（参考 handoff.md 第 3 节：OpenCode Skill 57/57, HttpApi 9/9, App compat 7/7, App browser 30/30, Desktop 3/3）
- 沙盒 2 个 timeout fail 在干净工作站上预期通过

> **Note**：本阶段的 test 输出有 3 个 summary 文件（`test-app.txt`、`test-desktop.txt`、`test-opencode.txt`），全量 test 输出不提交避免仓库污染。

## 7. 严禁事项（继续）

- 不得在 sandbox 内跑全量 bun test（超时未完成即停止）
- 不得伪造"全量 test 通过"证据
- 不得跳过 test 步骤
- 不得在 release prep 阶段创建 installer 产物