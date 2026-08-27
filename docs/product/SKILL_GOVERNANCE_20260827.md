# 录井小雪 Skill 治理记录（2026-08-27）

## 结果

- 仓库顶层可发现 Skill：69 → 27。
- Skill 中心预计显示：27 个产品 Skill + 1 个内置 `customize-opencode`，合计约 28 个。
- GitHub、公网搜索、浏览器自动化、云 OCR、云转写、云文档转换、云图片生成、外部会议和电子签能力已从产品 Skill 目录、智能体白名单和路由中移除。
- 所有保留 Skill 均通过标准 `SKILL.md` 结构校验。

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

## 删除的外网或重复入口

`aihot`、`autoresearch`、`browser-use`、`deep-research`、`github`、`github-trending-cn`、`image-well`、`nano-banana-pro`、`openai-whisper-api`、`tencent-esign-contract`、`tencent-meeting-skill`、`tencentcloud-ocr`、`web-access`、`wpscli`、`yourself-skill`，以及已被上述统一入口吸收的细分 Skill。

## 办公网约束

- 路由无法再选择已删除的 GitHub 或公网 Skill。
- 办公、知识、报告、合同、标书子智能体不开放 `websearch` 或 `webfetch`。
- PDF、DOCX、论文核引、Obsidian、Manim、Markdown 转换等保留 Skill 仅允许使用本机或随包运行时；缺依赖时报告缺项，不自动联网安装。
- 本地证据不足时使用 `待补充/待人工确认`，不以公网记忆补齐事实。

## 恢复点

- 备份：`E:\software programming\opencode-skill-backups\opencode-dev-skills-before-governance-20260827.zip`
- SHA-256：`8BB4264CEF83C51AF10EA127D676A424939C462040AC7436EC83FC600906D6FF`

## 验证

- 27/27 个顶层 Skill 通过 `skill-creator/scripts/quick_validate.py`（Windows UTF-8 模式）。
- 路由与真实 Skill Tool 加载：20 通过，0 失败。
- Skill 管理与迁移回归：71 通过，0 失败。
- Desktop RC 配置与资源完整性：6 通过，0 失败。
- `packages/opencode` 与 `packages/desktop` 类型检查通过。
