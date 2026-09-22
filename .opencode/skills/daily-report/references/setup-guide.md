# 随包运行时检查与降级

录井小雪办公网版使用安装包内置 Python、`python-docx`、`xlrd`、`xlwt` 和 `xlutils`。本技能不依赖用户 Python，不从公网下载依赖，也不在运行时调用包管理器。

## 正常运行

桌面主进程启动 sidecar 时设置 `XIAOXUE_PYTHON`，其值必须指向安装包资源目录中的 `python.exe`。路线 A 与路线 B 都使用该解释器。

仓库开发环境先把 `XIAOXUE_PYTHON` 显式设为 `packages/desktop/resources/python/python.exe` 的绝对路径，再运行技能脚本。检查器不接受系统 Python或未声明来源的解释器。

## 只读检查

```text
<xiaoxue-python> scripts/check_environment.py --capability "docx 稿件生成"
<xiaoxue-python> scripts/check_environment.py --capability "xls 日报表汇总"
```

检查器会真实导入 `docx`、`xlrd`、`xlwt`、`xlutils`，并分别创建最小 DOCX 和内存 XLS 工作簿。它只读取状态，不安装软件、不修改配置、不联网。

## 异常处理

- `ready`：继续运行目标生成器的 `--selfcheck`，全部通过后才能生成正式文件。
- `unavailable`：重启录井小雪，确认应用使用完整安装目录且随包资源未被安全软件隔离。
- 开发环境缺少随包运行时时，重新执行项目既有的 Python 运行时准备流程；不得在已发布技能中安装依赖。
- 暂时无法恢复时，只输出内容标记、处理报告或 Markdown 稿，并明确标注“未生成 DOCX/XLS”。

方正字库缺失不属于运行时故障。生成器仍按规范写入字体名，本机预览可能显示替代字形，但不得自行改换字体。
