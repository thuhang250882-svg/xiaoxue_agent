import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "./dialog"
import { useBindings } from "../keymap"

export function DialogDocs() {
  const dialog = useDialog()
  const { theme } = useTheme()

  useBindings(() => ({
    bindings: [
      { key: "return", desc: "关闭文档", group: "Dialog", cmd: () => dialog.clear() },
      { key: "escape", desc: "关闭文档", group: "Dialog", cmd: () => dialog.clear() },
    ],
  }))

  const sections = [
    { title: "概述", body: "录井小雪（xiaoxue_Agent）是一款本地化智能办公助手，专为地质录井报告审核和日常办公任务设计。" },
    { title: "主要功能", body: "1. 地质录井报告审核 - 支持 docx/xlsx/pdf 格式，自动检测问题\n2. 日常办公 - 工作总结、会议纪要、整改清单、文档润色\n3. 知识库查询 - 检索公司制度、标准规范、报告模板\n4. 文档生成 - 审核意见、汇报提纲、技术方案、项目材料" },
    { title: "常用命令", body: "/help     - 显示帮助\n/new      - 新建会话\n/sessions - 会话列表\n/models   - 切换模型\n/connect  - 配置AI提供商\n/compact  - 压缩长会话\n/export   - 导出会话\n/themes   - 切换主题\n/init     - 生成项目规则\n/undo     - 撤销上次操作\n/redo     - 恢复撤销\n/exit     - 退出程序" },
    { title: "快捷键", body: "Ctrl+Shift+P - 打开命令面板\nCtrl+N       - 新建会话\nCtrl+`       - 切换终端\nCtrl+,       - 打开设置\nCtrl+Shift+T - 切换主题" },
    { title: "配置说明", body: "模型配置: 在设置中配置AI模型提供商（Kimi、DeepSeek等）\n知识库路径: 设置知识库文件的本地路径\n审核规则: 编辑 domains/geology_report/rules/ 下的 YAML 文件\n配置文件: opencode.json（服务器设置）、tui.json（终端界面设置）" },
    { title: "常见问题", body: "Q: 如何导出审核报告？\nA: 完成审核后，点击审核结果页面的“导出审核意见”按钮。\n\nQ: 如何查看历史审核记录？\nA: 点击主界面的“审核记录”工作流。\n\nQ: 如何更新审核规则？\nA: 编辑 domains/geology_report/rules/ 目录下的 YAML 规则文件。" },
  ]

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          录井小雪 - 离线帮助文档
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc/enter
        </text>
      </box>
      {sections.map((section) => (
        <box gap={0}>
          <text fg={theme.primary} attributes={TextAttributes.BOLD}>
            {"\n"}{section.title}
          </text>
          <text fg={theme.textMuted}>
            {section.body}
          </text>
        </box>
      ))}
      <box flexDirection="row" justifyContent="flex-end" paddingBottom={1}>
        <box paddingLeft={3} paddingRight={3} backgroundColor={theme.primary} onMouseUp={() => dialog.clear()}>
          <text fg={theme.selectedListItemText}>确定</text>
        </box>
      </box>
    </box>
  )
}
