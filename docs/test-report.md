# 录井小雪 0.8 测试报告

日期：2026-07-13

## 覆盖范围
- 主窗口 Provider 流式聊天与明确错误反馈
- 桌宠任务提交契约与状态变化
- 审核历史持久化和 DOCX 重新导出
- 三类地质报告回归案例
- 原生文本 PDF 及错误边界
- 企业知识检索引用字段与 TopK 评估
- app、opencode、desktop 类型检查和桌面生产构建

## 自动化基线
- 组合回归测试：67 passed，0 failed
- 知识检索评估：Top1 80%，Top3 100%，Top5 100%
- packages/app、packages/opencode、packages/desktop 类型检查通过
- packages/desktop 生产构建通过
- git diff --check 通过

本报告不把 GUI 视觉验收或扫描件 OCR 计为自动化通过项。

## 人工验收
桌面 GUI 仍需在 Windows 安装包中确认主窗口输入、桌宠输入、托盘恢复、文件选择器和 Word/WPS 打开导出文件。
