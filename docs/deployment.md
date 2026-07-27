# 录井小雪桌面版部署

## 环境
- Windows 10/11 x64
- Bun 1.3.14
- 可访问已配置的大模型 Provider，或使用企业内网 OpenAI-compatible 服务。

## 构建
```powershell
cd packages/desktop
bun install
bun typecheck
bun run build
```

生产包由桌面包现有构建流程输出。Windows 正式发布通过 Azure Artifact Signing 签名；CI 需要配置
`AZURE_TRUSTED_SIGNING_ENDPOINT`、`AZURE_TRUSTED_SIGNING_ACCOUNT_NAME` 和
`AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE`。正式发布设置 `XIAOXUE_REQUIRE_SIGNING=true`，缺少任一项时构建失败。

如果企业使用内部 PKI，可由信息安全部门把内部根证书部署到受管终端，并将签名流程替换为企业签名服务。不要把 PFX、私钥或访问令牌写入仓库、工作流文件和安装包。

部署前应在目标内网环境重新配置 Provider，不要把开发机密钥写入仓库或安装包。建议由管理员下发托管策略，仅放行批准的 Provider、模型、MCP、技能、插件、连接器、项目根目录、知识库和更新源。

## 终端准入
1. 在隔离测试机验证安装包签名、发布者名称和 SHA-256。
2. 以审计模式运行 App Control、ASR、Defender/EDR，执行完整业务回归。
3. 由安全管理员按发布者证书放行，不使用宽泛的目录或进程排除。
4. 保存联网域名、端口、数据类型和用途清单；离线部署应确认无外连。
5. 小范围试点后再分批推广，更新使用稳定或企业内部通道并保留回滚包。

## 本地数据
会话、业务任务元数据和知识库索引写入 OpenCode 既有本地数据目录。数据库不保存 DOCX、XLSX、PDF 二进制，只保存受控文件路径、Hash、元数据和结构化 JSON。

## 升级
升级前备份本地数据目录。0.8 版本复用 Session SQLite 元数据存储业务任务，没有新增第二套数据库或独立迁移框架。
