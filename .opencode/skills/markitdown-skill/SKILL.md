---
name: markitdown-skill
description: Historical local-file conversion Skill retained outside the office-network release. Do not use it in the Xiaoxue office-network profile because its conversion, image OCR, and audio transcription runtime is not bundled.
---

# MarkItDown（办公网版本不可用）

本 Skill 不进入录井小雪办公网安装包，也不得被确定性路由或自动调用。

收到通用文件转 Markdown、图片文字识别或音频转写请求时，直接说明对应本地运行时未包含在当前办公网版本中。不要寻找系统命令、用户 Python 包或其他外部程序作为替代，也不要修改本机环境。

扫描 PDF 的文字识别是独立能力，仅在 `pdfkit-py` 已通过安装包运行时探针时使用。
