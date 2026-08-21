import json
import sys
import tempfile
from importlib import metadata
from pathlib import Path

MODULES = {
    "docx": "python-docx",
    "openpyxl": "openpyxl",
    "pandas": "pandas",
    "pdfplumber": "pdfplumber",
    "fitz": "PyMuPDF",
    "PIL": "Pillow",
    "rapidocr": "rapidocr",
    "onnxruntime": "onnxruntime",
    "reportlab": "reportlab",
    "pypdf": "pypdf",
    "statsmodels": "statsmodels",
    "yaml": "PyYAML",
    "xlrd": "xlrd",
}

for module in MODULES:
    __import__(module)

from reportlab.pdfgen import canvas
import pdfplumber
import fitz
from pdf_extract import extract

with tempfile.TemporaryDirectory(prefix="xiaoxue-pdf-check-") as directory:
    sample = Path(directory) / "sample.pdf"
    document = canvas.Canvas(str(sample))
    document.drawString(72, 720, "XIAOXUE_PDF_RUNTIME_OK")
    document.save()
    with pdfplumber.open(sample) as pdf:
        extracted = "\n".join((page.extract_text() or "") for page in pdf.pages)
    if "XIAOXUE_PDF_RUNTIME_OK" not in extracted:
        raise RuntimeError("Bundled PDF extraction smoke test failed")

    long_sample = Path(directory) / "long-sample.pdf"
    document = canvas.Canvas(str(long_sample))
    document.drawString(72, 720, "A" * 2_000)
    document.showPage()
    document.drawString(72, 720, "XIAOXUE_LAST_PAGE_OK")
    document.save()
    bounded = extract(str(long_sample), 500)
    if "XIAOXUE_LAST_PAGE_OK" not in bounded["text"] or not bounded["truncated"]:
        raise RuntimeError(f"Bundled PDF whole-document budget smoke test failed: {bounded!r}")

    source = fitz.open(sample)
    pixmap = source[0].get_pixmap(matrix=fitz.Matrix(2, 2), colorspace=fitz.csRGB, alpha=False)
    scanned = Path(directory) / "scanned.pdf"
    scan = fitz.open()
    page = scan.new_page(width=source[0].rect.width, height=source[0].rect.height)
    page.insert_image(page.rect, stream=pixmap.tobytes("png"))
    scan.save(scanned)
    source.close()
    scan.close()
    ocr = extract(str(scanned), 32_000)
    if "XIAOXUE" not in ocr["text"].upper() or not ocr["ocrPages"]:
        raise RuntimeError("Bundled scanned PDF OCR smoke test failed")

print(json.dumps({
    "python": sys.version.split()[0],
    "packages": {name: metadata.version(distribution) for name, distribution in MODULES.items()},
    "pdfExtraction": True,
    "pdfOcr": True,
}, ensure_ascii=False))
