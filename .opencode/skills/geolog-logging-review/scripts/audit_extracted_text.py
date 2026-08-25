#!/usr/bin/env python3
"""Find deterministic review candidates in extracted geolog report text."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


PLACEHOLDERS = (
    re.compile(r"X{2,}", re.IGNORECASE),
    re.compile(r"待落实|待确认|待补充|此表按.*不需要|注意与.*一致"),
)
DEPTH_RANGE = re.compile(
    r"(?P<start>\d{3,5}(?:\.\d+)?)(?:\s*m\s*[～~—-]\s*|\s*[～~—]\s*|-(?=\d))(?P<end>\d{3,5}(?:\.\d+)?)\s*m?",
    re.IGNORECASE,
)
ARROW = re.compile(r"(?P<start>\d+(?:\.\d+)?)\s*(?P<arrow>[↑↓])\s*(?P<end>\d+(?:\.\d+)?)")
HEADING = re.compile(r"^(?P<number>[1-9](?:\.(?:[1-9]|[1-9]\d)){1,3})\s*(?=[\u4e00-\u9fff])")
HEADING_INLINE = re.compile(r"(?<!\d)(?P<number>[1-9](?:\.(?:[1-9]|[1-9]\d)){1,3})\s*(?=[\u4e00-\u9fff])")


def add(findings: list[dict[str, object]], *, path: Path, line: int, code: str, level: str, message: str, text: str) -> None:
    findings.append({
        "file": str(path),
        "line": line,
        "code": code,
        "level": level,
        "message": message,
        "text": text.strip()[:240],
    })


def audit(path: Path) -> list[dict[str, object]]:
    findings: list[dict[str, object]] = []
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    headings: list[tuple[tuple[int, ...], int, str]] = []

    for number, raw in enumerate(lines, 1):
        line = raw.strip()
        if not line:
            continue

        if any(pattern.search(line) for pattern in PLACEHOLDERS):
            add(findings, path=path, line=number, code="template-residue", level="serious", message="疑似最终稿模板占位或内部编辑说明", text=line)

        if "g/cm?" in line or "g／cm?" in line:
            add(findings, path=path, line=number, code="broken-unit", level="normal", message="单位疑似编码损坏，应回到源文件确认", text=line)

        if "，，" in line or "。。" in line:
            add(findings, path=path, line=number, code="duplicate-punctuation", level="hint", message="存在重复标点", text=line)

        if re.search(r"(?:粒径|砾径|缝宽)\s*\d+(?:\.\d+)?\s*m(?:\W|$)", line, re.IGNORECASE):
            add(findings, path=path, line=number, code="implausible-unit", level="review", message="粒径类物理量使用米单位或数量级可疑，需人工确认", text=line)

        for match in DEPTH_RANGE.finditer(line):
            start = float(match.group("start"))
            end = float(match.group("end"))
            if end < start:
                add(findings, path=path, line=number, code="reversed-depth", level="serious", message=f"深度区间底深小于顶深：{start:g} -> {end:g}", text=line)

        for match in ARROW.finditer(line):
            start = float(match.group("start"))
            end = float(match.group("end"))
            arrow = match.group("arrow")
            if arrow == "↑" and end < start or arrow == "↓" and end > start:
                add(findings, path=path, line=number, code="arrow-direction", level="review", message=f"箭头方向与数值变化不一致：{start:g}{arrow}{end:g}", text=line)

        if len(line) <= 100:
            match = HEADING.search(line)
            if match:
                parts = tuple(int(part) for part in match.group("number").split("."))
                headings.append((parts, number, line))
        elif re.search(r"目\s*录", line):
            for match in HEADING_INLINE.finditer(line):
                parts = tuple(int(part) for part in match.group("number").split("."))
                headings.append((parts, number, match.group(0)))

    for index, (parts, line, text) in enumerate(headings):
        parent = parts[:-1]
        if len(parts) >= 3:
            prior_parent = next((candidate for candidate in reversed(headings[:index]) if len(candidate[0]) == len(parent)), None)
            if prior_parent and prior_parent[0] != parent:
                expected_prefix = ".".join(str(part) for part in prior_parent[0])
                actual_prefix = ".".join(str(part) for part in parent)
                add(findings, path=path, line=line, code="heading-parent", level="normal", message=f"子节前缀 {actual_prefix} 与最近父节 {expected_prefix} 不一致", text=text)

        prior_peer = next((candidate for candidate in reversed(headings[:index]) if len(candidate[0]) == len(parts) and candidate[0][:-1] == parent), None)
        if prior_peer and parts[-1] > prior_peer[0][-1] + 1:
            add(findings, path=path, line=line, code="heading-gap", level="normal", message=f"同级编号从 {'.'.join(map(str, prior_peer[0]))} 跳到 {'.'.join(map(str, parts))}", text=text)

    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="+", type=Path, help="UTF-8 extracted text files")
    parser.add_argument("--json", action="store_true", help="emit JSON")
    args = parser.parse_args()
    findings = [finding for path in args.files for finding in audit(path)]

    if args.json:
        print(json.dumps(findings, ensure_ascii=False, indent=2))
        return 1 if findings else 0

    for finding in findings:
        print(f"{finding['file']}:{finding['line']} [{finding['level']}/{finding['code']}] {finding['message']}")
        print(f"  {finding['text']}")
    print(f"发现 {len(findings)} 个候选异常；必须回到源文件和上下文复核。")
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
