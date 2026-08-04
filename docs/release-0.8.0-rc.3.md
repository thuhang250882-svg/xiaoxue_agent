# 录井小雪 0.8.0-rc.3 构建记录

构建状态：**成功**

## 构建信息

| 项目 | 值 |
| --- | --- |
| 产品版本 | 录井小雪 0.8.0-rc.3 |
| Git commit | `1f4a242a65`（fix(desktop): verify packaged executable name per channel，detached worktree） |
| 构建方式 | 独立 git worktree（`.rc3-worktree`，干净树） |
| 工作树是否干净 | 是（源码改动全部已提交；构建产物 `integrity.json` 由 prebuild 按跟踪流程重新生成） |
| 构建时间 | 2026-08-04 22:17（本机时间） |
| 安装包路径 | `packages/desktop/dist/xiaoxue-output/录井小雪-0.8.0-rc.3-win-x64.exe`（worktree 内生成） |
| 文件大小 | 330,658,590 字节（315.34 MB） |
| SHA-256 | `B2BBDB7FCB4FFD70E45293CA3BB04316B85C531006A855A345FE24DFEDB14681` |
| 更新通道 | latest（`XIAOXUE_UPDATE_CHANNEL=latest`，prod 通道必填） |
| 签名 | 未执行（签名仅在 `GITHUB_ACTIONS=true` 时启用，本机构建不签名） |

## 构建环境变量

```text
OPENCODE_CHANNEL=prod
XIAOXUE_PRODUCT_VERSION=0.8.0-rc.3
XIAOXUE_UPDATE_CHANNEL=latest
bun run package:win   # packages/desktop
```

prod 通道缺 `XIAOXUE_PRODUCT_VERSION` 或 `XIAOXUE_UPDATE_CHANNEL` 会直接失败，
这是有意设计，防止误发未命名版本。

## 干净树构建说明

- 从 HEAD 新建 detached worktree，源码全部来自 Git 跟踪内容；
- 依赖安装受限说明：本机网络策略阻断 GitHub codeload（`ghostty-web` GitHub 依赖
  无法在线拉取，npmjs 可达），因此依赖目录由主树（同一 `bun.lock`、同一机器安装的
  确定性结果）镜像而来，等价于离线安装；robocopy 展开的 bun junction 已用
  `.db-rehearsal/fix-junctions.ps1` 重建（8975 个，fixed=8975 failed=0）；
- Python 运行时由 `python:prepare` 按跟踪的 `requirements-windows.lock` + 本机 pip
  缓存离线重新生成，非复用旧产物；
- 不使用主树旧 `dist/` 目录；构建产物全部在 worktree 内生成；
- 构建过程中修复的两个打包问题（均已提交入库）：
  - `43df3366a9`：`trusted-attachment.ts` 拆分为浏览器安全的纯模块 +
    node 侧 `trusted-attachment-registry.ts`，修复 renderer bundle 拉入
    `node:crypto` 导致的 vite 构建失败；
  - `1f4a242a65`：`verify-packaged-windows.ts` 按通道取主程序名
    （prod=录井小雪.exe，dev=录井小雪 Dev.exe）。

## 资源完整性

`verify-packaged-windows`（打包后自动执行）输出：

```text
Verified packaged Windows resources: 36 integrity entries, Word DOC/DOCX pipeline,
managed skills, Python 3.14.4, 9 Python dependencies
```

| 校验项 | 结果 |
| --- | --- |
| prebuild integrity.json | 36 条完整性条目（skills + obsidian-plugin） |
| skills 资源 | 33 个文件，`ResourceIntegrityCore.verify` 通过 |
| obsidian-plugin | manifest.json 存在，完整性校验通过 |
| Python 运行时 | Python 3.14.4，9 个依赖包，`xiaoxue_runtime_check.py` 通过 |
| Office 管道 | ASAR 审计确认 DOC/DOCX MIME、word-extractor、Office 提取逻辑均在包内 |
| 2D 桌宠 | renderer 含 puppet-*.js 组件块，`src/xiaoxue-pet` 全量编入主进程 bundle |
| PDF/wasm | renderer assets 含 wasm-*.js 块（renderer 资产共 1511 个） |
| Electron sidecar | 冒烟测试通过（prepackage 阶段） |
| Electron Fuses | runAsNode=false、onlyLoadAppFromAsar=true 等已写入 |

## RC3 包含的关键变更（相对 RC2）

- 可信附件登记机制（原生选择器 → 主进程登记 → 一次性高熵 attachmentId）；
- 跨盘符/U盘/UNC 附件支持（服务端消费登记表，不再以 process.cwd() 为安全根）；
- 13 个安全自动化测试（未登记路径、设备文件、目录、过期、盗用 token、符号链接等）；
- 附件历史兼容与重新授权；
- 事件数据库维护工具与副本演练报告（7271.9MB → 121.1MB，指纹无损验证）；
- Windows 测试基线文档。
