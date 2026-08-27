---
name: knowledge-management
description: 整理本地资料、去重归类、提炼可追溯知识卡，并维护 Markdown Wiki 的索引、链接、版本和健康状态。只处理用户授权的本地或单位内网材料，不抓取网页。
---

# 本地知识管理

## 模式路由

- 批量资料分类、去重和结构化整理：读取 [material-organization.md](references/material-organization.md)，并按需读取分类、去重、提取和输出规则。
- 从制度、标准、报告或表格提炼证据化知识卡：读取 [knowledge-cards.md](references/knowledge-cards.md) 和 [knowledge-card-contract.md](references/knowledge-card-contract.md)。
- 初始化或维护 Markdown Wiki、双向链接、版本和健康巡检：读取 [wiki-management.md](references/wiki-management.md)。

## 统一边界

- 输入仅限用户明确授权的本地文件、目录和单位内网导出物；不打开 URL，不联网补资料。
- 原文、摘要、推断和冲突分别保存；缺失信息不补写为事实。
- 删除或移动用户原文件前必须再次确认；默认只生成整理结果和索引。
- 需要操作 Obsidian vault 时可加载 `obsidian`，但知识语义和溯源规则仍以本 Skill 为准。
