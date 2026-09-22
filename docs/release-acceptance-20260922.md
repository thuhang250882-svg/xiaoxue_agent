# 发布前签收记录（2026-09-22）

> 后续决策：用户明确取消安装包签名要求，本次改为将迭代合并到主线 worktree。下文保留检查时的历史事实；NotSigned 不再作为本次交付阻断项。主线集成结果见 mainline-integration-20260922.md。

结论：CHANGES_REQUIRED，当前安装包不具备本轮发布签收条件。自动检查通过部分可以作为源码验收证据，不能签收为已发布或已完成业务验收。本次未发布、未安装或卸载软件，未变更业务代码。

## 签收对象

- 工作区：E:/software programming/opencode-dev，分支 provider-network。
- HEAD：ac9be273cc8653126046dd762de8b7f6e0444b3a。存在大量修改与未跟踪功能文件，因此 HEAD 不能单独代表本次源码交付。
- 现有最新候选：packages/desktop/dist/xiaoxue-output/录井小雪-0.9.0-next.13-win-x64.exe。
- 文件大小：566710901 字节；修改时间：2026-09-20 23:46:20（本机时间）。
- SHA-256：B5F46B799C90A16022AA90344C13BC5196D32E4FF0149692FAC7F61FD360E9CA。
- Authenticode：NotSigned。只可作为内部测试候选，不能按正式签名包签收。
- 同目录 internal.yml 指向 next.13；源码 packages/desktop/package.json 仍为 next.10。下一候选必须确认构建实际版本与更新清单一致。
- 对 win-unpacked 的检查针对现有展开目录；本次未重新解包 EXE，不能将展开目录检查等同于 EXE 内容逐字节复核。

## 本次实际执行

| 检查 | 结果 |
| --- | --- |
| 日报、周报、PPT 技能及源码资源清单同步 | 10 pass，0 fail |
| 记忆存储、记忆采集、目录授权、Office 修改及快照 | 35 pass，0 fail |
| MDB 对照审核与 DOCX 解析/导出 | 14 pass，0 fail |
| opencode、core、app、desktop 的 bun typecheck | 四包均通过 |
| bun run python:verify | 通过，Python 3.14.4，包含 docx、xlrd、xlwt、xlutils、playwright 等 |
| OPENCODE_CHANNEL=prod 下执行 verify-packaged-windows.ts | 失败：Packaged Skill catalog must describe all 34 governed product Skills |

合计 59 项定向测试通过。命令从各包目录执行；地质测试从 packages/opencode 使用 ../../domains/geology_report/__tests__/mdb-review.test.ts 与 docx_parser_exporter.test.ts 运行。上述结果不代表全仓测试、GUI 或真实 Provider 端到端通过。

## 发布阻断与逐项签收

| 范围 | 状态 | 证据及关闭条件 |
| --- | --- | --- |
| 候选包包含本轮修复 | 阻断 | 展开目录缺少 daily-report/SKILL.md 与 ppt-implement/scripts/setup-project.js；weekly-report/SKILL.md 的包内哈希与源码不同。需从确定的源码快照构建新候选，校验技能目录、版本与安装包哈希。 |
| MDB 与报告审核 | 源码定向测试通过 | 无 MDB 审核、错井阻断、缺字段不判通过等已覆盖。新包内真实 MDB 导入与业务结果需重新验收；上一轮真实数据库结果不能证明旧包包含新代码。 |
| PPT 生成 | 未签收 | build-slides.js:128–130 捕获 Tailwind 错误后写回原始 mainCss 并继续，仍可能交付失去样式的 PPT。第 108 行将 Windows 路径直接插入 JS 字符串，也需验证转义。需补失败即停止及 Windows 路径验证，再使用实际 Tailwind 类生成多页文件并检查 PowerPoint 中的版式、中文字体和可编辑性。上一轮单页导出只证明基本导出路径。 |
| 修改与批注 | 源码部分通过 | DOCX 成功及未匹配整批拒绝已有测试；XLSX、PPTX、PDF 的实际修改与批注还需在新候选逐项验收。 |
| 实时预览 | 未达到原始需求 | 当前界面明确为结构化内容快照，无自动文件监听和 Office 原版式渲染。按“实时预览”发布仍不满足需求；应实现并验收，或由需求方明确接受快照范围。 |
| 日报/周报 | 源码与独立技能包部分通过 | 自检、运行时验证通过；日报默认 semantic、防覆盖已覆盖。现有桌面包未包含本轮技能，需要新包业务样本验证。 |
| 长期记忆 | 源码部分通过 | 新批次按工作区分组及采集测试通过。planReviewBatch 仅选择未分配证据，迁移只加 directory 列；已有混合批次不会自动重分组，重试耗尽批次不会自动恢复。需验证旧库迁移/恢复策略，以及真实 Provider、重启和跨日行为。 |
| 正式发布签名与生命周期 | 未签收 | next.13 为 NotSigned；新候选安装、升级、用户数据保留、卸载和签名均需独立记录。 |

PPT 源码复核纠正了上一轮“构建失败会正确返回错误”的过宽表述：最外层异常会返回失败，但 Tailwind 内层仍吞掉异常。本次未将这些新发现自动修复，以保留清晰的签收检查对象。

## 独立日报交付物

C:/Users/Administrator/Desktop/生产科技能/daily-report-skill-v1.3.1.zip 已重新核对哈希：AD1B310C076394E276EFBD663E0E44BC2A04C7A52E62A30F69F6D409ED27081F。该 ZIP 不代表桌面安装包已更新。

## 下一次签收所需结果

1. 关闭 PPT 失败处理、Windows 路径和旧记忆批次迁移/恢复问题；明确实时预览验收范围。
2. 确定包含未跟踪功能文件的源码快照和构建版本，生成新的候选包及哈希，不替换已有签收对象。
3. 对新包重跑打包资源校验，并记录五项功能的桌面实际操作、原文件保护及输出结果。
4. 完成真实 Provider 跨日记忆、安装/升级/卸载和签名检查，再由业务负责人签收。

业务签收人：待确认。签收日期：待确认。当前不批准正式发布。
