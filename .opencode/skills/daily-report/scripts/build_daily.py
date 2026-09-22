# -*- coding: utf-8 -*-
"""地质研究院（录井工程分公司）生产运行日报汇总生成器

用法：
    python build_daily.py <内容标记文件> <输出.docx>
    python build_daily.py --selfcheck
    python build_daily.py --list

版式规格（西部钻探公文标准，与 weekly-report 一致）
    纸张 A4 21.00 x 29.70 cm
    边距 上3.7 下3.5 左2.8 右2.6 cm
    文档标题 方正小标宋简体 二号(22pt) 居中 行距固定32磅
    日期行   方正黑体简体   三号(16pt) 居中 行距固定32磅
    一级标题 方正黑体简体   三号(16pt) 首行缩进2字符 行距固定28磅
    二级标题 方正楷体简体   三号(16pt) 首行缩进2字符 行距固定28磅
    正文     方正仿宋简体   三号(16pt) 首行缩进2字符 行距固定28磅
    表格     仿宋 小四(12pt) 居中 全线框 支持单行/两行合并表头
    全文不加粗

内容标记
    #T  文档标题
    #D  日期行
    #1  一级标题
    #2  二级标题
    其余非空行   正文段落（超长自动按句号/分号拆段）
    %W  列宽权重（；分隔），可选，缺省等宽
    %G  分组表头行（可选；缺省则为单行表头）。^N 表示横向合并 N 列，^V 表示该列为
        纵向合并起点；下一行同列用 ~ 承接
    %S  子表头行（必须写满列数）
    %R  数据行（；分隔）
    %SUM 合计行（自动计算）。第 1 格为行标签，其余格为指令：
        SUM        该列各数据行求和
        RATE:a/b   第 a 列 ÷ 第 b 列，输出整数百分比（分母为 0 输出 /）
        ADD:a,b    第 a 列 + 第 b 列
        --         原样输出占位符 —
        （其他文本）原样填入该格，用于前几列的占位标签
    %CK 列间平衡校验，写法 "a+b=c" 或 "a+b+c=d"，列号从 1 起算。
        逐行校验数据行是否满足该等式；不平则列出每个出错行。
        例：合计列 = 各分项之和 → %CK 2+3+4+5=6
        默认不平即中断；加 --allow-unbalanced 降级为告警。
    %E  表格结束
"""
import io
import re
import sys

from decimal import Decimal, ROUND_HALF_UP

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
    """把超长段落切分成多段：先按句号，仍超长再按分号"""
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
        trpr.append(OxmlElement('w:tblHeader'))


_NUM_RE = re.compile(r'-?\d+(?:\.\d+)?')


def _num(s):
    """从单元格文本里取数值：'7（2欧申）' -> 7.0，'/' -> None"""
    if s is None:
        return None
    m = _NUM_RE.search(str(s).replace(',', ''))
    return float(m.group()) if m else None


def _col_sum(rows, idx0):
    """整列求和；列内全是非数值时返回 None（而不是 0）。

    区分「没有值」和「值为 0」很重要：把 None 当 0 会让空列也输出 0，
    掩盖口径缺失。
    """
    vals = [_num(r[idx0]) for r in rows if idx0 < len(r)]
    vals = [v for v in vals if v is not None]
    return sum(vals) if vals else None


def _half_up(x, nd):
    """四舍五入到 nd 位小数。

    Python 内置的 round() 与 '%.*f' 走的是「四舍六入五成双」(ROUND_HALF_EVEN)，
    恰好 .5 时 2.5→2、0.5→0，与国内统计惯例不符。这里统一 ROUND_HALF_UP。
    """
    if x is None:
        return None
    return float(Decimal(repr(x)).quantize(
        Decimal(1).scaleb(-nd), rounding=ROUND_HALF_UP))


def _fmt(x, nd=2):
    """按四舍五入输出：整数不带小数点，其余至多 nd 位小数。"""
    if x is None:
        return '—'
    v = _half_up(x, nd)
    if abs(v - round(v)) < 1e-9:
        return str(int(round(v)))
    s = '%.*f' % (nd, v)
    return s.rstrip('0').rstrip('.') or '0'


def _pct(x):
    """百分比取整，半个点进位。"""
    if x is None:
        return '/'
    return '%d%%' % int(_half_up(x, 0))


_RATE_RE = re.compile(r'^RATE:(\d+)/(\d+)$')
_ADD_RE = re.compile(r'^ADD:([\d,]+)$')
_CK_RE = re.compile(r'^([\d,+-]+)=([\d,+-]+)$')
_CKR_RE = re.compile(r'^(\d+)/(\d+)=(\d+)$')

BALANCE_REPORT = []       # 每次 build 前清空，供调用方读取平衡校验结果
STRICT_BALANCE = True     # False 时不平仅告警，不中断
TABLE_ROWS = []           # 每次 build 前清空：(表序号, 行名, 原始行值) 供 --verify 回验


def parse_check(expr):
    """把 "a+b=c" 解析成 (左侧列号列表, 右侧列号列表)，列号为 0 基。"""
    expr = expr.strip().replace(' ', '')
    m = _CK_RE.match(expr)
    if not m:
        raise ValueError("%%CK 写法无法识别：%r，正确写法形如 %%CK 2+3+4=5" % expr)
    def cols(s):
        out = []
        for tok in re.split(r'[+,]', s):
            if not tok:
                continue
            n = int(tok)
            if n < 1:
                raise ValueError("%%CK 列号从 1 起算，收到 %d" % n)
            out.append(n - 1)
        return out
    return cols(m.group(1)), cols(m.group(2))


def run_checks(rows, checks, table_label):
    """逐行校验列间等式与比例，返回问题描述列表（无问题则空列表）。

    checks 元素两种形态：
      ('sum',  expr, left_cols, right_cols)   —— 列和相等，%CK a+b=c
      ('rate', expr, a, b, c)                 —— a列/b列 取整百分数 == c列，%CKR a/b=c
    %CKR 专抓「动用率 × 总数 ≠ 动用数」一类行内矛盾
    （2026-09-21 增补：源件自报 44%×18 却填动用 10 即属此类）。
    """
    problems = []
    for chk in checks:
        if chk[0] == 'sum':
            expr, left, right = chk[1], chk[2], chk[3]
            ncol = max([c for c in left + right]) + 1
            for row in rows:
                if len(row) < ncol:
                    problems.append("%s：%%CK %s —— 行「%s」只有 %d 列，少于校验所需的 %d 列"
                                    % (table_label, expr, row[0] if row else '?',
                                       len(row), ncol))
                    continue
                lv = [_num(row[c]) if c < len(row) else None for c in left]
                rv = [_num(row[c]) if c < len(row) else None for c in right]
                if any(v is None for v in lv + rv):
                    continue          # 含「/」或空值，跳过该行的平衡校验
                if abs(sum(lv) - sum(rv)) > 1e-6:
                    problems.append(
                        "%s：%%CK %s 不平 —— 行「%s」 左侧 %s = %s，右侧 %s = %s，差 %s"
                        % (table_label, expr, row[0] if row else '?',
                           '+'.join(_fmt(v) for v in lv), _fmt(sum(lv)),
                           '+'.join(_fmt(v) for v in rv), _fmt(sum(rv)),
                           _fmt(sum(lv) - sum(rv))))
        else:  # rate
            _, expr, a, b, c = chk
            ncol = max(a, b, c) + 1
            for row in rows:
                if len(row) < ncol:
                    problems.append("%s：%%CKR %s —— 行「%s」只有 %d 列，少于校验所需的 %d 列"
                                    % (table_label, expr, row[0] if row else '?',
                                       len(row), ncol))
                    continue
                num, den, stated = (_num(row[a]), _num(row[b]),
                                    _pct_value(row[c]))
                if num is None or den is None or stated is None or den == 0:
                    continue          # 含「/」、空值或分母为 0，跳过
                expect = int((Decimal(str(num)) / Decimal(str(den)) * 100)
                             .quantize(Decimal('1'), rounding=ROUND_HALF_UP))
                if expect != stated:
                    problems.append(
                        "%s：%%CKR %s 不符 —— 行「%s」 %s/%s = %s%%，但表中填写 %s%%"
                        % (table_label, expr, row[0] if row else '?',
                           row[a], row[b], expect, stated))
    return problems


def _pct_value(cell_text):
    """把 '71%' / '71' / 0.71 解析成整数百分数 71；无法解析返回 None。"""
    if cell_text is None:
        return None
    t = str(cell_text).strip().replace('％', '%')
    if not t or t in ('/', '—', '-'):
        return None
    try:
        if t.endswith('%'):
            return int(Decimal(t[:-1].strip()).quantize(
                Decimal('1'), rounding=ROUND_HALF_UP))
        v = Decimal(t)
        # 无百分号的数若在 0~1 之间按小数比例理解，否则视为已乘 100
        if Decimal('-1') < v < Decimal('1'):
            return int((v * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
        return int(v.quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    except Exception:
        return None


def _ref(raw, idx0, cur, ncol):
    """取本合计行第 idx0 列（0 基）已经算出的**原始值**。

    只认已算出的结果。落到 None（该列无从计算）就照实返回 None，
    不退回原始数据行求和——被引列若是百分比列（"71%"），
    原始求和会得出 71 而不是 0.71，误差被静默放大百倍。
    """
    if idx0 >= cur:
        raise ValueError(
            "%%SUM 第 %d 列引用了第 %d 列，但第 %d 列还没算到。"
            "请把被引列写在引用列左侧。" % (cur + 1, idx0 + 1, idx0 + 1))
    if idx0 < 0 or idx0 >= ncol:
        raise ValueError("%%SUM 第 %d 列引用了第 %d 列，超出表格列数 %d。"
                         % (cur + 1, idx0 + 1, ncol))
    if idx0 >= len(raw):
        return None
    return raw[idx0]


def calc_total(data, spec):
    """按 %SUM 指令计算合计行的每一格。

    spec[0] 是行标签原样输出；其余为 SUM / RATE:a/b / ADD:a,b,... / --，
    列号从 1 起算。RATE 与 ADD 只能引用本行左侧已算出的列。

    列数不符的数据行直接报错，不静默丢弃——少列的行被跳过会让合计
    比实际小，且不会有任何提示。
    """
    ncol = len(spec)
    bad = [r for r in data if len(r) != ncol]
    if bad:
        raise ValueError(
            "合计行要求每行 %d 列，但有 %d 行列数不符（首行 %r）。"
            "请补齐全角分号或修正 %%S 表头列数。" % (ncol, len(bad), bad[0]))

    disp = [spec[0]]
    raw = [None]
    for i in range(1, ncol):
        cmd = spec[i].strip()
        if cmd == '--':
            raw.append(None)
            disp.append('—')
            continue
        if cmd == 'SUM':
            v = _col_sum(data, i)
            raw.append(v)
            disp.append(_fmt(v))
            continue
        m = _RATE_RE.match(cmd)
        if m:
            va = _ref(raw, int(m.group(1)) - 1, i, ncol)
            vb = _ref(raw, int(m.group(2)) - 1, i, ncol)
            if va is None or vb is None or vb == 0:
                raw.append(None)
                disp.append('/')
            else:
                v = va / vb * 100.0
                raw.append(v)
                disp.append(_pct(v))
            continue
        m = _ADD_RE.match(cmd)
        if m:
            vals = []
            for tok in m.group(1).split(','):
                if not tok:
                    continue
                v = _ref(raw, int(tok) - 1, i, ncol)
                if v is not None:
                    vals.append(v)
            v = sum(vals) if vals else None
            raw.append(v)
            disp.append(_fmt(v))
            continue
        # 其余内容原样当作单元格文本（如表的前两列写 placeholder 文字）。
        # 但若长得像拼错的指令，必须报错——照原样回填会让错误数字悄悄混进合计行。
        if re.match(r'^(SUM|RATE|ADD)\b', cmd):
            raise ValueError(
                "%%SUM 第 %d 列 %r 看着像拼错的指令，支持的写法只有 "
                "SUM、RATE:a/b、ADD:a,b、--。" % (i + 1, cmd))
        raw.append(None)
        disp.append(cmd)
        continue
    return disp


def add_table(doc, group_row, head_row, data, weights):
    """表头支持单行（group_row 为 None）与两行合并两种形态"""
    ncol = len(head_row)
    nhead = 1 if group_row is None else 2
    tbl = doc.add_table(rows=len(data) + nhead, cols=ncol)
    tbl.autofit = False
    _set_borders(tbl)

    text_w_tw = int((PAGE_W - MARGINS[2] - MARGINS[3]) / 2.54 * 1440)
    total = float(sum(weights))
    widths = [int(text_w_tw * w / total) for w in weights]
    widths[-1] = text_w_tw - sum(widths[:-1])

    for ci, w in enumerate(widths):
        for r in tbl.rows:
            r.cells[ci].width = Pt(w / 20.0)

    top = nhead - 1  # 数据起始行上方的表头最后一行索引

    if group_row is not None:
        ci = 0
        for spec in group_row:
            span, vm = 1, False
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

    for ci, spec in enumerate(head_row):
        cell = tbl.cell(top, ci)
        if group_row is not None and spec.strip() == '~':
            _vmerge(cell, None)
            _cell_text(cell, '')
            tcpr = cell._tc.find(qn('w:tcPr'))
            if tcpr is not None:
                extra = tcpr.findall(qn('w:vMerge'))[1:]
                for e in extra:
                    tcpr.remove(e)
        else:
            _cell_text(cell, spec)

    for ri, row in enumerate(data):
        for ci in range(ncol):
            _cell_text(tbl.cell(ri + nhead, ci), row[ci] if ci < len(row) else '')

    _mark_header_rows(tbl, nhead)
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

def build(content, out_path, strict=None):
    strict = STRICT_BALANCE if strict is None else strict
    doc = Document()
    s = doc.sections[0]
    s.page_width, s.page_height = Cm(PAGE_W), Cm(PAGE_H)
    s.top_margin, s.bottom_margin = Cm(MARGINS[0]), Cm(MARGINS[1])
    s.left_margin, s.right_margin = Cm(MARGINS[2]), Cm(MARGINS[3])
    s.header_distance, s.footer_distance = Cm(1.5), Cm(1.75)

    pending = None
    weights = None
    del BALANCE_REPORT[:]
    del TABLE_ROWS[:]

    for raw in content.split('\n'):
        line = raw.rstrip()
        if not line.strip():
            continue
        if line.startswith('#T '):
            add_par(doc, line[3:], SONG, 22, indent=0,
                    align='center', line=LINE_TITLE)
        elif line.startswith('#D '):
            add_par(doc, line[3:], HEI, 16, indent=0,
                    align='center', line=LINE_TITLE)
        elif line.startswith('#1 '):
            add_par(doc, line[3:], HEI, 16)
        elif line.startswith('#2 '):
            add_par(doc, line[3:], KAI, 16)
        elif line.startswith('%W '):
            weights = [float(x) for x in line[3:].split('；')]
        elif line.startswith('%G '):
            pending = {'g': line[3:].split('；'), 'h': None,
                       'data': [], 'rows': [], 'ck': []}
        elif line.startswith('%S '):
            if pending is None:
                pending = {'g': None, 'h': None, 'data': [], 'rows': [], 'ck': []}
            pending['h'] = line[3:].split('；')
        elif line.startswith('%CK '):
            if pending is None:
                pending = {'g': None, 'h': None, 'data': [], 'rows': [], 'ck': []}
            left, right = parse_check(line[4:])
            pending['ck'].append(('sum', line[4:].strip(), left, right))
        elif line.startswith('%CKR '):
            if pending is None:
                pending = {'g': None, 'h': None, 'data': [], 'rows': [], 'ck': []}
            m = _CKR_RE.match(line[5:].strip().replace(' ', ''))
            if not m:
                raise ValueError("%%CKR 写法无法识别：%r，正确写法形如 %%CKR 7/2=8"
                                 % line[5:].strip())
            a, b, c = (int(x) - 1 for x in m.groups())
            if min(a, b, c) < 0:
                raise ValueError("%%CKR 列号从 1 起算：%r" % line[5:].strip())
            pending['ck'].append(('rate', line[5:].strip(), a, b, c))
        elif line.startswith('%R '):
            if pending is not None:
                rowspec = line[3:].split('；')
                pending['data'].append(rowspec)
                pending['rows'].append(rowspec)
        elif line.startswith('%SUM '):
            if pending is not None:
                pending['data'].append(calc_total(pending['rows'],
                                                  line[5:].split('；')))
        elif line.startswith('%E'):
            if pending is not None and pending['h']:
                n = len(pending['h'])
                w = weights or [1.0] * n
                if len(w) != n:
                    w = [1.0] * n
                add_table(doc, pending['g'], pending['h'], pending['data'], w)
                BALANCE_REPORT.extend(
                    run_checks(pending['rows'], pending['ck'],
                               '第%d张表' % (len(doc.tables))))
                for r in pending['rows']:
                    TABLE_ROWS.append((len(doc.tables),
                                       (r[0] or '').strip(), list(r)))
                pending = None
                weights = None
        else:
            for chunk in smart_split(line):
                add_par(doc, chunk)

    if pending is not None and pending['h']:
        n = len(pending['h'])
        add_table(doc, pending['g'], pending['h'],
                  pending['data'], weights or [1.0] * n)
        BALANCE_REPORT.extend(
            run_checks(pending['rows'], pending['ck'], '第%d张表' % len(doc.tables)))

    add_page_number(doc)

    if BALANCE_REPORT:
        sys.stderr.write('\n【列间平衡校验】发现 %d 处不平：\n' % len(BALANCE_REPORT))
        for msg in BALANCE_REPORT:
            sys.stderr.write('  - %s\n' % msg)
        sys.stderr.write('\n')
        if strict:
            raise ValueError(
                '列间平衡校验未通过（%d 处），已中止生成。'
                '确认属源数据自身矛盾时可用 --allow-unbalanced 降级为告警。'
                % len(BALANCE_REPORT))

    doc.save(out_path)
    return out_path


# ---------- 源件回验（--verify）：专抓「提取/归位」环节抄错值 ----------

def load_verify_file(path):
    """每行：表序号|行名|值1；值2；...（值即源件对应行的原始值，从 1 号数据列起）。

    行名可用「；」串联多级前缀（如「长庆分院；XRF 元素仪」），
    依次匹配成稿行的第 1、2… 列，用于同单位多设备行的精确定位。
    """
    items = []
    with io.open(path, 'r', encoding='utf-8-sig') as f:
        for ln, line in enumerate(f, 1):
            s = line.strip()
            if not s or s.startswith('#'):
                continue
            parts = s.split('|')
            if len(parts) != 3:
                raise ValueError("回验文件第 %d 行格式错误（应为 表序号|行名|值1；值2…）：%s"
                                 % (ln, s))
            tno = int(parts[0].strip())
            name_parts = [x.strip() for x in parts[1].split('；')]
            vals = [v.strip() for v in parts[2].split('；')]
            items.append((tno, name_parts, vals, ln))
    return items


def _norm_cell(t):
    return str(t).strip().replace(' ', '').replace('\u3000', '').replace('％', '%')


def run_verify(items):
    """把回验清单与生成内容逐格比对，返回问题列表。"""
    problems = []
    index = {}
    for tno, name, vals in TABLE_ROWS:
        cells = [(c or '').strip() for c in vals]
        for k in range(1, len(cells) + 1):
            key = (tno, tuple(x.replace(' ', '').replace('\u3000', '')
                              for x in cells[:k]))
            index.setdefault(key, cells)
    for tno, name_parts, vals, ln in items:
        key = (tno, tuple(x.replace(' ', '').replace('\u3000', '')
                          for x in name_parts))
        row = index.get(key)
        if row is None:
            problems.append("回验：源件条目「表%d|%s」在成稿中找不到对应行（第 %d 行）"
                            % (tno, '；'.join(name_parts), ln))
            continue
        # 行名占前 len(name_parts) 列，源件值从其后的数据列起对齐
        off = len(name_parts)
        for i, v in enumerate(vals):
            pos = i + off
            got = _norm_cell(row[pos]) if pos < len(row) else ''
            want = _norm_cell(v)
            if got == want:
                continue
            # 数值等价：5600.0000 == 5600、100% == 100%
            try:
                if Decimal(want.rstrip('%')) == Decimal(got.rstrip('%')) \
                        and want.endswith('%') == got.endswith('%'):
                    continue
            except Exception:
                pass
            problems.append(
                "回验：表%d「%s」第 %d 列与源件不符 —— 源件 %r，成稿 %r"
                % (tno, '；'.join(name_parts), pos + 1, v,
                   row[pos] if pos < len(row) else ''))
    return problems


SELFCHECK_BLOCKS = """#T 地质研究院（录井工程分公司）生产运行日报
#D 2026年9月20日
#1 一、生产情况
#2 1.录井
今日院正施工井142口。
%W 3.7；2.2；2.2；2.2；2.3；2.3
%S 区域 项目；综合（口）；气测（口）；常规（口）；特殊（口）；合计（口）
%R 玛湖项目部；19；0；0；0；19
%R 吐哈分院；19；5；2；0；26
%CK 2+3+4+5=6
%SUM 录井总计；SUM；SUM；SUM；SUM；ADD:2,3,4,5
%E
#1 二、设备动态
#2 1.录井设备
%W 3.4；1.1；1.0；1.2；1.1；1.1；1.0；1.2；1.3；1.1；1.2
%G 油田区域^V；自营设备（台）^7；合作设备动用（台）^1；设备合计^2
%S ~；总数；正录；待录；待搬；等停；动用数；动用率；合作设备动用（台）；动用设备总数；自主施工占比
%R 玛湖项目部；41；19；7；3；12；29；71%；0；29；100%
%R 吐哈分院；43；20；4；6；13；30；70%；5；35；86%
%CK 7+9=10
%SUM 合计；SUM；SUM；SUM；SUM；SUM；SUM；RATE:7/2；SUM；ADD:7,9；RATE:7/10
%E
#1 三、工作安排
做好冬季生产运行保障工作。
"""


def selfcheck():
    import os
    import tempfile
    from docx import Document
    from docx.shared import Emu

    out = os.path.join(tempfile.gettempdir(), 'daily_selfcheck.docx')
    build(SELFCHECK_BLOCKS, out, strict=False)
    d = Document(out)

    def cm(v):
        return round(Emu(int(v)).cm, 2)

    s = d.sections[0]
    checks = [
        ('纸张 A4', (cm(s.page_width), cm(s.page_height)) == (21.0, 29.7)),
        ('页边距 3.7/3.5/2.8/2.6',
         (cm(s.top_margin), cm(s.bottom_margin),
          cm(s.left_margin), cm(s.right_margin)) == (3.7, 3.5, 2.8, 2.6)),
        ('表格数 = 2', len(d.tables) == 2),
    ]
    bold_cnt = 0
    for p in d.paragraphs:
        for r in p.runs:
            if r.font.bold:
                bold_cnt += 1
    checks.append(('全文无加粗', bold_cnt == 0))

    t1 = d.tables[0]
    r_total = [c.text for c in t1.rows[-1].cells]
    checks.append(('单行表头合计行 = 5 列', len(r_total) == 6))
    checks.append(('合计自动相加 19+19=38', r_total[1] == '38'))
    checks.append(('合计自动相加 0+5=5', r_total[2] == '5'))
    checks.append(('ADD 多列生效 38+5+2+0=45', r_total[5] == '45'))

    t2 = d.tables[1]
    checks.append(('两行合并表头', len(t2.rows[0].cells) >= 1))
    sums = [c.text for c in t2.rows[-1].cells]
    checks.append(('合计 总数 41+43=84', sums[1] == '84'))
    checks.append(('合计 正录 19+20=39', sums[2] == '39'))
    checks.append(('RATE 动用率 (29+30)/84=70%', sums[7] == '70%'))
    checks.append(('合计 合作设备 0+5=5', sums[8] == '5'))
    checks.append(('ADD 引用同行已算列 59+5=64', sums[9] == '64'))
    checks.append(('RATE 引用同行已算列 59/64=92%', sums[10] == '92%'))

    left, right = parse_check('2+3+4+5=6')
    ok_rows = [['甲', '1', '2', '3', '4', '10'], ['乙', '0', '0', '0', '0', '0']]
    checks.append(('列间校验：平衡的行不报错',
                   run_checks(ok_rows, [('sum', '2+3+4+5=6', left, right)], 'T') == []))
    bad_rows = [['丙', '1', '2', '3', '4', '9']]
    p = run_checks(bad_rows, [('sum', '2+3+4+5=6', left, right)], 'T')
    checks.append(('列间校验：不平的行能抓到', len(p) == 1 and '丙' in p[0]))
    skip_rows = [['丁', '1', '/', '3', '4', '9']]
    checks.append(('列间校验：含"/"的行跳过不误报',
                   run_checks(skip_rows, [('sum', '2+3+4+5=6', left, right)], 'T') == []))

    # %CKR 比例校验（2026-09-21 增补）
    rate_rows = [['玛湖', '41', '29', '71%'], ['西南', '18', '10', '44%'],
                 ['海外', '3', '3', '100%'], ['空值', '3', '/', '/']]
    p = run_checks(rate_rows, [('rate', '3/2=4', 2, 1, 3)], 'T')
    checks.append(('比例校验：29/41=71% 与 3/3=100% 不误报，含"/"跳过',
                   all('玛湖' not in x and '海外' not in x and '空值' not in x
                       for x in p)))
    checks.append(('比例校验：西南 10/18=56%≠44% 被抓到',
                   len(p) == 1 and '西南' in p[0] and '56' in p[0]))
    checks.append(('比例解析 _pct_value 84.6%', _pct_value('84.6%') == 85))
    checks.append(('比例解析 _pct_value 空/斜杠为 None', _pct_value('/') is None))

    # --verify 源件回验
    del TABLE_ROWS[:]
    TABLE_ROWS.extend([
        (2, '海外', ['海外', '3', '3', '0', '0', '0', '3', '100%', '0', '3', '100%']),
        (2, '玛湖项目部', ['玛湖项目部', '41', '19', '7', '3', '12', '29', '71%', '0', '29', '100%']),
    ])
    p = run_verify([(2, ['海外'], ['3', '3', '0', '0', '0', '3', '100%', '0', '3', '100%'], 1)])
    checks.append(('源件回验：一致的行不报错', p == []))
    p = run_verify([(2, ['海外'], ['3', '0', '0', '0', '3', '0', '0%', '0', '0', '/'], 1),
                    (2, ['不存在行'], ['1', '2'], 2)])
    checks.append(('源件回验：抄错值与缺失行都能抓到',
                   len(p) == 7 and any('不存在行' in x for x in p)))
    del TABLE_ROWS[:]
    TABLE_ROWS.extend([(4, '长庆分院', ['长庆分院', 'XRF 元素仪', '2', '0', '2', '0', '0', '0'])])
    p = run_verify([(4, ['长庆分院', 'XRF 元素仪'], ['2', '0', '2', '0', '0', '0'], 1),
                    (4, ['长庆分院', 'XRD 矿物仪'], ['2', '2', '0', '0', '0', '0'], 2)])
    checks.append(('源件回验：多级行名可定位同单位多设备行',
                   len(p) == 1 and 'XRD' in p[0]))

    try:
        calc_total([['甲', '1'], ['乙', '1', '2']], ['合计', 'SUM', 'SUM'])
        checks.append(('列数不符的数据行会被拦截', False))
    except ValueError:
        checks.append(('列数不符的数据行会被拦截', True))
    try:
        calc_total([['甲', '1', '71%']], ['合计', 'SUM', 'RATE:2/3'])
        checks.append(('RATE 前向引用会被拦截', False))
    except ValueError:
        checks.append(('RATE 前向引用会被拦截', True))
    checks.append(('四舍五入 2.5 -> 3（非 banker\'s）', _fmt(2.5, 0) == '3'))
    checks.append(('四舍五入 百分比 70.5 -> 71%', _pct(70.5) == '71%'))
    checks.append(('空值列为 None 而非 0', _col_sum([['甲', '/']], 1) is None))

    print('自检：' + out)
    ok = True
    for name, passed in checks:
        print('  %s %s' % ('OK  ' if passed else 'FAIL', name))
        ok = ok and passed
    print('结论：%s' % ('全部通过' if ok else '存在未通过项'))
    return 0 if ok else 1


def list_blocks():
    print('内容标记一览：')
    print('  #T   文档标题（方正小标宋简体 二号 居中）')
    print('  #D   日期行（方正黑体简体 三号 居中）')
    print('  #1   一级标题（方正黑体简体 三号）')
    print('  #2   二级标题（方正楷体简体 三号）')
    print('  其余  正文（方正仿宋简体 三号，超长自动拆段）')
    print('  %W   列宽权重')
    print('  %G   分组表头（^N 横向合并，^V 纵向合并起点）')
    print('  %S   子表头（~ 承接上方纵向合并）')
    print('  %R   数据行')
    print('  %SUM 合计行：SUM / RATE:a/b / ADD:a,b / --')
    print('  %CK  行内列间等式校验：a+b=c（列号从 1 起）')
    print('  %CKR 行内比例校验：a/b=c（c 为百分数列，抓"率×总数≠量"类矛盾）')
    print('  %E   表格结束')
    print('  （CLI）--verify 源件回验清单：表序号|行名|值1；值2… 逐格比对源件')
    return 0


def _main(argv):
    args = list(argv)
    if not args:
        sys.stderr.write(__doc__ or '')
        return 2
    if args[0] == '--selfcheck':
        return selfcheck()
    if args[0] == '--list':
        return list_blocks()

    strict = True
    verify_path = None
    allow_src_diff = False
    paths = []
    i = 0
    while i < len(args):
        a = args[i]
        if a == '--allow-unbalanced':
            strict = False
        elif a == '--allow-src-diff':
            allow_src_diff = True
        elif a == '--verify':
            i += 1
            if i >= len(args):
                sys.stderr.write('--verify 需要跟一个清单文件路径\n')
                return 2
            verify_path = args[i]
        else:
            paths.append(a)
        i += 1
    if len(paths) < 2:
        sys.stderr.write('用法：python build_daily.py <内容标记文件> <输出.docx> '
                         '[--allow-unbalanced] [--verify 回验清单] '
                         '[--allow-src-diff]\n')
        return 2

    with io.open(paths[0], encoding='utf-8') as f:
        content = f.read()
    try:
        build(content, paths[1], strict=strict)
    except ValueError as e:
        sys.stderr.write('生成中止：%s\n' % e)
        return 3

    print('已生成：%s' % paths[1])
    if BALANCE_REPORT:
        print('列间/比例校验：发现 %d 处不平（已降级为告警）：' % len(BALANCE_REPORT))
        for m in BALANCE_REPORT:
            print('  - %s' % m)
    else:
        print('列间/比例校验：全部通过')

    if verify_path:
        try:
            items = load_verify_file(verify_path)
        except Exception as e:
            sys.stderr.write('回验清单读取失败：%s\n' % e)
            return 2
        diffs = run_verify(items)
        if diffs:
            print('源件回验：发现 %d 处与源件不符：' % len(diffs))
            for m in diffs:
                print('  - %s' % m)
            if not allow_src_diff:
                sys.stderr.write('源件回验未通过（%d 处）。确认属"源件有误已按规则修正"'
                                 '的情况，请把修正逐条记入校核清单后用 '
                                 '--allow-src-diff 放行。\n' % len(diffs))
                return 4
        else:
            print('源件回验：全部一致（%d 条）' % len(items))
    return 0


if __name__ == '__main__':
    sys.exit(_main(sys.argv[1:]))
