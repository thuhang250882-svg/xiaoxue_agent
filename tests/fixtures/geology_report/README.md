# 地质录井报告回归样例

本目录用于存放“录井小雪”地质录井报告审核的脱敏或人工构造样例。

当前自动化测试会在运行时动态生成最小 DOCX 样例，避免把真实业务报告或涉密资料提交到仓库。

计划样例：

- minimal_valid_report.docx：章节基本完整的最小报告。
- missing_sections_report.docx：缺少关键章节。
- inconsistent_well_name_report.docx：正文和表格井号不一致。
- stratigraphy_overlap_report.docx：地层井段重叠。
- terminology_errors_report.docx：包含不规范术语。

expected/ 下只保存规则期望，不比对大模型自然语言全文。