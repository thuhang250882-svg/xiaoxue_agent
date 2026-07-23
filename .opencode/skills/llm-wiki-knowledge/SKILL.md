---
name: llm-wiki-knowledge
description: LLM Wiki 知识管理专家。用于把原始制度、标准、报告、会议纪要和专业资料编译为可追溯 Markdown Wiki，执行增量更新、双向链接、矛盾标注、知识查询和健康巡检；当用户点名“LLM Wiki”“知识编译”，或要求初始化 Wiki、灌入资料、检查孤立页/过时内容/矛盾时使用。
---

# LLM Wiki 知识管理专家

## 目录模型

```text
wiki_root/
├── raw/              # 原始资料，只读
├── wiki/
│   ├── index.md
│   ├── log.md
│   ├── entities/
│   ├── concepts/
│   └── topics/
└── SCHEMA.md
```

## 工作模式

- `ingest`：读取一个来源，创建或增量更新页面、链接、索引和日志。
- `query`：从索引定位页面，综合回答并逐项标明 Wiki 来源。
- `lint`：检查矛盾、过时信息、孤立页面、缺失引用、缺失链接和数据缺口。

## 不可违反

- `raw/` 永远只读，不修改、不覆盖原始资料。
- 事实必须引用原始来源；AI 综合推理必须单独标记。
- 来源冲突必须显式保留并标记，不得擅自选择一个结论覆盖另一个。
- 每次 ingest 都更新 `wiki/index.md` 和 `wiki/log.md`。
- 页面使用 kebab-case 文件名和 `[[relative-path]]` 链接。
- 现有 `knowledge_manage` 负责受控资料入库和版本；`knowledge_search` 负责可追溯查询。未实现 Wiki 文件写入能力时，不得声称已经创建页面。

## 页面结构

页面包含元数据、摘要、详情、关联、引用来源和变更记录。查询产生值得沉淀的新洞察时，先建议归档并等待用户确认。

完整页面模板、索引格式和巡检指标见 [references/skill-summary.md](references/skill-summary.md)。执行初始化、ingest 或 lint 时读取。
