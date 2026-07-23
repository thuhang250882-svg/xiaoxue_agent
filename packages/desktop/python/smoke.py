import json
import sys
from importlib import metadata

MODULES = {
    "docx": "python-docx",
    "openpyxl": "openpyxl",
    "pandas": "pandas",
    "pdfplumber": "pdfplumber",
    "fitz": "PyMuPDF",
    "PIL": "Pillow",
    "reportlab": "reportlab",
    "yaml": "PyYAML",
    "xlrd": "xlrd",
}

for module in MODULES:
    __import__(module)

print(json.dumps({
    "python": sys.version.split()[0],
    "packages": {name: metadata.version(distribution) for name, distribution in MODULES.items()},
}, ensure_ascii=False))
