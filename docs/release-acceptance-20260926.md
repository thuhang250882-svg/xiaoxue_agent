# 录井小雪 next.14 内部候选验收记录（2026-09-26）

## 当前结论

**候选包已构建，但暂不批准向同事分发。** 本轮取消安装包签名要求；`NotSigned` 仅记录事实，不作为阻断项。发布前仍须完成安装版 GUI 与业务验收，办公网本地 Qwen3.8-27B 验收只能在目标环境进行。真实录井报告未发送给公网演示模型。

## 源码边界

- `dev` 功能提交：`56a9c29962`，仅纳入本轮审核经验回流、新手引导、附件文件名与企业模型策略相关的 27 个功能和测试文件。
- 资源清单提交：`f8bc005a6e`，更新 `geolog-logging-review/SKILL.md` 的完整性哈希。
- 未把 `.opencode/.migration-state.json`、历史交接/规划资料或用户 DOCX 纳入上述提交。远端推送不属于本次验收动作。
- 第一份 `next.14` 在提交前构建，打包技能来自旧 `HEAD`，缺少新增审核经验说明；已另存为 `录井小雪-0.9.0-next.14-pre-snapshot-invalid.exe`，SHA-256 为 `516FA898DBB1ACF77A204A4C40539D19C80EC221BEBCCD517BF1F8FE307244BC`，仅作失败取证，不能分发。
- 第二份 `next.14` 从 `56a9c29962` 物化 34 个 RC 技能，包内 `geolog-logging-review/SKILL.md` SHA-256 与源码均为 `DEBD9DA302D81D04622CA9912032FB6EE30C85D611488BF62506A9BE63C087E9`。

## 自动化结果

| 检查 | 结果 |
| --- | --- |
| 审核经验、企业策略、Agent、MDB、DOCX 定向测试 | 77 pass，0 fail |
| App 附件请求与审核结果解析测试 | 22 pass，0 fail |
| Desktop 日报、周报、PPT、离线技能测试 | 11 pass，0 fail |
| Desktop 企业策略与资源完整性测试 | 12 pass，0 fail |
| `core`、`app`、`opencode`、`desktop` 类型检查 | 本轮四包均通过 |
| `python:verify`、`offline-skills:verify`、`office-network:verify` | 通过；办公网工具检查 `networkUsed=false` |
| Electron build 与 sidecar smoke | 通过 |
| 打包资源验证 | 10,960 条完整性条目、Office/PDF/OCR、34 个技能、Python 3.14.4/16 个依赖，通过 |
| 原始 34,809,468 字节 DOCX 本机连续解析两次 | 两次均得到 43,906 字符、25 张表格、50 个未读取图片引用；未输出正文、未调用模型 |

这些是定向自动化和包内检查，不等于全仓测试或人工专业审核。

## 候选安装器

- 文件：`packages/desktop/dist/xiaoxue-output/录井小雪-0.9.0-next.14-win-x64.exe`
- 大小：622,950,148 字节
- SHA-256：`331C129347C8AE3FFC1A0AF2A746B97BEB269CD3970AA438B62C9AD3A6B976B5`
- `xiaoxue-desktop-setup-0.9.0-next.14.exe` 为同字节的更新别名；`internal.yml` 版本、文件名和大小一致。
- Authenticode：`NotSigned`（本次不要求签名）。

## GUI 与尚未关闭的签收

- 新包展开版已启动，主工作台与数字人窗口显示正常；模型菜单显示本笔记本的 `Qwen3.8-27B-lora` 公网演示模型；“添加图片和文件”菜单可打开。尚未将此结果等同于安装版验收。
- RC 默认策略禁止公网模型端点；本机原有演示模型仍显示在选择菜单，不能把“可见”误认为“可调用”。不得为跑通验收而放宽办公网策略。
- 用户授权后，本机直接运行上述安装器；NSIS 完成安装并自动启动。注册表显示 `录井小雪 0.9.0-next.14`，程序位于 `C:/Users/Administrator/AppData/Local/Programs/xiaoxue-desktop/录井小雪.exe`，桌面及开始菜单快捷方式存在。安装版主工作台正常加载，原有会话标签仍显示。
- 安装前已备份 `C:/Users/Administrator/AppData/Roaming/ai.opencode.desktop`（668 文件、196,673,471 字节）至 `C:/Users/Administrator/AppData/Local/XiaoxueNext14AcceptanceBackup20260926`。安装版启动后，原有非日志文件均仍在；启动时有 12 个旧日志文件被清理，备份中保留。
- 卸载前已备份业务数据 `C:/Users/Administrator/.local/share/opencode`（2,365 文件、2,655,469,923 字节）至 `C:/Users/Administrator/AppData/Local/XiaoxueNext14AcceptanceDataBackup20260926`。主库 `opencode.db` 的原件和备份 SHA-256 均为 `FCFB00400E181C3296970D849EFDAB4E2B02A477D3CC2342F7B440511C330FB7`；桌面草稿库原件和备份 SHA-256 均为 `7E483ECE1A9257BD8282B880543F115A5AB5685CB93E51FF7A30F13F5496A397`。两处备份均仅在本机。
- 安装和启动已通过；**卸载及卸载后数据保留比对尚未执行**，等待操作前确认。升级场景未执行。
- 新包尚未完成纯虚构双 DOCX 的 GUI“预览→保存→撤销”复测；之前的开发版结果只作回归参考。
- MDB 真实导入、长 DOCX **GUI 同名重复上传**、修改批注与预览、日报/周报、多页 PPT、长期记忆跨日和旧库迁移仍需按实际业务资料逐项签收。连续本机解析通过不等于 GUI 上传通过。
- 办公网本地 Qwen3.8-27B 与同事设备不在当前联网笔记本环境中；任何公网演示结果都不能替代其验收。真实报告只允许在确认内网模型端点后使用。

本记录在后续 GUI/安装验收推进时更新；在待签收项关闭前，候选包仅供受控测试，不作为正式分发件。
