---
name: meeting-minutes-manager
description: >-
  会议纪要智能管理助手。当用户提到“会议纪要”“录音转文字”“语音转写”“整理会议记录”“会议摘要”
  “会议跟踪”“待办事项”“会议决议”或“写会议纪要”时触发本技能。提供录音转写、纪要生成、决议跟踪、
  待办提取和模板管理，适用于钻探项目周例会、技术评审会、生产协调会、HSE 例会和验收会议。
description_zh: "录音转写+会议纪要生成+决议跟踪一体化管理"
description_en: "Meeting transcription, minutes generation, and action item tracking"
version: 1.0.0
display_name: "会议纪要智能管理"
display_name_en: "Meeting Minutes Manager"
agent_created: true
# Phase 3.1A: retained as an office-subagent internal specialist after the
# user-visible office consolidation. The `visibility: "internal"` frontmatter
# is documentary metadata only — `packages/opencode/src/skill/index.ts`'s
# `isSkillFrontmatter` does NOT parse this field. Runtime visibility is
# enforced exclusively by the agent permission map: xiaoxue primary
# permission denies this skill (so `Skill.available(xiaoxue)` does not
# expose it), while the office subagent allowlist grants explicit access
# (line ~366 of `packages/opencode/src/agent/agent.ts`). The skill tool
# running under the office subagent can therefore load this skill on
# demand for industry-specific meeting minutes, transcription flows,
# resolution tracking, and action item extraction that office-assistant's
# generic templates do not cover.
visibility: "internal"
metadata:
  industry: "石油钻探"
  specialty: "地质录井"
---

# 会议纪要智能管理助手

本技能用于将录音/语音转换为文字，并智能生成结构化会议纪要。

## 工作流程

```
录音文件 → 语音转写 → 会议纪要生成 → 待办事项提取 → 输出文档
```

## 第一步：语音转写

### 方式一：使用 markitdown-skill 转写音频
```bash
# markitdown 支持音频文件转写（需安装 markitdown[all]）
markitdown input.mp3 > transcript.txt
```

### 方式二：使用 openai-whisper-api 技能
如果已安装 openai-whisper-api 技能，可通过 OpenAI Whisper API 转写：
- 支持格式：mp3, wav, m4a, flac
- 支持语言：中文（普通话）、英文
- 输出格式：纯文本 + 时间戳

### 转写后处理
1. 读取转写文本
2. 识别发言人（通过语音特征或上下文）
3. 标记时间节点
4. 清除语气词和重复内容

## 第二步：会议纪要生成

按 `references/minutes-templates.md` 中的模板生成会议纪要：

### 标准会议纪要格式

```markdown
# 会议纪要

## 会议信息
- 会议名称：[会议名称]
- 会议类型：[周例会/技术评审/生产协调/HSE例会/验收会]
- 会议时间：[日期 时间]
- 会议地点：[地点/线上会议链接]
- 主持人：[姓名/职务]
- 记录人：[姓名]
- 参会人员：[姓名1、姓名2、...]

## 会议议题
1. [议题1]
2. [议题2]
3. [议题3]

## 会议内容

### 议题一：[议题名称]

**汇报人**：[姓名]

**主要内容**：
[核心内容摘要]

**讨论情况**：
- [发言人1]：[观点摘要]
- [发言人2]：[观点摘要]

**决议**：
[会议形成的决议]

### 议题二：[议题名称]
（同上格式）

## 会议决议汇总
| 序号 | 决议内容 | 责任人 | 完成期限 |
|------|---------|--------|---------|
| 1 | [决议] | [姓名] | [日期] |

## 待办事项
| 序号 | 任务描述 | 责任人 | 完成期限 | 优先级 |
|------|---------|--------|---------|--------|
| 1 | [任务] | [姓名] | [日期] | [高/中/低] |

## 下次会议安排
- 时间：[日期]
- 主要议题：[议题]
```

## 第三步：待办事项提取

从会议内容中自动识别待办事项：

### 提取规则
- 识别"需要"、"要求"、"安排"、"负责"、"完成"等关键词
- 识别"下周"、"月底"、"尽快"等时间表达
- 识别人名与任务的关联
- 识别优先级标记（"紧急"、"重要"等）

### 输出格式
```markdown
## 待办事项跟踪表

### 高优先级
- [ ] [任务1] — 责任人：[姓名] — 截止：[日期] — 来源：[会议名称]

### 中优先级
- [ ] [任务2] — 责任人：[姓名] — 截止：[日期]

### 低优先级
- [ ] [任务3] — 责任人：[姓名] — 截止：[日期]
```

## 专题会议模板

### 录井技术评审会纪要模板

按 `references/minutes-templates.md` 中的录井技术评审专题模板：

```markdown
# 录井技术评审会议纪要

## 会议信息
- 会议名称：[井号]录井技术评审会
- 会议时间：[日期时间]
- 参会人员：[录井队长、地质监督、甲方代表等]

## 评审内容
### 1. 地层划分评审
- 评审结论：[通过/修改]
- 修改意见：[意见]

### 2. 油气显示评审
- 评审结论：[通过/修改]
- 修改意见：[意见]

### 3. 完井总结报告评审
- 评审结论：[通过/修改]
- 修改意见：[意见]

## 决议事项
1. [决议1]
2. [决议2]

## 待办事项
| 序号 | 任务 | 责任人 | 完成期限 |
|------|------|--------|---------|
```

## 使用示例

### 场景1：项目周例会
用户："帮我整理今天项目周例会的会议纪要，录音文件在桌面"
→ 读取录音文件 → markitdown转写 → 生成会议纪要 → 提取待办事项

### 场景2：技术评审会
用户："根据以下内容写录井技术评审会议纪要"
→ 根据用户输入内容 → 按技术评审模板生成 → 输出决议和待办

### 场景3：HSE例会
用户："整理HSE月度例会纪要"
→ 按HSE会议模板生成 → 突出安全整改事项 → 输出跟踪表

## 注意事项

- 转写文本可能存在识别误差，关键数据需人工核对
- 会议涉密内容不得外传
- 待办事项跟踪表应定期更新状态
- 会议纪要需在会后24小时内完成并发送参会人员
