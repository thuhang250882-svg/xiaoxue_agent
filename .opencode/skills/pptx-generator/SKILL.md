---
name: pptx-generator
description: 创建或修改可编辑 PPTX 演示文稿。处理用户拖入或指定路径的 PowerPoint，保留原模板并输出新的同类型文件；也可从 JSON 新建含图表、表格、时间线和图片的 PPTX。
metadata:
  openclaw:
    emoji: "\U0001F4CA"
    requires:
      bins:
        - python3
      env: []
license: MIT-0
---

# PPT Generator

创建或修改标准、可编辑的 PowerPoint 演示文稿。文件处理任务必须交付 `.pptx`，不能只给修改建议。

## 交付契约

- 用户要求审核、批注、整改或同时查看修改痕迹时，先形成精确修改决定并调用 `office_document_revise`，同时交付 PPTX 标注版和最终修改版；本技能的单文件编辑流程只用于用户明确只要一个修改结果的场景。
- 用户提供 PPTX 并要求修改时，以原文件为模板做局部编辑，另存为新的 `.pptx`；不得覆盖原件，也不得退化成 Markdown、图片或纯文字建议。
- 直接编辑仅支持 OOXML `.pptx`；旧版二进制 `.ppt` 必须先由用户在 PowerPoint/WPS 中另存为 `.pptx`，不得假装已经解析或修改。
- 默认保留页面尺寸、母版、主题、页数、版式、动画之外的现有可编辑对象。用户明确要求重做版式时才重建相关页面。
- 输出文件放在用户源文件同目录或会话明确的输出目录，名称使用 `<原名>（已修改）.pptx`；同名存在时追加时间或“新”。
- 最终回复必须明确给出输出 PPTX 的绝对路径，供宿主在右侧产物预览中打开；不要只报告脚本路径或临时 JSON。
- 保存并验证后必须调用 `office_artifact_preview`，传入输出 PPTX 的绝对路径；该调用负责在会话中生成“右侧预览”入口。调用失败时仍需交付原文件路径，并明确预览未生成。
- 修改完成后重新打开 PPTX，核对页数、标题、目标文本/图表是否存在；能渲染时还要逐页检查预览，不能用“脚本执行成功”代替版式验收。

## 修改已有 PPTX

1. 先读取用户提供的 PPTX，建立逐页内容清单，确认修改范围。
2. 使用 `python-pptx` 打开原文件并只修改目标对象；未命中的修改必须报错或进入人工确认，不能静默跳过。
3. 需要新增页面时优先复用原演示文稿的相近版式与主题，不另起一套视觉系统。
4. 另存新文件并重新打开验证。原文件始终保持不变。

如果请求超出下面的 JSON 生成器能力，可在工作目录编写一次性 Python 脚本操作原 PPTX；模型负责决定改什么，代码负责精确定位和写回文件。

## 新建 PPTX

通过 JSON 描述生成标准、可编辑的 PowerPoint 演示文稿。

## 用法

```bash
python3 scripts/generate_pptx.py slides.json --out output.pptx
```

## JSON 结构

```json
{
  "style": "business_blue",
  "footer": "机密",
  "page_numbers": true,
  "output": "report.pptx",
  "slides": [
    { "type": "cover", "title": "标题", "subtitle": "副标题", "variant": "centered" },
    { "type": "section", "title": "第一部分" },
    { "type": "agenda", "title": "目录", "topics": ["主题1", "主题2"], "highlight": 0 },
    { "type": "content", "title": "内容页", "items": ["要点1", "要点2"], "columns": 1 },
    { "type": "two_column", "title": "双栏", "left": ["左栏"], "right": ["右栏"] },
    { "type": "table", "title": "表格", "headers": ["A", "B"], "rows": [[1, 2]] },
    {
      "type": "chart",
      "title": "图表",
      "chart_type": "bar|line|pie",
      "categories": ["Q1", "Q2"],
      "series": [{ "name": "S1", "values": [10, 20] }]
    },
    { "type": "timeline", "title": "时间线", "milestones": [{ "label": "阶段1", "desc": "描述" }] },
    { "type": "quote", "title": "", "quote": "内容", "attribution": "作者" },
    { "type": "image", "title": "图片", "image_path": "img.png", "overlay": false },
    { "type": "summary", "title": "总结", "points": ["要点"], "conclusion": "结论" },
    { "type": "contact", "title": "联系我们", "info": "邮箱/电话" }
  ]
}
```

## 幻灯片类型（11 种）

| 类型       | 功能                                    |
| ---------- | --------------------------------------- |
| cover      | 封面，3 种变体：centered / left / split |
| section    | 过渡页/章节分隔                         |
| agenda     | 目录页，支持高亮当前章节                |
| content    | 内容页，支持单栏/双栏、多级列表         |
| two_column | 双栏对比                                |
| table      | 表格（隔行变色）                        |
| chart      | 图表（柱状/折线/饼图）                  |
| timeline   | 时间线/里程碑                           |
| quote      | 引用/强调                               |
| image      | 图片页，支持普通/全屏叠加两种模式       |
| summary    | 总结页，底部结论框                      |
| contact    | 结尾/联系信息页                         |

## 配色方案（5 套）

| 风格            | 适用场景           |
| --------------- | ------------------ |
| business_blue   | 商业汇报，专业稳重 |
| academic_white  | 学术论文，简洁规范 |
| creative_purple | 创意展示，时尚活力 |
| tech_dark       | 技术分享，现代高端 |
| minimal_gray    | 通用场景，简约百搭 |

## 能力变更（v2.0.0）

- **修复**: 副标题与标题共用 textbox 导致重叠
- **修复**: `layout` 参数声明但未使用
- **修复**: 图片幻灯片不检查文件是否存在
- **修复**: 标题栏硬编码 10 英寸宽度
- **新增**: 11 种幻灯片类型（原 7 种 → 11 种）
- **新增**: 分页目录页（agenda）
- **新增**: 封面 3 种变体（居中/居左/分割）
- **新增**: 图表支持（柱状图/折线图/饼图）
- **新增**: 时间线/里程碑
- **新增**: 引用/强调页
- **新增**: 结尾/联系信息页
- **新增**: 自动页码 + 页脚
- **新增**: 渐变色背景
- **新增**: 多级列表支持
- **新增**: 10 色完整调色板（原 5 色 → 10 色角色）
- **新增**: JSON 驱动生成管线
- **新增**: 错误跳过 + 逐页报告
