---
name: ppt-implement
description: 新建高设计感、模板化、统一视觉系统的技术汇报、科研汇报和方案汇报 PPTX。适用于“做一份高质量技术汇报PPT”“精美PPT”“统一视觉系统”“模板化演示文稿”等请求；已有 PPT 修改、批注和普通快速产稿继续使用 pptx-generator 或 office-document-revision。
---

## 目标

基于用户提供的本地材料，使用本技能的 HTML/Tailwind 工程骨架与 660 个模板片段，顺序完成内容规划、视觉系统、逐页实现、截图校验和 PPTX 导出。最终交付可编辑的 `.pptx` 与本地预览，保持全稿视觉一致。

路径约定：

- `SKILL_DIR`：加载本技能后返回的技能目录，即 `.opencode/skills/ppt-implement/` 的绝对路径。
- `WORKSPACE_DIR`：本次 PPT 的独立工作目录。不得使用仓库根目录或技能目录充当工作目录。
- `XIAOXUE_PYTHON`：安装包内置 Python 的绝对路径；不得借用系统或用户 Python。

## 工作流程

1. 读取用户提供的本地材料，提取主题、受众、汇报目标、事实、数据和引用。不得访问公网搜集材料，不得编造缺失数据、来源或结论。将事实底稿写入 `${WORKSPACE_DIR}/docs/product/material.md`。
2. 规划 8–15 页章节结构，写入 `${WORKSPACE_DIR}/docs/product/chapters.md`。每页只表达一个核心观点，标明标题、要点、数据来源和推荐页面类型。
3. 建立统一视觉系统并写入 `${WORKSPACE_DIR}/docs/page-global-config.json`：16:9、主辅色、背景、字体、字号层级、间距与页码规则。字体只选本机可用的微软雅黑、等线、黑体、宋体、Arial、Calibri、Georgia 等，不加载 Google Fonts 或其他公网资源。
4. 需要数据图、时间线、流程、结构网格或对比图时，调用 `slide_visual`，把新 SVG 写到 `${WORKSPACE_DIR}/frontend/public/assets/images/`。概念示意无法由确定性图形准确表达时，使用图标与文字结构，不调用云端图片生成，不用占位图冒充成品。
5. 初始化工程：

   ```text
   node "${SKILL_DIR}/scripts/setup-project.js" "${SKILL_DIR}" "${WORKSPACE_DIR}"
   ```

   首次使用会在工作目录安装前端依赖；依赖和临时文件不得写入技能目录。安装失败必须保留 stderr 并停止，不得静默降级。
6. 按章节类型查阅 `references/templates/` 对应索引，只读取实际选中的模板。模板路径直接相对 `${SKILL_DIR}/references/templates/` 解析。
7. 严格按页码顺序生成 `${WORKSPACE_DIR}/frontend/src/slides/slide-N.js`。每生成一页立即执行：

   ```text
   node "${SKILL_DIR}/scripts/post-slide.js" "${WORKSPACE_DIR}" "${WORKSPACE_DIR}/frontend/src/slides/slide-N.js"
   ```

   不并行生成页面，不调用子代理，避免页间视觉与数据口径漂移。
8. 导出前逐页检查标题层级、文字溢出、元素重叠、边距、单位、图表图例、来源标注与页码连续性。发现问题先修改对应页面，再重新登记。
9. 生成截图（首次缺少 Chromium 时脚本会安装浏览器内核，需可访问依赖源）：

   ```text
   "${XIAOXUE_PYTHON}" "${SKILL_DIR}/scripts/screenshot-ppt.py" --url http://localhost:5173 --output "${WORKSPACE_DIR}/docs/posters/pages"
   ```

10. 导出 PPTX：

   ```text
   node "${SKILL_DIR}/scripts/export-ppt.js" "${SKILL_DIR}" "${WORKSPACE_DIR}"
   ```

11. 对 `${WORKSPACE_DIR}/artifacts/presentation.pptx` 调用 `office_artifact_preview`，确认可打开、页数正确且无明显错位后再交付。

## 输出格式

- 主交付：`${WORKSPACE_DIR}/artifacts/presentation.pptx`。
- 预览证据：`${WORKSPACE_DIR}/docs/posters/pages/page-N.png` 与 `office_artifact_preview` 结果。
- 可复现工程：`${WORKSPACE_DIR}/frontend/`、`${WORKSPACE_DIR}/docs/product/` 和 `${WORKSPACE_DIR}/docs/page-global-config.json`。
- 完成说明包含页数、主题、输出绝对路径、素材来源范围、依赖安装状态和未确认事项。

## 工作纪律

- 只用于新建高设计感演示文稿；已有 PPTX 修改与批注交给 `pptx-generator` 或 `office-document-revision`。
- 不覆盖用户已有文件。目标目录或 `presentation.pptx` 已存在时，使用新的工作目录或新文件名。
- 不修改 `SKILL_DIR`，不在其中生成 `node_modules`、浏览器缓存、截图、日志或 PPTX。
- 不使用公网字体、云端图片生成、API Key、登录态或未授权网页素材。
- 不并行生成幻灯片，不跳过逐页检查，不把 HTML 能打开当作 PPTX 已验证。
- 不伪造数据、引用、单位、图表来源或“已通过预览”的结论；不能验证时写“未确认，需要人工验证”。
