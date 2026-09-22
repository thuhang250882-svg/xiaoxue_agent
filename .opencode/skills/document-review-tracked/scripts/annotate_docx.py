#!/usr/bin/env python3
"""Inject precise Word comments into a copy of an existing DOCX."""

from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph
from docx.text.run import Run


def paragraphs(document):
    for element in document.element.body.iter(qn("w:p")):
        yield Paragraph(element, document._body)


def split_run(run: Run, offset: int) -> Run:
    text = run.text
    if offset <= 0:
        return run
    if offset >= len(text):
        raise ValueError("split offset is outside the run")
    right_element = copy.deepcopy(run._element)
    run._element.addnext(right_element)
    run.text = text[:offset]
    right = Run(right_element, run._parent)
    right.text = text[offset:]
    return right


def comment_runs(paragraph: Paragraph, start: int, end: int):
    runs = paragraph.runs
    spans = []
    cursor = 0
    for run in runs:
        spans.append((run, cursor, cursor + len(run.text)))
        cursor += len(run.text)
    selected = [(run, left, right) for run, left, right in spans if left < end and right > start]
    if not selected:
        raise ValueError("matched text has no commentable runs")

    first, first_left, _ = selected[0]
    last, last_left, _ = selected[-1]
    same_run = first._element is last._element
    if end < last_left + len(last.text):
        split_run(last, end - last_left)
    if start > first_left:
        first = split_run(first, start - first_left)
    if same_run:
        return [first]

    current = paragraph.runs
    start_index = next(index for index, run in enumerate(current) if run._element is first._element)
    last_element = selected[-1][0]._element
    end_index = next(index for index, run in enumerate(current) if run._element is last_element)
    return current[start_index : end_index + 1]


def locate(document, match_text: str, occurrence: int):
    seen = 0
    for paragraph in paragraphs(document):
        cursor = 0
        while True:
            start = paragraph.text.find(match_text, cursor)
            if start < 0:
                break
            seen += 1
            if seen == occurrence:
                return paragraph, start, start + len(match_text)
            cursor = start + max(1, len(match_text))
    return None


def annotate(input_path: Path, output_path: Path, annotations: list[dict]):
    if input_path.suffix.lower() != ".docx" or output_path.suffix.lower() != ".docx":
        raise ValueError("input and output must both be .docx files")
    if input_path.resolve() == output_path.resolve():
        raise ValueError("output must not overwrite the source document")

    document = Document(input_path)
    added = []
    unmatched = []
    for index, annotation in enumerate(annotations, 1):
        match_text = str(annotation.get("match_text", "")).strip()
        comment = str(annotation.get("comment", "")).strip()
        if not match_text or not comment:
            unmatched.append({"index": index, "reason": "match_text and comment are required"})
            continue
        found = locate(document, match_text, int(annotation.get("occurrence", 1)))
        if not found:
            unmatched.append({"index": index, "match_text": match_text, "reason": "text not found"})
            continue
        paragraph, start, end = found
        try:
            comment_id = document.add_comment(
                runs=comment_runs(paragraph, start, end),
                text=comment,
                author=str(annotation.get("author", "AI审核")),
                initials=str(annotation.get("initials", "AI")),
            ).comment_id
            added.append({"index": index, "comment_id": comment_id, "match_text": match_text})
        except Exception as error:
            unmatched.append({"index": index, "match_text": match_text, "reason": str(error)})

    output_path.parent.mkdir(parents=True, exist_ok=True)
    document.save(output_path)
    reopened = Document(output_path)
    if len(reopened.comments) < len(added):
        raise RuntimeError("saved DOCX did not retain all injected comments")
    return {"output": str(output_path.resolve()), "added": added, "unmatched": unmatched}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("annotations", help="UTF-8 JSON file containing an array of comment decisions")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    annotations = json.loads(Path(args.annotations).read_text(encoding="utf-8"))
    if not isinstance(annotations, list):
        raise ValueError("annotations JSON must be an array")
    print(json.dumps(annotate(Path(args.input), Path(args.out), annotations), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
