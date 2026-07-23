import { BrowserWindow, dialog, shell, app } from "electron"
import type { DesktopMenuAction } from "@opencode-ai/app/desktop-menu"
import { createMainWindow, updateTitlebar } from "./windows"

export type DesktopMenuActionHandlers = Partial<{
  checkForUpdates: () => void
  relaunch: () => void
}>

export function runDesktopMenuAction(
  win: BrowserWindow | null,
  action: DesktopMenuAction,
  handlers: DesktopMenuActionHandlers = {},
) {
  switch (action) {
    case "app.checkForUpdates":
      handlers.checkForUpdates?.()
      return
    case "app.relaunch":
      handlers.relaunch?.()
      return
    case "app.about":
      showAboutDialog(win)
      return
    case "app.help":
      showHelpDialog(win)
      return
    case "window.new":
      createMainWindow()
      return
    case "window.close":
      win?.close()
      return
    case "window.minimize":
      win?.minimize()
      return
    case "window.toggleMaximize":
      if (win?.isMaximized()) {
        win.unmaximize()
        return
      }
      win?.maximize()
      return
    case "view.reload":
      win?.reload()
      return
    case "view.toggleDevTools":
      win?.webContents.toggleDevTools()
      return
    case "view.resetZoom":
      setZoom(win, 1)
      return
    case "view.zoomIn":
      setZoom(win, (win?.webContents.getZoomFactor() ?? 1) + 0.2)
      return
    case "view.zoomOut":
      setZoom(win, (win?.webContents.getZoomFactor() ?? 1) - 0.2)
      return
    case "view.toggleFullscreen":
      win?.setFullScreen(!win.isFullScreen())
      return
    case "edit.undo":
      win?.webContents.undo()
      return
    case "edit.redo":
      win?.webContents.redo()
      return
    case "edit.cut":
      win?.webContents.cut()
      return
    case "edit.copy":
      win?.webContents.copy()
      return
    case "edit.paste":
      win?.webContents.paste()
      return
    case "edit.delete":
      win?.webContents.delete()
      return
    case "edit.selectAll":
      win?.webContents.selectAll()
      return
  }
}

function setZoom(win: BrowserWindow | null, value: number) {
  if (!win) return
  win.webContents.setZoomFactor(Math.min(Math.max(value, 0.2), 10))
  updateTitlebar(win)
}

function showAboutDialog(win: BrowserWindow | null) {
  const version = app.getVersion()
  const name = app.getName()
  const parent = win ?? BrowserWindow.getFocusedWindow()
  const opts: Electron.MessageBoxOptions = {
    type: "info",
    title: "关于录井小雪",
    message: "录井小雪",
    detail: [
      `版本: ${version}`,
      `产品名称: ${name}`,
      "",
      "录井小雪 — 企业业务智能体",
      "面向石油钻探录井工程的AI助手",
      "",
      "功能: 地质报告审核 | 标书审核 | 合同审核",
      "      企业办公 | 知识查询 | 文档生成",
      "",
      "技术支持: 西部钻探地质研究院数据中心",
      "© 2024-2026 中国石油集团西部钻探工程有限公司",
      "录井工程分公司",
    ].join("\n"),
    buttons: ["确定"],
    noLink: true,
  }
  if (parent) dialog.showMessageBox(parent, opts)
  else dialog.showMessageBox(opts)
}

function showHelpDialog(win: BrowserWindow | null) {
  const parent = win ?? BrowserWindow.getFocusedWindow()
  const detail = [
    "【快速开始】",
    "1. 点击首页的工作流卡片，选择要执行的任务",
    "2. 上传文件（DOCX/XLSX/TXT），小雪会自动审核",
    "3. 在聊天框输入问题，小雪会检索知识库回答",
    "",
    "【支持的任务】",
    "• 地质报告审核 — 上传录井报告，自动检查结构、岩性、油气显示",
    "• 标书智能审核 — 上传招标/投标文件，提取资格条件和废标风险",
    "• 合同风险审核 — 上传合同，检查服务范围、付款、违约责任",
    "• 日常办公助手 — 生成工作总结、汇报、纪要、方案",
    "• 企业知识库 — 查询专业标准、企业制度、历史案例",
    "• 文档生成 — 生成审核意见、技术方案、项目材料",
    "",
    "【文件格式】",
    "支持 DOCX、XLSX、TXT、CSV；真实 PDF 解析将在后续版本提供",
    "",
    "【桌面宠物】",
    "右下角的小雪助手可随时拖动，点击收起为头像",
    "",
    "【获取支持】",
    "如遇问题请联系技术支持。",
  ].join("\n")
  const opts: Electron.MessageBoxOptions = {
    type: "info",
    title: "使用帮助 — 录井小雪",
    message: "录井小雪 使用帮助",
    detail,
    buttons: ["知道了"],
    noLink: true,
  }
  if (parent) dialog.showMessageBoxSync(parent, opts)
  else dialog.showMessageBoxSync(opts)
}
