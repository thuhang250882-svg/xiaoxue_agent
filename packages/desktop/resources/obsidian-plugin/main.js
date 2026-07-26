const { Notice, Plugin } = require("obsidian")

module.exports = class XiaoxueAssistantPlugin extends Plugin {
  async onload() {
    this.addRibbonIcon("snowflake", "发送当前笔记给小雪", () => this.capture())
    this.addCommand({
      id: "capture-current-note",
      name: "发送当前笔记或选中文本给小雪",
      callback: () => this.capture(),
    })
  }

  async capture() {
    const file = this.app.workspace.getActiveFile()
    if (!file) {
      new Notice("请先打开一篇笔记。")
      return
    }
    const editor = this.app.workspace.activeEditor && this.app.workspace.activeEditor.editor
    const selection = editor ? editor.getSelection().trim() : ""
    const relative = "06-日常工作管理/智能体协作/小雪当前上下文.md"
    const parent = relative.slice(0, relative.lastIndexOf("/"))
    if (!(await this.app.vault.adapter.exists(parent))) await this.app.vault.adapter.mkdir(parent)
    const content = [
      "---",
      'type: "xiaoxue-current-context"',
      `updated: "${new Date().toISOString()}"`,
      `source: "${file.path.replaceAll('"', '\\"')}"`,
      "---",
      "",
      "# 小雪当前上下文",
      "",
      `来源：[[${file.path.replace(/\.md$/i, "")}]]`,
      "",
      selection ? "## 选中文本" : "## 当前笔记",
      "",
      selection || (await this.app.vault.read(file)),
      "",
    ].join("\n")
    await this.app.vault.adapter.write(relative, content)
    new Notice("已将当前上下文发送到小雪知识闭环。")
  }
}
