---
name: markitdown-skill
description: 使用本机已安装的 MarkItDown 将本地 Word、PowerPoint、Excel、PDF、图片或音频转换为 Markdown，适合批量文本提取和后续本地分析。办公网模式下不处理 URL、YouTube 或在线转写。
---

# 本地文件转 Markdown

仅转换用户明确指定的本地文件。不要访问 URL、下载模型、安装网络依赖或调用云端 OCR/转写。

## 使用顺序

1. 确认输入路径、文件类型、输出目录和是否允许覆盖。
2. 检查本机 `markitdown` 是否已安装；未安装时报告缺失，不在线安装。
3. 对支持的文件运行本地转换；批量任务保持源文件名并输出独立 `.md`。
4. 回读结果，报告空输出、乱码、表格丢失、OCR 不可用或音频转写不可用。

## 边界

- PDF 的合并、拆分、旋转、加密等结构操作使用 `pdfkit-py`。
- 需要保留 Word 格式、批注或修订痕迹时使用 `minimax-docx` 或 `document-review-tracked`。
- 需要编辑 Excel 或保留公式与格式时使用 `minimax-xlsx`。
- 云端 OCR、网页转换、YouTube 和外部语音 API 在本版本中不可用。

## 示例

```powershell
markitdown "C:\path\input.docx" -o "C:\path\output.md"
```

不要在未经用户确认时覆盖已有输出文件。
