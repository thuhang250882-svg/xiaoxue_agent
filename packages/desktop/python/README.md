# 录井小雪内置 Python 运行时

Windows 安装包内置精简 Python，用于办公插件和用户脚本开箱即用。现有 DOCX、XLSX、PDF 核心解析仍优先使用 TypeScript 实现。

## 默认库

- Word: python-docx
- Excel: openpyxl, pandas, xlrd
- PDF: pdfplumber, PyMuPDF
- 图像与文档输出: Pillow, reportlab
- 配置: PyYAML

不包含 Torch、Transformers、OCR、GUI 框架和开发工具。运行时设置 PYTHONNOUSERSITE=1，避免用户机器上的 Python 包污染审核结果。

## 制作

在 packages/desktop 中运行：

```powershell
$env:XIAOXUE_PYTHON_SOURCE = "C:\Python314\python.exe"
bun run python:prepare
bun run python:verify
```

内网构建可设置 XIAOXUE_PYTHON_WHEELHOUSE，脚本将使用 --no-index 从本地 wheel 目录安装。
生成目录 resources/python 不进入 Git，由 Windows 发布流水线制作。
