import json
import logging
import re
import sys

import fitz
import pdfplumber


RESULT_PREFIX = "XIAOXUE_PDF_RESULT:"
NATIVE_TEXT_THRESHOLD = 40
OCR_PAGE_LIMIT = 60


def normalize_text(value):
    value = value.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def ocr_page(page, engine):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), colorspace=fitz.csRGB, alpha=False)
    result = engine(pixmap.tobytes("png"))
    texts = getattr(result, "txts", None) or ()
    scores = getattr(result, "scores", None) or ()
    return "\n".join(
        text.strip()
        for index, text in enumerate(texts)
        if text.strip() and (index >= len(scores) or scores[index] >= 0.45)
    )


def extract(filepath, output_limit):
    sections = []
    length = 0
    ocr_pages = []
    ocr_error = None
    engine = None
    truncated = False
    ocr_attempts = 0
    ocr_skipped = 0

    with pdfplumber.open(filepath) as text_document, fitz.open(filepath) as visual_document:
        page_count = len(text_document.pages)
        for index, text_page in enumerate(text_document.pages):
            native = normalize_text(text_page.extract_text(x_tolerance=2, y_tolerance=3) or "")
            visual_page = visual_document[index]
            should_ocr = len(re.sub(r"\s", "", native)) < NATIVE_TEXT_THRESHOLD and bool(
                visual_page.get_images(full=True)
            )
            if should_ocr and ocr_attempts < OCR_PAGE_LIMIT:
                ocr_attempts += 1
                try:
                    if engine is None:
                        logging.getLogger("RapidOCR").setLevel(logging.ERROR)
                        from rapidocr import RapidOCR

                        engine = RapidOCR()
                    recognized = normalize_text(ocr_page(visual_page, engine))
                    if len(recognized) > len(native):
                        native = recognized
                        ocr_pages.append(index + 1)
                except Exception as error:
                    ocr_error = str(error)
            elif should_ocr:
                ocr_skipped += 1
                truncated = True

            if not native:
                continue
            header = f"## Page {index + 1}\n"
            separator = "\n\n" if sections else ""
            remaining = output_limit - length - len(separator) - len(header)
            if remaining <= 0:
                truncated = True
                break
            pages_left = max(1, page_count - index)
            future_page_overhead = max(0, pages_left - 1) * 18
            page_budget = max(1, (remaining - future_page_overhead) // pages_left)
            selected = native[: min(page_budget, remaining)]
            sections.append(header + selected)
            length += len(separator) + len(header) + len(selected)
            if len(native) > len(selected):
                truncated = True

    return {
        "pages": page_count,
        "text": "\n\n".join(sections),
        "ocrPages": ocr_pages,
        "ocrPageLimit": OCR_PAGE_LIMIT,
        "ocrSkippedPages": ocr_skipped,
        "ocrError": ocr_error,
        "truncated": truncated,
    }


def main():
    if len(sys.argv) != 3:
        raise ValueError("usage: pdf_extract.py <file.pdf> <output-limit>")
    result = extract(sys.argv[1], int(sys.argv[2]))
    print(RESULT_PREFIX + json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
