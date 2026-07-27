# 小雪企业 Windows 发布

## 发布边界

正式 Windows 包只通过 `.github/workflows/xiaoxue-windows-enterprise.yml` 生成。该工作流：

- 仅允许 `thuhang250882-svg/xiaoxue_agent` 仓库运行；
- 只接受人工触发，并经过 `xiaoxue-production` Environment 审批；
- 使用 Azure OIDC 登录 Artifact Signing，不保存长期 Azure 客户端密钥；
- 强制签名 `.exe`、`.dll`、`.node` 和 `.pyd`，任一文件签名无效即停止发布；
- 生成 `signature-report.json` 和 `SHA256SUMS.txt`；
- 默认只生成 30 天保留的 GitHub Actions 制品，不会自动公开；
- 可选发布到 GitHub Release 或企业内部更新源。

## 1. 配置 Azure Artifact Signing

1. 在 Azure 创建 Artifact Signing 账户和证书配置文件。
2. 为 GitHub Actions 使用的 Entra 应用或用户分配签名账户的签名角色。
3. 为 Entra 应用增加 Federated Credential，Subject 设置为：

   ```text
   repo:thuhang250882-svg/xiaoxue_agent:environment:xiaoxue-production
   ```

4. Audience 使用 `api://AzureADTokenExchange`。

不要生成并保存 Azure 客户端密码。工作流使用 GitHub OIDC 临时令牌登录。

参考：

- https://learn.microsoft.com/azure/developer/github/connect-from-azure-openid-connect
- https://learn.microsoft.com/azure/artifact-signing/how-to-signing-integrations

## 2. 配置 GitHub Environment

在仓库 `Settings > Environments` 创建 `xiaoxue-production`：

- 设置 Required reviewers；
- 只允许受保护的发布分支运行；
- 将以下值保存为 Environment secrets：

  - `AZURE_CLIENT_ID`
  - `AZURE_TENANT_ID`
  - `AZURE_SUBSCRIPTION_ID`
  - `AZURE_TRUSTED_SIGNING_ENDPOINT`
  - `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`
  - `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE`

- 将以下非密钥值保存为 Environment variables：

  - `XIAOXUE_EXPECTED_SIGNER`：签名证书 Subject 中必须出现的组织名；
  - `XIAOXUE_INTERNAL_RELEASE_PATH`：可选，内部更新源在自托管 Runner 上可访问的绝对路径。

Environment secrets 只有审批后才会下发给任务。

## 3. 配置内部制品源

内部发布使用带有 `self-hosted`、`windows`、`x64`、`xiaoxue-release` 标签的自托管 Runner。建议：

- Runner 使用专用低权限服务账户；
- 账户只拥有内部发布目录的写入权限；
- 内部发布目录通过 HTTPS 只读提供给客户端；
- 不在工作流中保存共享目录用户名和密码；
- 对发布目录启用版本保留、审计和恶意软件扫描。

工作流先复制带版本号的安装包和 `.blockmap`，最后复制更新通道 `.yml`，避免客户端读到尚未完整上传的版本。

客户端策略示例：

```json
{
  "offline": false,
  "updateChannel": "internal",
  "updateURL": "https://updates.example.internal/xiaoxue/internal"
}
```

策略默认位置是 `C:\ProgramData\opencode\enterprise-policy.json`。正式环境应使用 HTTPS，并由企业 CA 或受信任公共 CA 签发证书。

## 4. 首次发布

1. 打开仓库 `Actions > Xiaoxue Windows Enterprise > Run workflow`。
2. 输入不带 `v` 的版本号，如 `1.19.0`。
3. 首次选择 `internal`，关闭两个发布开关，只生成待审查制品。
4. 下载制品并核对：

   ```powershell
   Get-AuthenticodeSignature .\xiaoxue-desktop-1.19.0-windows-x64.exe
   Get-FileHash .\xiaoxue-desktop-1.19.0-windows-x64.exe -Algorithm SHA256
   ```

5. 在隔离测试机运行 Defender、App Control、ASR 和企业 EDR 的审计策略，完成安装、启动、更新、卸载和核心业务回归。
6. 安全部门认可签名主体、联网清单和扫描结果后，再开启 `publish_internal`。

`latest` 应只用于已批准的稳定发布；`beta` 和 `internal` 会作为预发布渠道处理。

## 5. 当前 EDR 待办

构建目前仍报告三处 `eval`：

- 一处来自 `gray-matter` 提供但本项目未使用的 JavaScript frontmatter 引擎；
- 两处来自 `web-tree-sitter` 的 Emscripten/WASM 运行时代码。

当前发布门禁通过签名、哈希、ASAR 完整性和受保护发布审批降低供应链风险，但不会把这些警告伪装成已解决。后续应拆成独立改动：

1. 用不执行 JavaScript 的 YAML frontmatter 解析替换 `gray-matter`，同步更新 `bun.lock` 并回归 Markdown 配置和 Agent 文件；
2. 保留 Shell 权限分析能力的前提下，将 `web-tree-sitter` 完整隔离到真正按需加载的进程或独立文件；
3. 将构建警告基线加入 CI，出现新的 `eval` 来源时阻止正式发布。

