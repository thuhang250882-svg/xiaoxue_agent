# 录井小雪 - 使用帮助（离线文档）

## 概述

录井小雪（xiaoxue_Agent）是一款基于 opencode 开源项目本地化定制的智能办公助手，专为地质录井报告审核和日常办公任务设计。

## 主要功能

### 1. 地质录井报告审核
- 支持 docx、xlsx、pdf 格式的报告文件上传
- 自动检测报告中的问题和不一致
- 支持导出审核意见（DOCX格式）
- 审核记录自动保存

### 2. 日常办公
- 工作总结与阶段汇报
- 会议纪要整理
- 整改清单生成
- 文档润色与排版

### 3. 知识库查询
- 检索公司制度
- 查询标准规范
- 查找报告模板
- 参考专家经验

### 4. 文档生成
- 审核意见生成
- 汇报提纲创建
- 技术方案起草
- 项目材料编写

## 快速开始

### 启动应用

```bash
# 桌面版启动
bun run dev:desktop

# Web版启动
bun run dev:web

# 终端版启动
bun run dev
# 或
xiaoxue
```

### 使用流程

1. **报告审核**
   - 输入 `/connect` 配置AI提供商
   - 上传需要审核的报告文件
   - 等待审核完成
   - 查看审核结果并导出意见

2. **日常办公**
   - 在对话中描述需要完成的任务
   - 小雪将协助完成任务

3. **知识查询**
   - 在对话中输入查询主题
   - 获取相关知识和来源

## 终端界面命令

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助对话框 |
| `/docs` | 查看离线帮助文档 |
| `/new` | 新建会话 |
| `/sessions` | 会话列表管理 |
| `/models` | 切换AI模型 |
| `/connect` | 配置AI提供商 |
| `/compact` | 压缩长会话 |
| `/export` | 导出会话为Markdown |
| `/themes` | 切换主题 |
| `/init` | 自动生成项目规则 |
| `/undo` | 撤销上次操作 |
| `/redo` | 恢复撤销操作 |
| `/share` | 分享会话 |
| `/unshare` | 取消分享 |
| `/rename` | 重命名当前会话 |
| `/review` | 审查代码变更 |
| `/exit` | 退出程序 |

## 快捷键

| 操作 | 快捷键 |
|------|--------|
| 打开命令面板 | `Ctrl+Shift+P` |
| 新建会话 | `Ctrl+N` |
| 切换终端 | `` Ctrl+` `` |
| 打开设置 | `Ctrl+,` |
| 切换主题 | `Ctrl+Shift+T` |

## 命令行用法

```bash
# 启动终端界面
xiaoxue [项目路径]

# 以消息方式运行（非交互）
xiaoxue run "你的消息"

# 恢复上次会话
xiaoxue --continue

# 附加文件运行
xiaoxue run -f 文件路径

# 启动无头服务器
xiaoxue serve

# 启动Web界面
xiaoxue web

# 列出可用模型
xiaoxue models

| 管理AI提供商
xiaoxue providers

# 管理智能体
xiaoxue agent

# 查看使用统计
xiaoxue stats

# 导出会话
xiaoxue export

# 升级
xiaoxue upgrade

# 调试
xiaoxue debug config
```

## 配置说明

### 配置文件位置
- 全局配置: `~/.config/opencode/opencode.json`
- 终端界面配置: `~/.config/opencode/tui.json`
- 项目配置: 项目根目录下的 `opencode.json`

### 模型配置
在配置文件或设置中配置AI模型提供商，支持：
- Kimi
- DeepSeek
- 其他 OpenAI 兼容模型

```json
{
  "model": "deepseek/deepseek-chat",
  "provider": {
    "deepseek": {
      "apikey": "your-api-key"
    }
  }
}
```

### 知识库路径
设置知识库文件的本地路径，用于存储和检索公司文档。

### 审核规则
编辑 `domains/geology_report/rules/` 目录下的 YAML 规则文件，自定义审核规则。

### 终端界面配置
```json
{
  "theme": "system",
  "keybinds": {
    "help.show": "ctrl+h"
  }
}
```

## 常见问题

**Q: 如何导出审核报告？**
A: 完成审核后，使用 `/export` 命令或点击审核结果页面的"导出审核意见"按钮。

**Q: 如何查看历史审核记录？**
A: 使用 `/sessions` 命令查看历史会话列表。

**Q: 如何更新审核规则？**
A: 编辑 `domains/geology_report/rules/` 目录下的 YAML 规则文件。

**Q: 如何配置AI模型？**
A: 运行 `/connect` 命令，或在 `opencode.json` 配置文件中设置 `provider` 和 `model`。

**Q: 如何切换深色/浅色主题？**
A: 运行 `/themes` 命令选择主题，或在配置中设置 `"theme": "system"` 跟随系统。

## 技术支持

如有问题，请联系录井小雪开发团队。

---

*基于 opencode 开源项目 (MIT License) 本地化定制*
*Copyright (c) 2025-2026 xiaoxue_Agent Team*
