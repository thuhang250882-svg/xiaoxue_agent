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

生产包由桌面包现有构建流程输出。部署前应在目标内网环境重新配置 Provider，不要把开发机密钥写入仓库或安装包。

## 本地数据
会话、业务任务元数据和知识库索引写入 OpenCode 既有本地数据目录。数据库不保存 DOCX、XLSX、PDF 二进制，只保存受控文件路径、Hash、元数据和结构化 JSON。

## 升级
升级前备份本地数据目录。0.8 版本复用 Session SQLite 元数据存储业务任务，没有新增第二套数据库或独立迁移框架。
