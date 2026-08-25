#!/usr/bin/env python3
"""Validate the structured output used by the bundled tender review skill."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any


MODES = {"full", "tender-only", "bid-only"}
OVERALL = {"建议提交", "整改后复核", "不建议提交", "资料不足"}
REQUIREMENT_TYPES = {"否决项", "评分项", "一般响应项", "信息项", "待确认"}
STATUSES = {"符合", "部分符合", "不符合", "未找到", "待人工确认", "不适用"}
RISKS = {"致命", "高", "中", "低", "提示"}


def nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def validate(payload: Any) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if not isinstance(payload, dict):
        return ["顶层必须是 JSON 对象"], warnings

    metadata = payload.get("metadata")
    summary = payload.get("summary")
    items = payload.get("items")
    decisions = payload.get("decision_items")
    if not isinstance(metadata, dict):
        errors.append("metadata 必须是对象")
        metadata = {}
    if not isinstance(summary, dict):
        errors.append("summary 必须是对象")
        summary = {}
    if not isinstance(items, list):
        errors.append("items 必须是数组")
        items = []
    if not isinstance(decisions, list):
        errors.append("decision_items 必须是数组")
        decisions = []

    if metadata.get("mode") not in MODES:
        errors.append("metadata.mode 无效")
    if not nonempty(metadata.get("project_name")):
        errors.append("metadata.project_name 必须是非空字符串")
    try:
        date.fromisoformat(metadata.get("review_date"))
    except (TypeError, ValueError):
        errors.append("metadata.review_date 必须是 YYYY-MM-DD 日期")
    files = metadata.get("files")
    if not isinstance(files, list) or not files:
        errors.append("metadata.files 必须是非空数组")

    if summary.get("overall") not in OVERALL:
        errors.append("summary.overall 无效")
    if not isinstance(summary.get("top_actions"), list):
        errors.append("summary.top_actions 必须是数组")

    status_counts: Counter[str] = Counter()
    risk_counts: Counter[str] = Counter()
    ids: set[str] = set()
    for index, item in enumerate(items):
        base = f"items[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{base} 必须是对象")
            continue
        for field in ("id", "category", "requirement", "finding", "remediation", "owner", "deadline"):
            if not nonempty(item.get(field)):
                errors.append(f"{base}.{field} 必须是非空字符串")
        if item.get("id") in ids:
            errors.append(f"{base}.id 重复")
        ids.add(item.get("id"))
        if item.get("requirement_type") not in REQUIREMENT_TYPES:
            errors.append(f"{base}.requirement_type 无效")
        if item.get("status") not in STATUSES:
            errors.append(f"{base}.status 无效")
        else:
            status_counts[item["status"]] += 1
        if item.get("risk_level") not in RISKS:
            errors.append(f"{base}.risk_level 无效")
        else:
            risk_counts[item["risk_level"]] += 1
        for field in ("tender_evidence", "bid_evidence"):
            evidence = item.get(field)
            if not isinstance(evidence, list):
                errors.append(f"{base}.{field} 必须是数组")
                continue
            for evidence_index, entry in enumerate(evidence):
                if not isinstance(entry, dict) or any(not nonempty(entry.get(key)) for key in ("file", "location", "quote")):
                    errors.append(f"{base}.{field}[{evidence_index}] 缺少 file/location/quote")
        if not isinstance(item.get("manual_check"), bool):
            errors.append(f"{base}.manual_check 必须是布尔值")
        if item.get("requirement_type") == "否决项" and item.get("status") in {"部分符合", "不符合", "未找到"} and item.get("risk_level") != "致命":
            errors.append(f"{base} 未满足的明确否决项必须标为致命")
        if metadata.get("mode") == "full" and item.get("status") == "符合" and (not item.get("tender_evidence") or not item.get("bid_evidence")):
            errors.append(f"{base} 完整审核的符合项必须有双向证据")

    for field, allowed, actual in (("status_counts", STATUSES, status_counts), ("risk_counts", RISKS, risk_counts)):
        value = summary.get(field)
        if not isinstance(value, dict):
            errors.append(f"summary.{field} 必须是对象")
            continue
        for key in allowed:
            if value.get(key) != actual.get(key, 0):
                errors.append(f"summary.{field}.{key} 应为 {actual.get(key, 0)}")

    decision_ids: set[str] = set()
    for index, item in enumerate(decisions):
        base = f"decision_items[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{base} 必须是对象")
            continue
        for field in ("id", "decision", "evidence_and_impact", "deadline", "owner"):
            if not nonempty(item.get(field)):
                errors.append(f"{base}.{field} 必须是非空字符串")
        if item.get("id") in decision_ids:
            errors.append(f"{base}.id 重复")
        decision_ids.add(item.get("id"))
        options = item.get("options")
        if not isinstance(options, list) or not options or any(not nonempty(option) for option in options):
            errors.append(f"{base}.options 必须是非空字符串数组")

    for field in ("manual_checks", "limitations"):
        value = payload.get(field)
        if not isinstance(value, list) or any(not nonempty(entry) for entry in value):
            errors.append(f"{field} 必须是字符串数组")
    if not items:
        warnings.append("items 为空，请确认是否仅输出摘要")
    return errors, warnings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("json_file", type=Path)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()
    payload = json.loads(args.json_file.read_text(encoding="utf-8-sig"))
    errors, warnings = validate(payload)
    for warning in warnings:
        print(f"WARNING: {warning}")
    for error in errors:
        print(f"ERROR: {error}")
    print(f"Validation complete: {len(errors)} error(s), {len(warnings)} warning(s)")
    return int(bool(errors or (args.strict and warnings)))


if __name__ == "__main__":
    raise SystemExit(main())
