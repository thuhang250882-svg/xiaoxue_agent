#!/usr/bin/env python3
"""Read-only readiness check for Xiaoxue's bundled daily-report runtime."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import os
from pathlib import Path
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="检查录井小雪随包日报生成运行时")
    parser.add_argument("--capability", action="append", default=[])
    args = parser.parse_args()

    configured = os.environ.get("XIAOXUE_PYTHON")
    configured_path = Path(configured).resolve() if configured else None
    executable = Path(sys.executable).resolve()
    problems: list[dict[str, str]] = []
    versions: dict[str, str] = {}

    if sys.version_info < (3, 9):
        problems.append({"id": "python-version", "detail": f"Python {sys.version.split()[0]} 低于 3.9"})
    if configured_path is None:
        problems.append({"id": "xiaoxue-python", "detail": "未设置 XIAOXUE_PYTHON，无法确认正在使用随包解释器"})
    elif not configured_path.is_file():
        problems.append({"id": "xiaoxue-python", "detail": "XIAOXUE_PYTHON 指向的文件不存在"})
    elif os.path.normcase(str(configured_path)) != os.path.normcase(str(executable)):
        problems.append({"id": "xiaoxue-python", "detail": "当前解释器与 XIAOXUE_PYTHON 不一致"})

    try:
        import docx
        from docx import Document

        versions["python_docx"] = importlib.metadata.version("python-docx")
        Document()
        if int(versions["python_docx"].split(".")[0]) != 1:
            problems.append({"id": "python-docx-version", "detail": f"python-docx {versions['python_docx']} 不在已验证的 1.x 范围"})
        if getattr(docx, "__version__", versions["python_docx"]) != versions["python_docx"]:
            problems.append({"id": "python-docx-version", "detail": "docx 模块版本与包元数据不一致"})
    except Exception as error:
        versions["python_docx"] = "unusable"
        problems.append({"id": "python-docx-runtime", "detail": f"python-docx 不可用：{error}"})

    for name in ("xlrd", "xlwt", "xlutils"):
        try:
            module = __import__(name)
            versions[name] = importlib.metadata.version(name)
            if name == "xlwt":
                module.Workbook(encoding="utf-8").add_sheet("自检")
        except Exception as error:
            versions[name] = "unusable"
            problems.append({"id": f"{name}-runtime", "detail": f"{name} 不可用：{error}"})

    print(json.dumps({
        "status": "ready" if not problems else "unavailable",
        "requested_capabilities": args.capability,
        "runtime": {
            "executable": str(executable),
            "configured_executable": str(configured_path) if configured_path else None,
            "python": sys.version.split()[0],
            **versions,
        },
        "problems": problems,
        "next_action": (
            "运行目标生成器 --selfcheck"
            if not problems
            else "重启录井小雪并核对随包 Python 资源；不要联网安装或借用用户环境"
        ),
    }, ensure_ascii=False, indent=2))
    return 0 if not problems else 1


if __name__ == "__main__":
    raise SystemExit(main())
