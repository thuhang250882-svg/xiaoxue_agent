#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""统一 OCR 后端。

优先使用安装包内置的 RapidOCR（离线、中英文、自带模型），
RapidOCR 不可用时降级到 pytesseract（需要系统安装 tesseract）。

供 extract_text / ocr_locate 等命令复用。
"""

import io

# RapidOCR 引擎缓存：模型加载约 1 秒，多页文档只加载一次
_rapidocr_engine = None
_rapidocr_tried = False


def get_rapidocr():
    """获取（并缓存）RapidOCR 引擎。

    Returns:
        RapidOCR 实例；不可用（未安装 / 模型缺失 / 初始化失败）返回 None
    """
    global _rapidocr_engine, _rapidocr_tried
    if _rapidocr_tried:
        return _rapidocr_engine
    _rapidocr_tried = True
    try:
        from rapidocr import RapidOCR
        _rapidocr_engine = RapidOCR()
    except Exception as e:  # noqa: BLE001 - 任何初始化失败都视为不可用
        import sys
        print(f"[info] RapidOCR 不可用，将降级到 pytesseract: {e}", file=sys.stderr)
        _rapidocr_engine = None
    return _rapidocr_engine


def page_to_image(page, dpi=300):
    """把 fitz.Page 渲染为 PIL Image。"""
    import fitz
    from PIL import Image

    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat)
    return Image.open(io.BytesIO(pix.tobytes("png")))


def ocr_page_text(page, lang="eng+chi_sim", dpi=300):
    """对单个页面 OCR 提取纯文本（RapidOCR 优先，pytesseract 兜底）。

    Args:
        page: fitz.Page 对象
        lang: pytesseract 语言（仅兜底路径生效；RapidOCR 内置中英文）
        dpi: 渲染分辨率

    Returns:
        提取的文本字符串，失败返回空字符串
    """
    # ---- 主通道：RapidOCR ----
    engine = get_rapidocr()
    if engine is not None:
        try:
            img = page_to_image(page, dpi=dpi)
            result = engine(img)
            txts = getattr(result, "txts", None)
            if txts:
                # txts 已按检测框阅读顺序排列
                return "\n".join(txts).strip()
            return ""
        except Exception as e:  # noqa: BLE001
            import sys
            print(f"[warn] RapidOCR 提取第 {page.number} 页失败: {e}", file=sys.stderr)

    # ---- 兜底：pytesseract ----
    try:
        import pytesseract
        from pdfkit.commands.smart_edit import _check_tesseract_langs

        _check_tesseract_langs(lang)
        img = page_to_image(page, dpi=dpi)
        return pytesseract.image_to_string(img, lang=lang).strip()
    except ImportError:
        return ""
    except Exception as e:  # noqa: BLE001
        import sys
        print(f"[warn] pytesseract 提取第 {page.number} 页失败: {e}", file=sys.stderr)
        return ""


def ocr_page_blocks(page, lang="eng+chi_sim", dpi=300):
    """对单个页面 OCR 提取带坐标的文字块（PDF 坐标系）。

    Returns:
        list[dict]: 每项 {text, x, y, width, height, confidence}，
        坐标为 PDF 点（72dpi 基准），失败返回空列表
    """
    scale = dpi / 72.0

    # ---- 主通道：RapidOCR ----
    engine = get_rapidocr()
    if engine is not None:
        try:
            img = page_to_image(page, dpi=dpi)
            result = engine(img)
            boxes = getattr(result, "boxes", None)
            txts = getattr(result, "txts", None)
            scores = getattr(result, "scores", None)
            if txts is None:
                return []
            blocks = []
            for idx, text in enumerate(txts):
                box = boxes[idx] if boxes is not None and idx < len(boxes) else None
                if box is None:
                    continue
                # box 为四角点 [[x,y]×4]（像素坐标），转轴对齐包围盒
                # 注意：坐标为 numpy float32，必须显式转 Python float 否则 JSON 不可序列化
                xs = [float(p[0]) for p in box]
                ys = [float(p[1]) for p in box]
                x, y = min(xs) / scale, min(ys) / scale
                w, h = (max(xs) - min(xs)) / scale, (max(ys) - min(ys)) / scale
                conf = scores[idx] if scores is not None and idx < len(scores) else 1.0
                blocks.append({
                    "text": text,
                    "x": round(x, 1),
                    "y": round(y, 1),
                    "width": round(w, 1),
                    "height": round(h, 1),
                    "confidence": round(float(conf) * 100),
                })
            return blocks
        except Exception as e:  # noqa: BLE001
            import sys
            print(f"[warn] RapidOCR 定位第 {page.number} 页失败: {e}", file=sys.stderr)

    # ---- 兜底：pytesseract ----
    try:
        import pytesseract
        from pdfkit.commands.smart_edit import _check_tesseract_langs

        _check_tesseract_langs(lang)
        img = page_to_image(page, dpi=dpi)
        data = pytesseract.image_to_data(img, lang=lang, output_type=pytesseract.Output.DICT)
        blocks = []
        for i in range(len(data["text"])):
            text = data["text"][i].strip()
            if not text:
                continue
            conf = int(data["conf"][i])
            if conf < 0:
                continue
            blocks.append({
                "text": text,
                "x": round(data["left"][i] / scale, 1),
                "y": round(data["top"][i] / scale, 1),
                "width": round(data["width"][i] / scale, 1),
                "height": round(data["height"][i] / scale, 1),
                "confidence": conf,
            })
        return blocks
    except ImportError:
        return []
    except Exception as e:  # noqa: BLE001
        import sys
        print(f"[warn] pytesseract 定位第 {page.number} 页失败: {e}", file=sys.stderr)
        return []
