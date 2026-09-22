# -*- coding: utf-8 -*-
"""院级周工作联席会汇报汇总生成器

版式规格来源：单位原始周报实测
  纸张 A4 21.00 x 29.70 cm
  边距 上3.7 下3.5 左2.8 右2.6 cm
  大标题 方正小标宋简体 二号(22pt) 居中 行距固定32磅
  单位名 方正小标宋简体 二号(22pt) 居中 行距固定32磅
  一级标题 方正黑体简体 三号(16pt) 首行缩进2字符 行距固定28磅
  二级标题 方正楷体简体 三号(16pt) 首行缩进2字符 行距固定28磅
  正文 方正仿宋简体 三号(16pt) 首行缩进2字符 行距固定28磅
  表格 仿宋 小四(12pt) 居中 全线框 两行合并表头
  全文不加粗
"""
import argparse
import json
import os
import re
import tempfile
from pathlib import Path

from docx import Document
from docx.enum.table import WD_ALIGN_VERTICAL
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt

SONG = '方正小标宋简体'
HEI = '方正黑体简体'
KAI = '方正楷体简体'
FANG = '方正仿宋简体'
FANG_PLAIN = '仿宋'

PAGE_W, PAGE_H = 21.0, 29.7          # A4 cm
MARGINS = (3.7, 3.5, 2.8, 2.6)       # 上 下 左 右 cm
BODY_INDENT_PT = 32.0                # 2 字符 × 16pt
LINE_BODY = 28.0                     # 正文行距固定值 磅
LINE_TITLE = 32.0                    # 标题行距固定值 磅
SPLIT_LIMIT = 320                    # 超长段落按句拆分的字数阈值


def _set_font(run, name, size, bold=False):
    run.font.name = name
    run.font.size = Pt(size)
    run.font.bold = bold
    rpr = run._element.get_or_add_rPr()
    rf = rpr.find(qn('w:rFonts'))
    if rf is None:
        rf = rpr.makeelement(qn('w:rFonts'), {})
        rpr.insert(0, rf)
    for attr in ('w:ascii', 'w:hAnsi', 'w:eastAsia', 'w:cs'):
        rf.set(qn(attr), name)


def _tune(p, indent=None, align=None, line=None, space=(0, 0)):
    pf = p.paragraph_format
    pf.space_before = Pt(space[0])
    pf.space_after = Pt(space[1])
    if indent is not None:
        pf.first_line_indent = Pt(indent)
    if align == 'center':
        pf.alignment = WD_ALIGN_PARAGRAPH.CENTER
    elif align == 'left':
        pf.alignment = WD_ALIGN_PARAGRAPH.LEFT
    if line:
        pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
        pf.line_spacing = Pt(line)
    else:
        pf.line_spacing_rule = WD_LINE_SPACING.SINGLE
    return p


def add_par(doc, text, font=FANG, size=16, indent=BODY_INDENT_PT,
            align=None, line=LINE_BODY):
    p = doc.add_paragraph()
    _tune(p, indent=indent, align=align, line=line)
    if text:
        _set_font(p.add_run(text), font, size)
    return p


def smart_split(text, limit=SPLIT_LIMIT):
    """把超长段落切分成多段：先按句号，仍超长再按分号，避免整页大段文字"""
    if len(text) <= limit:
        return [text]

    units = []
    for s in (x for x in re.findall(r'[^。！？]*[。！？]|[^。！？]+$', text) if x):
        if len(s) <= limit:
            units.append(s)
            continue
        sub = [x for x in re.findall(r'[^；]*；|[^；]+$', s) if x]
        units.extend(sub if len(sub) > 1 else [s])

    chunks, cur = [], ''
    for u in units:
        if cur and len(cur) + len(u) > limit:
            chunks.append(cur)
            cur = u
        else:
            cur += u
    return chunks or [text]


# ---------- 表格 ----------

def _set_borders(tbl, sz=4, color='000000'):
    tpr = tbl._tbl.tblPr
    old = tpr.find(qn('w:tblBorders'))
    if old is not None:
        tpr.remove(old)
    b = OxmlElement('w:tblBorders')
    for side in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        el = OxmlElement('w:' + side)
        el.set(qn('w:val'), 'single')
        el.set(qn('w:sz'), str(sz))
        el.set(qn('w:space'), '0')
        el.set(qn('w:color'), color)
        b.append(el)
    tpr.append(b)


def _cell_text(cell, text, font=FANG_PLAIN, size=12, align='center'):
    cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    p = cell.paragraphs[0]
    _tune(p, indent=0, align=align, line=None)
    if text:
        _set_font(p.add_run(text), font, size)


def _vmerge(cell, val):
    tcpr = cell._tc.get_or_add_tcPr()
    old = tcpr.find(qn('w:vMerge'))
    if old is not None:
        tcpr.remove(old)
    el = OxmlElement('w:vMerge')
    if val:
        el.set(qn('w:val'), val)
    tcpr.append(el)


def _mark_header_rows(tbl, n):
    for i in range(n):
        trpr = tbl.rows[i]._tr.get_or_add_trPr()
        el = OxmlElement('w:tblHeader')
        trpr.append(el)


def _prevent_row_split(row):
    row._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))


def _header_span(spec):
    match = re.search(r'\^(\d+)$', spec)
    return int(match.group(1)) if match else 1


def add_table(doc, row1, row2, data, weights):
    """两行合并表头 + 数据行；weights 为各列相对宽度"""
    ncol = len(row2)
    if not ncol:
        raise ValueError('第二行表头不能为空')
    if sum(_header_span(spec) for spec in row1) != ncol:
        raise ValueError('第一行合并表头跨度必须等于第二行列数')
    if any(len(row) != ncol for row in data):
        raise ValueError('表格数据列数必须与第二行表头一致')
    if len(weights) != ncol or any(weight <= 0 for weight in weights):
        raise ValueError('表格列宽权重必须为与列数相同的正数')
    tbl = doc.add_table(rows=len(data) + 2, cols=ncol)
    tbl.autofit = False
    _set_borders(tbl)

    # 表格总宽 = 版心宽度
    text_w_tw = int((PAGE_W - MARGINS[2] - MARGINS[3]) / 2.54 * 1440)
    total = float(sum(weights))
    widths = [int(text_w_tw * w / total) for w in weights]
    widths[-1] = text_w_tw - sum(widths[:-1])

    table_width = tbl._tbl.tblPr.find(qn('w:tblW'))
    if table_width is None:
        table_width = OxmlElement('w:tblW')
        tbl._tbl.tblPr.insert(0, table_width)
    table_width.set(qn('w:type'), 'dxa')
    table_width.set(qn('w:w'), str(text_w_tw))

    for ci, w in enumerate(widths):
        tbl.columns[ci].width = Pt(w / 20.0)
        for r in tbl.rows:
            r.cells[ci].width = Pt(w / 20.0)

    # --- 第 1 行：分组表头（含横向合并 ^N、纵向合并起点 ^V）---
    ci = 0
    for spec in row1:
        span = 1
        vm = False
        m = re.search(r'\^(\d+)$', spec)
        if m:
            span = int(m.group(1))
            spec = spec[:m.start()]
        if spec.endswith('^V'):
            vm = True
            spec = spec[:-2]
        cell = tbl.cell(0, ci)
        _cell_text(cell, spec)
        if span > 1:
            cell.merge(tbl.cell(0, ci + span - 1))
        if vm:
            _vmerge(cell, 'restart')
        ci += span

    # --- 第 2 行：子表头（~ 表示承接上方纵向合并）---
    for ci, spec in enumerate(row2):
        cell = tbl.cell(1, ci)
        if spec.strip() == '~':
            _vmerge(cell, None)
            _cell_text(cell, '')
            if cell._tc.find(qn('w:tcPr')) is not None:
                vms = cell._tc.find(qn('w:tcPr')).findall(qn('w:vMerge'))
                for extra in vms[1:]:
                    cell._tc.find(qn('w:tcPr')).remove(extra)
        else:
            _cell_text(cell, spec)

    # --- 数据行 ---
    for ri, row in enumerate(data):
        for ci, v in enumerate(row):
            _cell_text(tbl.cell(ri + 2, ci), v)
        _prevent_row_split(tbl.rows[ri + 2])

    _mark_header_rows(tbl, 2)
    return tbl


# ---------- 页脚页码 ----------

def add_page_number(doc):
    p = doc.sections[0].footer.paragraphs[0]
    _tune(p, indent=0, align='center', line=None)
    run = p.add_run()
    _set_font(run, FANG_PLAIN, 14)
    b = OxmlElement('w:fldChar')
    b.set(qn('w:fldCharType'), 'begin')
    t = OxmlElement('w:instrText')
    t.set(qn('xml:space'), 'preserve')
    t.text = ' PAGE '
    e = OxmlElement('w:fldChar')
    e.set(qn('w:fldCharType'), 'end')
    for el in (b, t, e):
        run._element.append(el)


# ---------- 主流程 ----------

def build(content, out_path):
    if os.path.exists(out_path):
        raise FileExistsError('拒绝覆盖已有文件：' + str(out_path))
    doc = Document()
    s = doc.sections[0]
    s.page_width, s.page_height = Cm(PAGE_W), Cm(PAGE_H)
    s.top_margin, s.bottom_margin = Cm(MARGINS[0]), Cm(MARGINS[1])
    s.left_margin, s.right_margin = Cm(MARGINS[2]), Cm(MARGINS[3])
    s.header_distance, s.footer_distance = Cm(1.5), Cm(1.75)

    pending = None
    weights = None

    for raw in content.split('\n'):
        line = raw.rstrip()
        if not line.strip():
            continue
        if line.startswith('@@ '):
            add_par(doc, line[3:], SONG, 22, indent=0,
                    align='center', line=LINE_TITLE)
        elif line.startswith('#0 '):
            add_par(doc, line[3:], SONG, 22, indent=0,
                    align='center', line=LINE_TITLE)
        elif line.startswith('#1 '):
            add_par(doc, line[3:], HEI, 16)
        elif line.startswith('#2 '):
            add_par(doc, line[3:], KAI, 16)
        elif line.startswith('%T '):
            pending = {'row1': line[3:].split('；'), 'row2': None, 'data': []}
        elif line.startswith('%H '):
            if pending is not None:
                pending['row2'] = line[3:].split('；')
        elif line.startswith('%W '):
            weights = [float(x) for x in line[3:].split('；')]
        elif line.startswith('%R '):
            if pending is not None:
                pending['data'].append(line[3:].split('；'))
        elif line.startswith('%E'):
            if pending is not None and pending['row2']:
                n = len(pending['row2'])
                w = weights or [1.0] * n
                add_table(doc, pending['row1'], pending['row2'],
                          pending['data'], w)
                pending = None
                weights = None
        else:
            for chunk in smart_split(line):
                add_par(doc, chunk)

    if pending is not None and pending['row2']:
        n = len(pending['row2'])
        add_table(doc, pending['row1'], pending['row2'],
                  pending['data'], weights or [1.0] * n)

    add_page_number(doc)
    doc.save(out_path)
    print('已生成：' + out_path)


def extract_docx(path):
    """确定性提取 DOCX 的正文段落和表格；旧版 DOC 应走小雪内置文档读取。"""
    source = Path(path)
    if source.suffix.lower() != '.docx':
        raise ValueError('本地提取器只支持 DOCX；DOC 请使用小雪内置文档读取能力')
    doc = Document(source)
    return {
        'file': str(source.resolve()),
        'paragraphs': [paragraph.text for paragraph in doc.paragraphs if paragraph.text.strip()],
        'tables': [
            [[cell.text for cell in row.cells] for row in table.rows]
            for table in doc.tables
        ],
    }


def save_extraction(paths, output=None):
    result = [extract_docx(path) for path in paths]
    payload = json.dumps(result, ensure_ascii=False, indent=2)
    if output is None:
        print(payload)
        return
    if os.path.exists(output):
        raise FileExistsError('拒绝覆盖已有文件：' + str(output))
    Path(output).write_text(payload, encoding='utf-8')
    print('已提取：' + str(output))


def selfcheck():
    """生成、回读并验证汇总件的核心版式、抽取和禁止覆盖约束。"""
    out_dir = Path(tempfile.mkdtemp(prefix='weekly_merge_selfcheck_'))
    source = out_dir / '源件.docx'
    source_doc = Document()
    source_doc.add_paragraph('测试单位')
    source_doc.add_table(rows=1, cols=2).rows[0].cells[0].text = '工作量'
    source_doc.save(source)
    extracted = extract_docx(source)
    if extracted['paragraphs'] != ['测试单位'] or not extracted['tables']:
        raise AssertionError('DOCX 正文或表格提取失败')

    output = out_dir / '院级汇总.docx'
    content = '\n'.join([
        '#0 地质研究院（录井工程分公司）',
        '#0 周工作联席会汇报',
        '#1 一、生产、经营情况',
        '自检样例正文。',
        '%T 区块^V；周计划（天）^2',
        '%H ~；自有；合作',
        '%W 2；1；1',
        '%R 塔里木；10；5',
        '%E',
    ])
    build(content, str(output))
    checked = Document(output)
    section = checked.sections[0]
    margins = tuple(round(value.cm, 2) for value in (
        section.top_margin, section.bottom_margin,
        section.left_margin, section.right_margin,
    ))
    if margins != MARGINS:
        raise AssertionError(f'页边距不符：{margins}')
    body = next(paragraph for paragraph in checked.paragraphs if paragraph.text == '自检样例正文。')
    if body.paragraph_format.line_spacing_rule != WD_LINE_SPACING.EXACTLY:
        raise AssertionError('正文未使用固定行距')
    if round(body.paragraph_format.line_spacing.pt, 1) != LINE_BODY:
        raise AssertionError('正文固定行距不是 28 磅')
    table_run = checked.tables[0].cell(1, 1).paragraphs[0].runs[0]
    if table_run.font.size.pt != 12 or table_run.font.bold:
        raise AssertionError('表格字体规格不符')
    expected_width = int((PAGE_W - MARGINS[2] - MARGINS[3]) / 2.54 * 1440)
    grid_width = sum(int(column.get(qn('w:w'))) for column in checked.tables[0]._tbl.tblGrid.gridCol_lst)
    if grid_width != expected_width:
        raise AssertionError(f'表格总宽不等于版心宽：{grid_width} != {expected_width}')
    try:
        build(content, str(output))
    except FileExistsError:
        pass
    else:
        raise AssertionError('生成器未拒绝覆盖已有文件')
    print('自检结果：全部通过')
    print('输出目录：' + str(out_dir))
    return 0


def main():
    parser = argparse.ArgumentParser(description='院级周报汇总生成与 DOCX 提取')
    parser.add_argument('content', nargs='?', help='标记文本文件')
    parser.add_argument('output', nargs='?', help='新 DOCX 路径')
    parser.add_argument('--extract', nargs='+', metavar='DOCX', help='提取一个或多个 DOCX')
    parser.add_argument('--json-out', help='把提取结果写入新的 JSON 文件')
    parser.add_argument('--selfcheck', action='store_true', help='生成并回读验证')
    args = parser.parse_args()

    if args.selfcheck:
        return selfcheck()
    if args.extract:
        save_extraction(args.extract, args.json_out)
        return 0
    if not args.content or not args.output:
        parser.error('生成汇总件需要提供内容文本和新 DOCX 路径')
    with open(args.content, encoding='utf-8') as source:
        build(source.read(), args.output)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
