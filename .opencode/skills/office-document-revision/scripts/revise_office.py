#!/usr/bin/env python3
"""Create annotated and clean revised copies of DOCX, XLSX, PPTX, or PDF files."""

from __future__ import annotations

import argparse
import copy
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


AUTHOR = "AI审核"
A_NS = "http:" + "//schemas.openxmlformats.org/drawingml/2006/main"


def decision_text(decision: dict) -> str:
    detail = str(decision.get("comment", "")).strip()
    replacement = str(decision.get("replacement", "")).strip()
    prefix = f"[{decision.get('id', 'REVIEW')}]"
    return f"{prefix} {detail}\n建议改为：{replacement}" if detail else f"{prefix} 建议改为：{replacement}"


def validate_paths(source: Path, annotated: Path, final: Path):
    if source.resolve() in {annotated.resolve(), final.resolve()}:
        raise ValueError("outputs must not overwrite the source document")
    if annotated.resolve() == final.resolve():
        raise ValueError("annotated and final outputs must be different files")
    if source.suffix.lower() not in {".docx", ".xlsx", ".pptx", ".pdf"}:
        raise ValueError("supported formats are DOCX, XLSX, PPTX, and PDF")
    if annotated.suffix.lower() != source.suffix.lower() or final.suffix.lower() != source.suffix.lower():
        raise ValueError("outputs must keep the source file type")


def revise_docx(source: Path, annotated: Path, final: Path, decisions: list[dict]):
    helper_dir = Path(__file__).resolve().parents[2] / "document-review-tracked" / "scripts"
    if str(helper_dir) not in sys.path:
        sys.path.insert(0, str(helper_dir))
    from annotate_docx import annotate, comment_runs, lift_out_of_custom_xml, locate
    from docx import Document

    comments = [
        {
            "match_text": item["match_text"],
            "occurrence": item.get("occurrence", 1),
            "comment": decision_text(item),
            "author": AUTHOR,
            "initials": "AI",
        }
        for item in decisions
    ]
    annotation_result = annotate(source, annotated, comments)

    document = Document(source)
    applied = []
    unmatched = []
    for index, item in enumerate(decisions, 1):
        match_text = str(item.get("match_text", "")).strip()
        replacement = str(item.get("replacement", ""))
        found = locate(document, match_text, int(item.get("occurrence", 1))) if match_text else None
        if not found:
            unmatched.append({"index": index, "match_text": match_text, "reason": "text not found"})
            continue
        paragraph, start, end = found
        # Replacements inside w:customXml data islands are invisible in Word;
        # lift the paragraph into the visible body flow before editing runs.
        lift_out_of_custom_xml(paragraph._element)
        runs = comment_runs(paragraph, start, end)
        runs[0].text = replacement
        for run in runs[1:]:
            run.text = ""
        applied.append({"index": index, "match_text": match_text})
    final.parent.mkdir(parents=True, exist_ok=True)
    document.save(final)
    Document(final)
    return normalize_result(annotation_result, applied, unmatched)


def revise_xlsx(source: Path, annotated: Path, final: Path, decisions: list[dict]):
    annotation_results = patch_xlsx(source, annotated, decisions, annotate=True)
    final_results = patch_xlsx(source, final, decisions, annotate=False)
    return result_payload(
        annotation_results[0], annotation_results[1], final_results[0], final_results[1]
    )


def patch_xlsx(source: Path, output: Path, decisions: list[dict], annotate: bool):
    sheet_ns = "http:" + "//schemas.openxmlformats.org/spreadsheetml/2006/main"
    with zipfile.ZipFile(source) as archive:
        entries = {name: archive.read(name) for name in archive.namelist()}
    shared = []
    if "xl/sharedStrings.xml" in entries:
        shared_root = ET.fromstring(entries["xl/sharedStrings.xml"])
        shared = ["".join(node.text or "" for node in item.findall(f".//{{{sheet_ns}}}t")) for item in shared_root]
    sheet_names = sorted(
        (name for name in entries if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", name)),
        key=lambda name: int(re.search(r"(\d+)", name).group(1)),
    )
    roots = {name: ET.fromstring(entries[name]) for name in sheet_names}
    applied = []
    unmatched = []
    for index, item in enumerate(decisions, 1):
        match_text = str(item.get("match_text", "")).strip()
        target = find_xlsx_cell(roots, shared, sheet_ns, match_text, int(item.get("occurrence", 1)))
        if not target:
            unmatched.append({"index": index, "match_text": match_text, "reason": "cell text not found"})
            continue
        sheet_name, cell, value, local_occurrence = target
        replacement = (
            f"{match_text}【{AUTHOR} {item.get('id', index)}：{str(item.get('comment', '')).strip()}；建议改为：{item.get('replacement', '')}】"
            if annotate
            else str(item.get("replacement", ""))
        )
        write_inline_cell(cell, sheet_ns, replace_occurrence(value, match_text, local_occurrence, replacement))
        applied.append({"index": index, "location": f"{sheet_name}!{cell.get('r', '?')}"})
    for name, root in roots.items():
        entries[name] = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in entries.items():
            archive.writestr(name, data)
    with zipfile.ZipFile(output) as archive:
        if any(name not in archive.namelist() for name in sheet_names):
            raise RuntimeError("saved XLSX is missing worksheet XML")
    return applied, unmatched


def find_xlsx_cell(roots, shared, sheet_ns: str, match_text: str, occurrence: int):
    seen = 0
    for sheet_name, root in roots.items():
        for cell in root.findall(f".//{{{sheet_ns}}}c"):
            if cell.find(f"{{{sheet_ns}}}f") is not None:
                continue
            value = read_xlsx_cell(cell, shared, sheet_ns)
            count = value.count(match_text)
            if seen + count >= occurrence:
                return sheet_name, cell, value, occurrence - seen
            seen += count
    return None


def read_xlsx_cell(cell, shared, sheet_ns: str):
    if cell.get("t") == "s":
        value = cell.find(f"{{{sheet_ns}}}v")
        return shared[int(value.text)] if value is not None and value.text else ""
    if cell.get("t") == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(f".//{{{sheet_ns}}}t"))
    value = cell.find(f"{{{sheet_ns}}}v")
    return value.text if value is not None and value.text else ""


def write_inline_cell(cell, sheet_ns: str, value: str):
    for child in list(cell):
        if child.tag in {f"{{{sheet_ns}}}v", f"{{{sheet_ns}}}is"}:
            cell.remove(child)
    cell.set("t", "inlineStr")
    inline = ET.SubElement(cell, f"{{{sheet_ns}}}is")
    text = ET.SubElement(inline, f"{{{sheet_ns}}}t")
    if value[:1].isspace() or value[-1:].isspace():
        text.set("{" + "http:" + "//www.w3.org/XML/1998/namespace}space", "preserve")
    text.text = value


def replace_occurrence(value: str, match_text: str, occurrence: int, replacement: str):
    matches = list(re.finditer(re.escape(match_text), value))
    if occurrence < 1 or occurrence > len(matches):
        return value
    match = matches[occurrence - 1]
    return value[: match.start()] + replacement + value[match.end() :]


def revise_pptx(source: Path, annotated: Path, final: Path, decisions: list[dict]):
    annotation_results = patch_pptx(source, annotated, decisions, annotate=True)
    final_results = patch_pptx(source, final, decisions, annotate=False)
    return result_payload(
        annotation_results[0], annotation_results[1], final_results[0], final_results[1]
    )


def patch_pptx(source: Path, output: Path, decisions: list[dict], annotate: bool):
    with zipfile.ZipFile(source) as archive:
        entries = {name: archive.read(name) for name in archive.namelist()}
    slide_names = sorted(
        (name for name in entries if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)),
        key=lambda name: int(re.search(r"(\d+)", name).group(1)),
    )
    roots = {name: ET.fromstring(entries[name]) for name in slide_names}
    applied = []
    unmatched = []
    for index, item in enumerate(decisions, 1):
        match_text = str(item.get("match_text", "")).strip()
        target = find_ppt_paragraph(roots, match_text, int(item.get("occurrence", 1)))
        if not target:
            unmatched.append({"index": index, "match_text": match_text, "reason": "slide text not found"})
            continue
        slide_name, paragraph, local_occurrence = target
        replacement = f"{match_text}【{AUTHOR} {item.get('id', index)}：{str(item.get('comment', '')).strip()}；建议改为：{item.get('replacement', '')}】" if annotate else str(item.get("replacement", ""))
        replace_ppt_paragraph_text(paragraph, match_text, local_occurrence, replacement)
        applied.append({"index": index, "location": slide_name})
    for name, root in roots.items():
        entries[name] = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in entries.items():
            archive.writestr(name, data)
    with zipfile.ZipFile(output) as archive:
        if not slide_names or any(name not in archive.namelist() for name in slide_names):
            raise RuntimeError("saved PPTX is missing slide XML")
    return applied, unmatched


def find_ppt_paragraph(roots, match_text: str, occurrence: int):
    seen = 0
    for slide_name, root in roots.items():
        for paragraph in root.findall(f".//{{{A_NS}}}p"):
            value = "".join(node.text or "" for node in paragraph.findall(f".//{{{A_NS}}}t"))
            count = value.count(match_text)
            if seen + count >= occurrence:
                return slide_name, paragraph, occurrence - seen
            seen += count
    return None


def replace_ppt_paragraph_text(paragraph, match_text: str, occurrence: int, replacement: str):
    nodes = paragraph.findall(f".//{{{A_NS}}}t")
    if not nodes:
        raise ValueError("matched PowerPoint paragraph has no text runs")
    value = "".join(node.text or "" for node in nodes)
    matches = list(re.finditer(re.escape(match_text), value))
    if occurrence < 1 or occurrence > len(matches):
        raise ValueError("PowerPoint text occurrence is outside the paragraph")
    match = matches[occurrence - 1]
    spans = []
    cursor = 0
    for node in nodes:
        text = node.text or ""
        spans.append((node, cursor, cursor + len(text), text))
        cursor += len(text)
    selected = [span for span in spans if span[1] < match.end() and span[2] > match.start()]
    first, first_start, _, first_text = selected[0]
    last, last_start, _, last_text = selected[-1]
    if first is last:
        first.text = first_text[: match.start() - first_start] + replacement + first_text[match.end() - first_start :]
        return
    first.text = first_text[: match.start() - first_start] + replacement
    for node, _, _, _ in selected[1:-1]:
        node.text = ""
    last.text = last_text[match.end() - last_start :]


def revise_pdf(source: Path, annotated: Path, final: Path, decisions: list[dict]):
    import fitz

    annotated_doc = fitz.open(source)
    final_doc = fitz.open(source)
    annotated_added = []
    applied = []
    annotation_unmatched = []
    final_unmatched = []
    for index, item in enumerate(decisions, 1):
        match_text = str(item.get("match_text", "")).strip()
        occurrence = int(item.get("occurrence", 1))
        annotated_target = find_pdf_rect(annotated_doc, match_text, occurrence)
        final_target = find_pdf_rect(final_doc, match_text, occurrence)
        if annotated_target:
            page_number, rect = annotated_target
            annotated_page = annotated_doc[page_number]
            highlight = annotated_page.add_highlight_annot(rect)
            highlight.set_info(title=AUTHOR, content=decision_text(item))
            highlight.update()
            annotated_added.append({"index": index, "location": f"page {page_number + 1}"})
        else:
            annotation_unmatched.append({"index": index, "match_text": match_text, "reason": "PDF text not found"})
        if final_target:
            page_number, rect = final_target
            final_page = final_doc[page_number]
            final_page.add_redact_annot(
                rect,
                text=str(item.get("replacement", "")),
                fontname="china-s",
                fontsize=max(6, min(11, rect.height * 0.72)),
                fill=(1, 1, 1),
                text_color=(0, 0, 0),
            )
            applied.append({"index": index, "location": f"page {page_number + 1}"})
        else:
            final_unmatched.append({"index": index, "match_text": match_text, "reason": "PDF text not found"})
    for page in final_doc:
        page.apply_redactions()
    annotated.parent.mkdir(parents=True, exist_ok=True)
    annotated_doc.save(annotated)
    final_doc.save(final)
    annotated_doc.close()
    final_doc.close()
    fitz.open(annotated).close()
    fitz.open(final).close()
    return result_payload(annotated_added, annotation_unmatched, applied, final_unmatched)


def find_pdf_rect(document, match_text: str, occurrence: int):
    seen = 0
    for page_number, page in enumerate(document):
        matches = page.search_for(match_text)
        if seen + len(matches) >= occurrence:
            return page_number, matches[occurrence - seen - 1]
        seen += len(matches)
    return None


def normalize_result(annotation_result, applied, unmatched):
    return result_payload(annotation_result["added"], annotation_result["unmatched"], applied, unmatched)


def result_payload(annotated_added, annotation_unmatched, applied, final_unmatched):
    return {
        "annotated": {"applied": annotated_added, "unmatched": annotation_unmatched},
        "final": {"applied": applied, "unmatched": final_unmatched},
    }


def revise(source: Path, annotated: Path, final: Path, decisions: list[dict]):
    validate_paths(source, annotated, final)
    for index, item in enumerate(decisions, 1):
        if not isinstance(item, dict) or not str(item.get("match_text", "")).strip():
            raise ValueError(f"decision {index} requires match_text")
        if "replacement" not in item:
            raise ValueError(f"decision {index} requires replacement")
    handlers = {
        ".docx": revise_docx,
        ".xlsx": revise_xlsx,
        ".pptx": revise_pptx,
        ".pdf": revise_pdf,
    }
    result = handlers[source.suffix.lower()](source, annotated, final, decisions)
    return {
        "source": str(source.resolve()),
        "annotated_output": str(annotated.resolve()),
        "final_output": str(final.resolve()),
        **result,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("decisions")
    parser.add_argument("--annotated", required=True)
    parser.add_argument("--final", required=True)
    args = parser.parse_args()
    decisions = json.loads(Path(args.decisions).read_text(encoding="utf-8"))
    if not isinstance(decisions, list):
        raise ValueError("decisions JSON must be an array")
    result = revise(Path(args.input), Path(args.annotated), Path(args.final), decisions)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
