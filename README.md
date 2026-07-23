# 录井小雪 xiaoxue_agent

面向中国石油集团西部钻探工程有限公司录井工程分公司的企业级业务智能体平台。

录井小雪以 OpenCode 为运行框架，聚焦企业知识、专业资料审核、文档流程和办公协作。它不是现场控制系统，也不是简单的通用聊天界面。

## 产品定位

```text
OpenCode       = 智能体运行框架
xiaoxue_agent  = 业务人格与技能编排
Domains        = 专业能力模块
Knowledge      = 企业知识资产
DocumentEngine = 文档解析与导出
```

核心能力：

- 地质录井报告审核
- 标书智能审核
- 合同风险审核
- 企业日常办公
- 企业知识库查询
- 专业文档生成

## 工作台

桌面首页提供六个业务入口：

1. 地质报告审核
2. 标书智能审核
3. 合同风险审核
4. 日常办公助手
5. 企业知识库
6. 文档生成

## Agent

| Agent | 职责 |
| --- | --- |
| `xiaoxue` | 企业业务主智能体，负责业务识别和技能编排 |
| `report` | 地质录井报告与多资料一致性审核 |
| `tender` | 招标文件、评分标准和投标响应审核 |
| `contract` | 合同条款和履约风险审核 |
| `office` | 企业材料写作、润色与结构化输出 |
| `knowledge` | 企业制度、专业标准、模板与案例查询 |
| `review` | 通用文档审阅，保留兼容但不作为首页主入口 |

## Prompt 与 Skill

核心人格位于：

```text
configs/xiaoxue/system.md
```

配置结构：

```text
configs/xiaoxue/
├── system.md
├── identity.yaml
├── skills.yaml
└── rules.yaml
```

业务能力规范位于 `skills/xiaoxue/`。`configs/xiaoxue/skills.yaml` 将能力规范映射到 `.opencode/skills/` 下现有可执行 Skill，继续复用 OpenCode 的 Skill discovery 和 `skill` Tool。

## 专业模块

```text
domains/geology_report/   地质录井报告规则审核与 ReviewResult
domains/office/           企业办公任务与文档输出
document_engine/          DOCX/XLSX 解析及 DOCX/HTML 导出
knowledge/                企业知识资产目录
avatar/xiaoxue_pet/       小雪状态定义
```

报告审核支持真实 DOCX、XLSX、TXT 和 CSV 附件。`report` Agent 调用 `geology_report_review` Tool，完成附件读取、文档解析、规则审核、结构化展示和审核意见导出。

## 开发

要求 Bun 1.3.14 或项目 `packageManager` 指定版本。

```powershell
bun install
bun dev:desktop
```

Web 开发：

```powershell
bun dev:web
```

## 验证

```powershell
cd packages/app
bun typecheck

cd ../opencode
bun typecheck

cd ../desktop
bun typecheck
bun run build
```

报告审核回归测试从包目录运行：

```powershell
cd packages/opencode
bun test ../../tests/geology_report/e2e/upload_docx_review.test.ts ../../domains/geology_report/__tests__/docx_parser_exporter.test.ts
```

## 数据与专业边界

- 企业资料应在授权范围内使用，入库前进行脱敏并保留来源与版本。
- 标准、制度、合同和专业结论必须基于可核验资料，不得编造依据。
- 历史案例和专家经验只作辅助，不覆盖当前文件原文。
- 涉及重大地质认识、合同责任和管理决策时，由专业人员最终确认。

## 上游项目与许可

本项目基于 OpenCode 开源项目进行二次开发，遵循仓库中的 MIT License。录井小雪是本地业务定制版本，不代表 OpenCode 上游团队提供或背书。