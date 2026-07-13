# 文档引擎

负责把 Word、Excel、原生文本 PDF、TXT、CSV 转为可审核的结构化片段。PDF 支持可复制文字的真实二进制文件和页码定位；扫描件、图片型 PDF 与 OCR 暂不支持。

## MVP 解析目标

- docx：段落、标题、表格、页内位置近似标记
- xlsx：工作表、表头、单元格、合并单元格提示
- pdf：原生文本逐页提取、页码与段落定位；扫描件明确返回 `PDF_NO_EXTRACTABLE_TEXT`
- txt/csv：纯文本和表格兜底解析

## 输出片段字段

```json
{
  "file_id": "file_001",
  "source_file": "XX井地质录井报告.docx",
  "kind": "paragraph|table|sheet|page_text",
  "location": "第3章/第12页/Sheet1!A1:D20",
  "text": "片段内容",
  "metadata": {}
}
```