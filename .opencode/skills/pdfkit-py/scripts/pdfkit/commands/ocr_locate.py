#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OCR 文字定位脚本。
优先使用安装包内置 RapidOCR（离线、中英文），不可用时降级 pytesseract。
"""

import os
import sys

# smart_edit 辅助函数从 lite 包导入
from pdfkit.commands.smart_edit import _is_cjk

COMMAND = "ocr_locate"
DESCRIPTION = "OCR 定位 PDF 页面中的文字位置，支持 CJK 文本"
CATEGORY = "read"
PARAMS = [
    {"name": "input", "type": "str", "required": True, "help": "PDF 文件路径"},
    {"name": "page", "type": "int", "required": False, "default": 0, "help": "目标页码（从 0 开始）"},
    {"name": "text", "type": "str", "required": False, "default": "", "help": "要定位的文字（不填返回全部 OCR 结果）"},
    {"name": "lang", "type": "str", "required": False, "default": "eng+chi_sim", "help": "OCR 语言（仅 pytesseract 兜底路径生效）"},
]


def handler(params):
    """OCR 定位 PDF 页面中的文字位置，支持 CJK 文本。

    Args:
        params: {
            "input": PDF 路径,
            "page": 目标页码（从 0 开始）,
            "text": 要定位的文字（可选，不填返回全部 OCR 结果）,
            "lang": OCR 语言（默认 eng+chi_sim，仅 pytesseract 兜底路径生效）
        }
    """
    import fitz
    from pdfkit.ocr_backend import ocr_page_blocks

    input_path = params["input"]
    page_num = params.get("page", 0)
    target_text = params.get("text", "")
    lang = params.get("lang", "eng+chi_sim")

    doc = fitz.open(input_path)
    page = doc[page_num]

    page_width = page.rect.width
    page_height = page.rect.height

    # OCR 识别（RapidOCR 优先，pytesseract 兜底），坐标已换算为 PDF 坐标系
    blocks = ocr_page_blocks(page, lang=lang)

    doc.close()

    # 如果指定了目标文字，过滤匹配结果
    if target_text:
        matched = []
        target_lower = target_text.lower()

        # 精确匹配
        for block in blocks:
            if target_lower in block["text"].lower():
                block["match_type"] = "exact"
                matched.append(block)

        # 如果精确匹配失败，尝试连续词匹配（支持 CJK 逐字合并）
        if not matched:
            # 对于 CJK 文本，不加空格拼接
            full_text_parts = []
            for b in blocks:
                if full_text_parts:
                    last_char = full_text_parts[-1][-1] if full_text_parts[-1] else ''
                    first_char = b["text"][0] if b["text"] else ''
                    if _is_cjk(last_char) or _is_cjk(first_char):
                        full_text_parts.append(b["text"])
                    else:
                        full_text_parts.append(" " + b["text"])
                else:
                    full_text_parts.append(b["text"])
            full_text = "".join(full_text_parts)

            if target_lower in full_text.lower():
                # 找到连续的词组成目标文本
                for i, block in enumerate(blocks):
                    combined = block["text"]
                    region = {
                        "text": combined,
                        "x": block["x"],
                        "y": block["y"],
                        "width": block["width"],
                        "height": block["height"],
                        "confidence": block["confidence"],
                    }
                    for j in range(i + 1, min(i + 10, len(blocks))):
                        next_text = blocks[j]["text"]
                        # CJK 字符之间不加空格
                        if combined and next_text:
                            if _is_cjk(combined[-1]) or _is_cjk(next_text[0]):
                                combined += next_text
                            else:
                                combined += " " + next_text
                        else:
                            combined += next_text
                        region["width"] = (blocks[j]["x"] + blocks[j]["width"]) - region["x"]
                        region["height"] = max(region["height"], blocks[j]["height"])
                        region["text"] = combined

                        if target_lower in combined.lower():
                            region["match_type"] = "combined"
                            matched.append(region)
                            break

        return {
            "page": page_num,
            "page_size": {"width": round(page_width, 1), "height": round(page_height, 1)},
            "target": target_text,
            "matches": matched,
            "match_count": len(matched),
        }

    return {
        "page": page_num,
        "page_size": {"width": round(page_width, 1), "height": round(page_height, 1)},
        "blocks": blocks,
        "total_blocks": len(blocks),
    }


if __name__ == "__main__":
    from pdfkit.base import main
    main(handler, PARAMS, DESCRIPTION)
