# 录井小雪 Skill 治理记录（2026-08-27）

## 结果

- 仓库顶层可发现 Skill：69 → 27。
- 源码 Skill 组合与办公网安装包采用两层模型，不应把源码数量当成设置页数量：当前安装包包含 10 个核心产品 Skill，Skill 中心再显示 1 个内置 `customize-opencode`，合计 11 个。
- 27 个源码 Skill 的发布分区为：核心 10 个、可选 3 个、平台保留 12 个、当前离线运行时不可用 2 个；后三类没有从源码物理删除。
- GitHub、公网搜索、浏览器自动化、云 OCR、云转写、云文档转换、云图片生成、外部会议和电子签能力已从产品 Skill 目录、智能体白名单和路由中移除。
- 所有保留 Skill 均通过标准 `SKILL.md` 结构校验。

## 数量与去向复核

| 项目 | 数量 | 结论 |
|---|---:|---|
| 治理前顶层可发现 Skill | 69 | 备份 ZIP 中实测存在 69 个顶层 `SKILL.md` |
| 治理后源码 Skill | 27 | 全部纳入发布分区，无未分类项 |
| 退役的旧名称 | 47 | 32 个合并保留，15 个按办公网边界主动移除 |
| 新增统一入口 | 5 | `contract-management`、`knowledge-management`、`mud-logging-supervision`、`oilfield-it-project-management`、`skill-governance` |
| 办公网安装包产品 Skill | 10 | 由 `rc-release-profile.json` 精确选取 |
| Skill 中心显示 | 11 | 10 个产品 Skill + 1 个内置 Skill |

治理前后的净变化为 `69 - 47 + 5 = 27`。合并项的原始 `SKILL.md` 内容保存在统一入口的 `references/` 或等价的离线工作流中；没有发现唯一的离线业务能力被无去向删除。被主动移除的 15 项本身可能具有独立能力，但都依赖公网、外部 API、GitHub/npm、云服务或外部账号，不属于当前办公网产品边界。

## 合并映射

| 新入口 | 合并的原业务 |
|---|---|
| `contract-management` | NDA 快筛、合同起草、审查、对比、合规、台账、法条、谈判、经济影响、行业知识 |
| `tender-management` | 招标文件编制、投标文件生成、投标文件审核 |
| `mud-logging-supervision` | 监督案例、资料检查、问题通报、照片检查、标准核对 |
| `oilfield-it-project-management` | 信息化工具箱、立项、方案、技术选型、标杆对比、内网调研、周报、综合报告、领导汇报 |
| `knowledge-management` | 资料整理、知识蒸馏、Wiki 构建与巡检 |
| `skill-governance` | Skill 审计、评分、去重、合并、优化与下线 |
| `cognitive-profile` | 本地用户画像与数字分身偏好维护 |
| `office-assistant` | 多版本内容生成与本地比较评分 |

## 主动移除的外网入口

`aihot`、`autoresearch`、`browser-use`、`deep-research`、`github`、`github-trending-cn`、`image-well`、`mcp-criticagent`、`nano-banana-pro`、`openai-whisper-api`、`tencent-esign-contract`、`tencent-meeting-skill`、`tencentcloud-ocr`、`web-access`、`wpscli`。

`darwin-skill` 和 `skill-criticagent` 的 Skill 评分、迭代优化与验证方法已合并到 `skill-governance`；`yourself-skill` 的本地画像能力已合并到 `cognitive-profile`，不属于无去向删除。

## 办公网约束

- 路由无法再选择已删除的 GitHub 或公网 Skill。
- 办公、知识、报告、合同、标书子智能体不开放 `websearch` 或 `webfetch`。
- PDF、DOCX、论文核引、Obsidian、Manim、Markdown 转换等保留 Skill 仅允许使用本机或随包运行时；缺依赖时报告缺项，不自动联网安装。
- 本地证据不足时使用 `待补充/待人工确认`，不以公网记忆补齐事实。

## 恢复点

- 备份：`E:\software programming\opencode-skill-backups\opencode-dev-skills-before-governance-20260827.zip`
- SHA-256：`8BB4264CEF83C51AF10EA127D676A424939C462040AC7436EC83FC600906D6FF`
- 复核：ZIP 共 658 个条目，其中 80 个 `SKILL.md`（包含嵌套子 Skill），顶层 `skills/<name>/SKILL.md` 恰好 69 个。

## 验证

- 27/27 个顶层 Skill 通过 `skill-creator/scripts/quick_validate.py`（Windows UTF-8 模式）。
- 路由与真实 Skill Tool 加载：20 通过，0 失败。
- Skill 管理与迁移回归：71 通过，0 失败。
- Desktop RC 配置与资源完整性：6 通过，0 失败。
- `packages/opencode` 与 `packages/desktop` 类型检查通过。
