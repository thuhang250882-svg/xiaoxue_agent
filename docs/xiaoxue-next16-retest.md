# 录井小雪 next.16 内部复测记录（2026-09-28）

## 修复范围

- V2 对话框接收拖入或选择的 PPTX，按已有服务端 PPTX 文本提取链处理。
- 产物列表位于对话滚动区末尾，随回答滚动，并受消息内容宽度约束。
- 预览侧栏从窗口标题栏下方开始，避免与窗口控制按钮重叠。
- 修复产物数量、路径、批注和段落编号的多语言占位符显示。

## 自动化验证

- App 单测：844 pass，0 fail；浏览器条件测试：41 pass，0 fail。
- Session UI 测试：87 pass，0 fail；PPTX 无浏览器 MIME 元数据的附件识别测试通过。
- App、Session UI、Desktop 类型检查通过。
- Python 3.14.4、离线技能策略、办公网运行时探针、桌面构建及 sidecar 冒烟检查通过。
- Windows 安装包校验通过：10,964 条资源完整性记录及 Office/PDF/离线 OCR 运行时资源。

## 内部测试包

- 文件：`packages/desktop/dist/xiaoxue-output/录井小雪-0.9.0-next.16-win-x64.exe`
- 大小：423,529,847 字节。
- SHA-256：`E09BFFF05EC9CDE71F8E72A662FD0CE3BEED8AC4B86AADD003431F43EEA19A1C`
- Authenticode：`NotSigned`。

## 人工复测边界

尚未在办公电脑的实际安装版复测 PPTX 拖入、产物随滚动与侧栏位置，也未验证安装、升级和卸载。DOCX 当前提供本地段落文字编辑并另存副本；它不是完整的嵌入式 Word 排版编辑器，复杂行内格式可能变化。要实现原版式全功能编辑，还需要可嵌入的 Office 编辑引擎及相应授权。
