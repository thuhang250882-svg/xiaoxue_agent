# 随包运行时检查与降级

录井小雪办公网版使用安装包内置 Python 与 `python-docx`，不依赖用户自行安装的软件包，不从公网下载依赖，也不借用用户目录中的 Python 环境。

## 正常运行

桌面主进程启动 sidecar 时会设置 `XIAOXUE_PYTHON`，其值应指向安装包资源目录中的 `python.exe`。生成周报时使用该解释器运行 `scripts/report_builder.py` 或 `scripts/merge_builder.py`。

在仓库开发环境中，先显式把 `XIAOXUE_PYTHON` 设为 `packages/desktop/resources/python/python.exe` 的绝对路径，再使用该解释器执行同样脚本。检查器不接受系统 Python 或未声明来源的解释器。

## 只读检查

使用实际执行生成器的解释器运行：

```text
<xiaoxue-python> scripts/check_environment.py --capability "docx 稿件生成"
```

检查器只读取解释器版本、`XIAOXUE_PYTHON` 状态以及 `docx` 模块版本，不安装软件、不修改配置、不联网。

## 异常处理

- `ready`：继续生成并回读验证 DOCX。
- `unavailable`：重启录井小雪，确认应用使用完整安装目录且随包资源未被安全软件隔离。
- 开发环境缺少随包运行时时，重新执行项目既有的 Python 运行时准备流程；不要在已发布技能中调用包管理器。
- 暂时无法恢复时，只输出带完整正文与版式参数的 Markdown 稿，并明确写明“未生成 DOCX”。

方正字库缺失不属于运行时故障。生成器仍按规范写入字体名，本机预览可能显示替代字形，但不得自行改换字体。
