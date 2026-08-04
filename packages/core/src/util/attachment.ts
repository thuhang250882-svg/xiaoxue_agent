// 图片与 PDF 需要内联字节内容（模型视觉输入、历史缩略预览）；其余类型（Office、
// 文本）在有本地路径时按 file:// 引用发送，由服务端读盘解析，避免超大 base64
// data URL 进入会话历史拖垮渲染进程。
export function requiresInlineAttachment(mime: string) {
  return mime.startsWith("image/") || mime === "application/pdf"
}
