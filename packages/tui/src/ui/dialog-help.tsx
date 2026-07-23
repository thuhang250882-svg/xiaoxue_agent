import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "./dialog"
import { useBindings, useCommandShortcut } from "../keymap"

export function DialogHelp() {
  const dialog = useDialog()
  const { theme } = useTheme()
  const commandShortcut = useCommandShortcut("command.palette.show")

  useBindings(() => ({
    bindings: [
      { key: "return", desc: "关闭帮助", group: "Dialog", cmd: () => dialog.clear() },
      { key: "escape", desc: "关闭帮助", group: "Dialog", cmd: () => dialog.clear() },
    ],
  }))

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          帮助 - 录井小雪
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc/enter
        </text>
      </box>
      <box paddingBottom={1}>
        <text fg={theme.textMuted}>
          按 {commandShortcut()} 查看所有可用操作和命令。
        </text>
      </box>
      <box paddingBottom={1}>
        <text fg={theme.text}>
          常用命令
        </text>
      </box>
      <box flexDirection="row" gap={2}>
        <text fg={theme.textMuted}>  /help     - 显示帮助</text>
      </box>
      <box flexDirection="row" gap={2}>
        <text fg={theme.textMuted}>  /new      - 新建会话</text>
      </box>
      <box flexDirection="row" gap={2}>
        <text fg={theme.textMuted}>  /sessions - 会话列表</text>
      </box>
      <box flexDirection="row" gap={2}>
        <text fg={theme.textMuted}>  /models   - 切换模型</text>
      </box>
      <box flexDirection="row" gap={2}>
        <text fg={theme.textMuted}>  /connect  - 配置AI提供商</text>
      </box>
      <box flexDirection="row" gap={2}>
        <text fg={theme.textMuted}>  /compact  - 压缩长会话</text>
      </box>
      <box flexDirection="row" gap={2}>
        <text fg={theme.textMuted}>  /export   - 导出会话</text>
      </box>
      <box flexDirection="row" gap={2}>
        <text fg={theme.textMuted}>  /themes   - 切换主题</text>
      </box>
      <box flexDirection="row" gap={2}>
        <text fg={theme.textMuted}>  /exit     - 退出程序</text>
      </box>
      <box paddingBottom={1}>
        <text fg={theme.textMuted}>
          输入 /docs 查看完整离线帮助文档。
        </text>
      </box>
      <box flexDirection="row" justifyContent="flex-end" paddingBottom={1}>
        <box paddingLeft={3} paddingRight={3} backgroundColor={theme.primary} onMouseUp={() => dialog.clear()}>
          <text fg={theme.selectedListItemText}>确定</text>
        </box>
      </box>
    </box>
  )
}
