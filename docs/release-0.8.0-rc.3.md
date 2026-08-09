# 录井小雪 0.8.0-rc.3 构建记录

构建状态：**成功**

## 构建信息

| 项目 | 值 |
| --- | --- |
| 产品版本 | 录井小雪 0.8.0-rc.3 |
| Git commit | `64d9d1ef0693146f30a4c031ebbee3dd93f471ad`（Event 治理与 Electron SQLite sidecar 修复均已进入源码） |
| 构建方式 | 主工作树从当前 `dev` HEAD 重建；使用本机既有 `node_modules` 与 Bun 缓存，不是独立冷依赖环境 |
| 工作树是否干净 | 无已跟踪改动；存在与构建无关的未跟踪 `design-qa.md`，因此严格意义不称为全空工作树 |
| 构建时间 | 2026-08-10 01:03（本机时间） |
| 安装包路径 | `packages/desktop/dist/xiaoxue-output/录井小雪-0.8.0-rc.3-win-x64.exe` |
| 文件大小 | 334,343,313 字节（318.85 MiB） |
| SHA-256 | `D7932C670646047543023A65A5045A0175526D6207561EBDBE2438AF771A894F` |
| 更新通道 | latest（`XIAOXUE_UPDATE_CHANNEL=latest`，prod 通道必填） |
| 签名 | `Get-AuthenticodeSignature` = `NotSigned`；签名仅在受保护 GitHub Actions 发布流程中启用 |

## 构建环境变量

```text
OPENCODE_CHANNEL=prod
XIAOXUE_PRODUCT_VERSION=0.8.0-rc.3
XIAOXUE_UPDATE_CHANNEL=latest
bun run package:win   # packages/desktop
```

prod 通道缺 `XIAOXUE_PRODUCT_VERSION` 或 `XIAOXUE_UPDATE_CHANNEL` 会直接失败，
这是有意设计，防止误发未命名版本。

## 当前 HEAD 重建说明

- 构建输入源码为 `64d9d1ef06`；`git diff --check` 通过且无已跟踪工作树改动；
- 本轮直接复用主树既有 `node_modules`、Bun 缓存与已准备的 Python runtime，不能证明新机器仅凭 Git + lockfile 冷启动可复现；
- `python:verify` 验证 Python 3.14.4 与 9 个运行时依赖；`verify-sidecar-runtime` 验证 Electron Node 产物可加载且不含 `bun:sqlite`；
- electron-builder 覆盖生成同名安装包，并由 `verify-packaged-windows` 在打包后校验资源；
- 构建过程中修复的两个打包问题（均已提交入库）：
  - `43df3366a9`：`trusted-attachment.ts` 拆分为浏览器安全的纯模块 +
    node 侧 `trusted-attachment-registry.ts`，修复 renderer bundle 拉入
    `node:crypto` 导致的 vite 构建失败；
  - `1f4a242a65`：`verify-packaged-windows.ts` 按通道取主程序名
    （prod=录井小雪.exe，dev=录井小雪 Dev.exe）。

## 资源完整性

`verify-packaged-windows`（打包后自动执行）输出：

```text
Verified packaged Windows resources: 433 integrity entries, Word DOC/DOCX pipeline,
managed skills, Python 3.14.4, 9 Python dependencies
```

| 校验项 | 结果 |
| --- | --- |
| prebuild integrity.json | 433 条完整性条目，打包后校验通过 |
| skills 资源 | 托管技能已编入并由 `verify-packaged-windows` 校验 |
| obsidian-plugin | manifest.json 存在，完整性校验通过 |
| Python 运行时 | Python 3.14.4，9 个依赖包，`xiaoxue_runtime_check.py` 通过 |
| Office 管道 | ASAR 审计确认 DOC/DOCX MIME、word-extractor、Office 提取逻辑均在包内 |
| 2D 桌宠 | renderer 含 puppet-*.js 组件块，`src/xiaoxue-pet` 全量编入主进程 bundle |
| PDF/wasm | renderer assets 含 wasm-*.js 块（renderer 资产共 1511 个） |
| Electron sidecar | 冒烟测试通过（prepackage 阶段） |
| Electron Fuses | runAsNode=false、onlyLoadAppFromAsar=true 等已写入 |

## GUI 验收对应关系

`docs/windows-rc3-gui-acceptance.md` 的人工截图对应较早的 RC3 安装包
（SHA-256 `B2BBDB7F…B14681`，二进制源码 commit `1f4a242a65`）。本轮从
`64d9d1ef06` 重建的 `D7932C67…1A894F` 尚未重新执行完整安装版 GUI 人工验收：

> **当前最终安装包 GUI 验收未确认，需要人工验证。**

## RC3 包含的关键变更（相对 RC2）

- 可信附件登记机制（原生选择器 → 主进程登记 → 一次性高熵 attachmentId）；
- 跨盘符/U盘/UNC 附件支持（服务端消费登记表，不再以 process.cwd() 为安全根）；
- 13 个安全自动化测试（未登记路径、设备文件、目录、过期、盗用 token、符号链接等）；
- 附件历史兼容与重新授权；
- 事件数据库维护工具与副本演练报告（7271.9MB → 121.1MB，指纹无损验证）；
- Windows 测试基线文档。
