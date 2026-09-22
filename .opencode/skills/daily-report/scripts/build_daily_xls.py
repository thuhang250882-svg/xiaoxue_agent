#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
build_daily_xls.py —— 由基层填报系统导出的《日报.xls》生成三张院级汇报表。

用法
----
    python build_daily_xls.py --src 日报.xls [--outdir 目录] [选项]
    python build_daily_xls.py --selfcheck

产出（文件名日期取自日报数据日期）
----
    地质研究院生产市场动态表YYYY-MM-DD.xls
    地质研究院综合日报YYYY-MM-DD.xls
    地质研究院生产日报YYYY-MM-DD.xls

依赖：xlrd（读 .xls）、xlwt（写 .xls）。见 skill-dependencies.json。

==============================================================================
口径假设清单（源文件未明示、需人工确认的部分，均可由命令行调整）
==============================================================================
【假设1】报告日期 = 日报表内的「数据日期」+ OFFSET_DAYS，默认 0（同日）。
         历史样例为 +1 天（源 2026-09-11 → 成品 2026-09-12）。
         用 --date-offset 1 复刻历史命名，或 --report-date 直接指定。

【假设2】「进尺」口径 = 源文件的「当日井深(m)」按井求和。
         源文件没有独立的「进尺」字段，当日井深是该井截至当日的最深井深，
         作为累计进尺使用是唯一可得口径。若实际需要「日进尺」（当日增量），
         源文件不提供昨日井深，无法计算，需另给数据源。

【假设3】「未录井」判定 = 「当日井深(m)」为空（该井尚未产生进尺，即未开始录井）。
         「已完井」判定 = 「完井日期」非空 且「施工状态」命中 完井作业/修井
         （DONE_STATUS_KEYWORDS，2026-09-21 业务确认口径，mode=semantic）。
         完井日期与施工状态不匹配的井（固井候凝却填了完井日期、四开却填了
         完井日期、状态完井作业却无日期等）保留入表，登记入 SUSPECT_WELLS，
         在处理报告中单列「疑似状态矛盾井复核清单」交人工确认。

【假设4】历史复刻口径（mode=history，默认）无法用纯字段规则还原：
         已穷举源字段的全部 1~3 元 AND 组合，均无法精确复现历史剔除的 4 口井。
         其中 3 口（佳31-3/太资4X/李庄2-22）可由「当日井深为空」命中，
         第 4 口 ZJHW1313 无字段特征，判定含人工成分，故以显式清单兜底。
         详见 WELL_EXCLUDE_OVERRIDE 常量处的注释。

【假设5】「录井系列」是复合字段（如"综合+地质导向+液面监测"）。
         统计时按 SERIES_SPLIT_CHARS 拆分后按分项计数，
         因此分项之和 ≥ 井数（一口井可同时计入多个系列）。这是预期行为。

【假设6】系列名称归一：源数据里「综合录井」与「综合」并存、
         「池体积检测」与「池体积监测」并存，按 SERIES_ALIAS 归一为同一项。
         若贵院认为二者不同，改 SERIES_ALIAS 即可。

【假设7】井别 → 探井/开发井 的归并见 WELL_TYPE_MAP。
         源文件井别有 14 种取值，归并规则为业务口径推定，需由对口业务科室确认。

【假设8】队伍总数（队伍数（支））源文件无此字段——源表只含当日有井的队伍。
         故「未动用数」「年累完成天」无法计算，本生成器不虚构，
         相关列留空并批注；可用 --roster 花名册.csv 补齐队伍总数。

【假设9】服务油田行成年ikes当日实际出现地区生成，而非历史样例那样的固定骨架。
         历史样例含当日无井的地区（如苏里格油田、河南平顶山等）留空行，
         如需固定骨架，用 --oilfield-list 提供完整清单。
"""

from __future__ import print_function

import argparse
import datetime
import io
import os
import re
import shutil
import sys
import tempfile
from collections import OrderedDict, defaultdict
from decimal import Decimal, ROUND_HALF_UP

try:
    import xlrd
except ImportError:
    sys.stderr.write("随包运行时缺少 xlrd，请重启录井小雪并核对安装包资源\n")
    raise

try:
    import xlwt
except ImportError:
    sys.stderr.write("随包运行时缺少 xlwt，请重启录井小雪并核对安装包资源\n")
    raise


# ============================================================================
# 一、源文件结构常量（来自对《日报.xls》的实测）
# ============================================================================

SHEET_INDEX = 0
TITLE_ROW = 0          # 第 1 行：标题（原为"日报"）
DATE_ROW = 1           # 第 2 行："日期:YYYY-MM-DD"
HEADER_ROW = 2         # 第 3 行：表头
DATA_START_ROW = 3     # 第 4 行起：数据

COL = OrderedDict([
    ("地区", 0), ("甲方单位", 1), ("井号", 2), ("井别", 3), ("设计井深", 4),
    ("区块", 5), ("施工单位", 6), ("施工队号", 7), ("当日井深", 8),
    ("施工状态", 9), ("工程地质简况", 10), ("录井单位", 11), ("录井分公司", 12),
    ("录井仪器型号", 13), ("录井队号", 14), ("录井系列", 15), ("目前层位", 16),
    ("开钻日期", 17), ("开始录井时间", 18), ("开始录井井深", 19),
    ("完钻井深", 20), ("完钻日期", 21), ("固井日期", 22), ("完井日期", 23),
    ("DWTYPE", 24), ("联系电话", 25),
])

DATE_RE = re.compile(r"(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})")

SRC_TITLE_TEXT = "日报"
OUT_TITLE_PROD = "地质研究院生产日报"
OUT_TITLE_SUMMARY = "地质研究院综合日报"
OUT_TITLE_MARKET = "地质研究院生产市场动态表"

FILE_TPL = {
    "market": "地质研究院生产市场动态表%s.xls",
    "summary": "地质研究院综合日报%s.xls",
    "production": "地质研究院生产日报%s.xls",
}


# ============================================================================
# 二、可调口径常量
# ============================================================================

# 【假设1】成品日期相对数据日期的偏移。历史样例为 +1。
OFFSET_DAYS = 0

# 【假设5】录井系列的分隔符
SERIES_SPLIT = re.compile(r"[、+＋,，/]|和")

# 【假设6】系列名称归一表
SERIES_ALIAS = {
    "综合录井": "综合",
    "池体积检测": "池体积监测",
}

# 动态表/综合日报里作为独立列出现的系列；其余归入「其他」
SERIES_ORDER = [
    "综合", "气测", "地质", "地质导向", "液面监测", "地化",
    "元素录井", "常规", "一般", "池体积监测", "EISC",
]
OTHER_SERIES = "其他"

# 【假设7】井别 → 大类归并
EXPLORE_TYPES = {  # 探井类
    "探井", "预探井", "风险探井", "资料井", "评价井", "风险井",
}
DEVELOP_TYPES = {  # 开发井类
    "开发井", "采油井", "采气井", "注水井", "注气井", "生产井",
    "开发试验井", "矿场井",
}

WELL_TYPE_MAP = {}
for _t in EXPLORE_TYPES:
    WELL_TYPE_MAP[_t] = "探井"
for _t in DEVELOP_TYPES:
    WELL_TYPE_MAP[_t] = "开发井"

# 自营/合作归一（源字段 DWTYPE）
OWNERSHIP_MAP = {"自营": "自营", "合作": "合作"}

# 【假设4】mode=history 时用source复刻历史结果所需的显式剔除清单。
# 来源：与历史成稿《地质研究院生产日报2026-09-12.xls》逐行比对得到，
#       源文件 152 行 → 历史成品 148 行，剔除 4 行。
#       其中 3 行可由「当日井深为空」规则命中，第 4 行无法由任何字段规则还原。
WELL_EXCLUDE_OVERRIDE = [
    # 井号,       剔除原因
    ("ZJHW1313", "历史口径人工判定：已钻达完钻井深(5171m)且录井单位为外部单位"
                 "(新疆广陆能源科技股份有限公司)，源字段无唯一判据，以清单兜底"),
]


# ============================================================================
# 三、工具函数
# ============================================================================

def log(msg=""):
    print(msg)


def parse_date(text):
    """从形如 '日期:2026-09-11' 的文本里解析日期。"""
    m = DATE_RE.search(text or "")
    if not m:
        return None
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    try:
        return datetime.date(y, mo, d)
    except ValueError:
        return None


def to_text(v, dm=None):
    """把单元格值转成与源文件完全一致的字符串（源文件全部以文本存储）。"""
    if v is None:
        return ""
    return str(v).strip()


NUM_FAILS = []          # 记录「有值但转不成数字」的单元格，避免静默当 0


def num_of(s, where=""):
    """字符串转数值，失败返回 None 并登记。

    调用方若写成 `num_of(x) or 0.0`，当 x 是 "0" 或解析失败时结果都是 0.0，
    会把「数据有问题」和「数据本来就是 0」混为一谈。这里把失败登记下来，
    由主流程汇总告警。
    """
    s = (s or "").strip()
    if not s:
        return None
    try:
        return float(s.replace(',', ''))
    except ValueError:
        NUM_FAILS.append((where, s))
        return None


def fmt_num(v, nd=2):
    """数值格式化：整数不带小数点，其余最多 nd 位小数，四舍五入向上进位。"""
    if v is None:
        return ""
    if abs(v - round(v)) < 1e-9:
        return str(int(round(v)))
    q = Decimal(repr(v)).quantize(Decimal(1).scaleb(-nd),
                                  rounding=ROUND_HALF_UP)
    s = '%.*f' % (nd, float(q))
    return s.rstrip('0').rstrip('.') or '0'


def split_series(s):
    """【假设5】拆分复合的录井系列字段，返回归一化后的系列列表。"""
    out = []
    for tok in SERIES_SPLIT.split(s or ""):
        tok = tok.strip()
        if not tok:
            continue
        tok = SERIES_ALIAS.get(tok, tok)
        if tok not in out:
            out.append(tok)
    return out


# ============================================================================
# 四、读源文件
# ============================================================================

class Source(object):
    """日报表源文件读取结果。"""

    def __init__(self, path):
        if not os.path.isfile(path):
            raise IOError("源文件不存在: %s" % path)
        self.path = os.path.abspath(path)
        # formatting_info=True 才能拿到 XF 样式，用于成品保格式的式样
        try:
            self.book = xlrd.open_workbook(self.path, formatting_info=True)
            self.has_format = True
        except Exception:
            self.book = xlrd.open_workbook(self.path)
            self.has_format = False
        self.sheet = self.book.sheet_by_index(SHEET_INDEX)
        self.header = [to_text(self.sheet.cell_value(HEADER_ROW, c))
                       for c in range(self.sheet.ncols)]
        self.raw_rows = []
        for r in range(DATA_START_ROW, self.sheet.nrows):
            vals = []
            for c in range(self.sheet.ncols):
                t = self.sheet.cell_type(r, c)
                v = self.sheet.cell_value(r, c)
                if t == xlrd.XL_CELL_DATE:
                    try:
                        v = xlrd.xldate_as_datetime(v, self.book.datemode).strftime("%Y-%m-%d")
                    except Exception:
                        pass
                vals.append(to_text(v))
            # 跳过整行全空的行
            if any(v for v in vals):
                self.raw_rows.append({"src_row": r, "vals": vals})
        self.data_date = parse_date(to_text(self.sheet.cell_value(DATE_ROW, 0)))

        # 列索引：按表头名定位，找不到再退回固定列序并留下告警。
        # 源表实际表头是「当日井深(m)」，而 COL 里写的是「当日井深」，
        # 早期版本靠"位置恰好相同"侥幸通过——导出模板一旦调整列序就会
        # 静默取错列，且合计仍然"看起来对"。这里改为显式解析 + 告警。
        self.col_warn = []
        self.col = {}
        for name, idx in COL.items():
            self.col[name] = self._locate(name, idx)

    @staticmethod
    def _norm(h):
        """去掉表头里的括号单位与空格：「当日井深(m)」→「当日井深」。"""
        return re.sub(r'[（(][^）)]*[）)]', '', (h or '')).strip()

    def _locate(self, name, fallback_idx):
        for i, h in enumerate(self.header):
            if h == name:
                return i
        key = self._norm(name)
        for i, h in enumerate(self.header):
            if self._norm(h) == key:
                return i
        hits = [i for i, h in enumerate(self.header)
                if key and (key in self._norm(h) or self._norm(h) in key)]
        if len(hits) >= 1:
            self.col_warn.append(
                "「%s」未精确匹配表头，按包含规则定位到第 %d 列「%s」"
                % (name, hits[0] + 1, self.header[hits[0]]))
            return hits[0]
        self.col_warn.append(
            "源表表头缺少「%s」，已退回固定列序第 %d 列「%s」；"
            "请核对，否则会取错数据" % (name, fallback_idx + 1,
                                 self.header[fallback_idx]
                                 if fallback_idx < len(self.header) else '?'))
        return fallback_idx

    def cell(self, row, name):
        i = self.col.get(name, COL.get(name))
        vals = row["vals"]
        return vals[i] if i is not None and i < len(vals) else ""

    @property
    def ncols(self):
        return len(self.header)

    @property
    def nrows(self):
        """有效数据行数（不含标题/日期/表头）。"""
        return len(self.raw_rows)


# ============================================================================
# 五、样式：把源文件的 XF 忠实翻译成 xlwt 样式
# ============================================================================

def make_style(source, xf_index):
    """把源文件的第 xf_index 个 XF 翻译成 xlwt.XFStyle。

    源文件只用了 5 种左右的 XF（标题/日期/表头/正文/空），
    逐个翻译即可做到成品与源件外观一致，而不是另造一套。
    """
    if not source.has_format:
        return xlwt.XFStyle()
    try:
        xf = source.book.xf_list[xf_index]
    except Exception:
        return xlwt.XFStyle()

    st = xlwt.XFStyle()

    # 字体
    try:
        f = source.book.font_list[xf.font_index]
        fo = xlwt.Font()
        fo.name = f.name
        fo.height = f.height
        fo.bold = bool(f.bold)
        fo.italic = bool(f.italic)
        fo.underline = getattr(f, "underline_type", 0)
        fo.colour_index = f.colour_index
        st.font = fo
    except Exception:
        pass

    # 对齐
    try:
        al = xf.alignment
        a = xlwt.Alignment()
        a.horz = getattr(al, "hor_align", 0)
        a.vert = getattr(al, "vert_align", 0)
        a.wrap = getattr(al, "text_wrapped", 0)
        st.alignment = a
    except Exception:
        pass

    # 边框
    try:
        b = xf.border
        bo = xlwt.Borders()
        bo.left = getattr(b, "left_line_style", 0)
        bo.right = getattr(b, "right_line_style", 0)
        bo.top = getattr(b, "top_line_style", 0)
        bo.bottom = getattr(b, "bottom_line_style", 0)
        bo.left_colour = getattr(b, "left_colour_index", 0x40)
        bo.right_colour = getattr(b, "right_colour_index", 0x40)
        bo.top_colour = getattr(b, "top_colour_index", 0x40)
        bo.bottom_colour = getattr(b, "bottom_colour_index", 0x40)
        st.borders = bo
    except Exception:
        pass

    return st


def source_cell_style(source, r, c):
    """取源文件某个单元格的样式。"""
    if not source.has_format:
        return xlwt.XFStyle()
    try:
        return make_style(source, source.sheet.cell_xf_index(r, c))
    except Exception:
        return xlwt.XFStyle()


# 表体通用样式（汇总类报表自造，与院报观感一致）
def body_style(bold=False, border=True, horz=2, vert=1, wrap=False, size=10, color=None):
    st = xlwt.XFStyle()
    f = xlwt.Font()
    f.name = "宋体"
    f.height = size * 20
    f.bold = 1 if bold else 0
    st.font = f
    a = xlwt.Alignment()
    a.horz = horz      # 0=常规 1=左 2=居中 3=右
    a.vert = vert      # 1=居中
    a.wrap = 1 if wrap else 0
    st.alignment = a
    if border:
        b = xlwt.Borders()
        b.left = b.right = b.top = b.bottom = 1  # 细实线
        st.borders = b
    if color is not None:
        p = xlwt.Pattern()
        p.pattern = 1
        p.pattern_fore_colour = color
        st.pattern = p
    return st


HEADER_FILL = 22      # 浅灰
TOTAL_FILL = 0x2A     # 淡黄（合计行）
NOTE_COLOR = 0x3A     # 批注底色

ST_HDR_GROUP = body_style(bold=True, horz=2, vert=1, wrap=True, size=11, color=HEADER_FILL)
ST_HDR_SUB = body_style(bold=True, horz=2, vert=1, wrap=True, size=10, color=HEADER_FILL)
ST_BODY = body_style(horz=2, vert=1)
ST_BODY_L = body_style(horz=1, vert=1)
ST_TOTAL = body_style(bold=True, horz=2, vert=1, color=TOTAL_FILL)
ST_TOTAL_L = body_style(bold=True, horz=1, vert=1, color=TOTAL_FILL)
ST_NOTE = body_style(horz=1, vert=1, wrap=True, size=9)
ST_TITLE = None       # 延迟构造（需字号20）


def title_style(source=None):
    """标题样式：优先沿用源文件标题样式，否则按院报规格构造。"""
    if source is not None and source.has_format:
        try:
            return source_cell_style(source, TITLE_ROW, 0)
        except Exception:
            pass
    st = xlwt.XFStyle()
    f = xlwt.Font()
    f.name = "宋体"
    f.height = 20 * 20
    f.bold = True
    st.font = f
    a = xlwt.Alignment()
    a.horz = 2
    a.vert = 1
    st.alignment = a
    return st


def date_style(source=None):
    if source is not None and source.has_format:
        try:
            return source_cell_style(source, DATE_ROW, 0)
        except Exception:
            pass
    return body_style(horz=1, vert=1, size=10)


# ============================================================================
# 六、筛选逻辑
# ============================================================================

DATE_FUTURE = []        # 晚于报告日的日期（填报笔误或口径差异）
SUSPECT_WELLS = []      # 疑似现场状态填写错误/矛盾的井（保留入表，单独列清单供人工复核）

# 「已完井」的状态白名单：完井日期非空 且 施工状态命中其中之一 → 剔除。
# 2026-09-21 与业务确认的口径（替代旧的"完井日期非空即剔"）：
# 固井候凝、四开等状态下填了完井日期的井视为填报疑点，保留入表并挂清单。
DONE_STATUS_KEYWORDS = ("完井作业", "修井")


def status_is_done(status):
    """施工状态是否命中「完井作业/修井」白名单（子串匹配，状态栏常多词并存）。"""
    s = (status or "").strip()
    return any(k in s for k in DONE_STATUS_KEYWORDS)


def _as_date(s):
    """把 '2026-09-11' / '2026/9/11' / '2026年9月11日' 统一解析为 date。"""
    m = DATE_RE.search(s or "")
    if not m:
        return None
    try:
        return datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def classify(source, row, mode="history", report_date=None):
    """判断某行是否应剔除，返回 None（保留）或 剔除原因。

    时间边界取「闭区间」：完井日期 <= 报告日 算已完井；
    晚于报告日的按未来日期处理，保留不剔——那更可能是填报笔误，
    剔除会把在录井悄悄抹掉，保留则至少还能被 DATE_FUTURE 列出来。

    semantic 口径（2026-09-21 业务确认版）：
      剔除 = 当日井深为空（未录井）
             或（完井日期非空 且 施工状态命中 完井作业/修井）。
      完井日期非空但状态不符、或状态已到完井作业/修井但日期为空的井，
      一律保留入表并登记 SUSPECT_WELLS，由复核清单交人工确认。
    """
    well = source.cell(row, "井号")
    depth = source.cell(row, "当日井深")
    done_txt = source.cell(row, "完井日期")
    status = source.cell(row, "施工状态")

    if mode == "none":
        return None

    if mode == "semantic":
        if not depth:
            return "未录井（当日井深为空，尚未产生进尺）"

        def _suspect(note):
            SUSPECT_WELLS.append({
                "well": well, "status": status, "done": done_txt,
                "depth": depth, "note": note, "src_row": row["src_row"] + 1})
            return None  # 疑点井保留入表

        if not done_txt:
            if status_is_done(status):
                return _suspect("施工状态为「%s」但完井日期为空——日期疑漏填" % status)
            return None
        d = _as_date(done_txt)
        if d is None:
            if status_is_done(status):
                return "已完井（施工状态「%s」，完井日期 %r 无法解析）" % (status, done_txt)
            return _suspect("完井日期 %r 无法解析为日期" % done_txt)
        if report_date is not None and d > report_date:
            DATE_FUTURE.append((well, "完井日期", done_txt))
            return None
        if status_is_done(status):
            return "已完井（完井日期 %s ≤ 报告日 %s，施工状态「%s」）" % (
                done_txt, report_date, status)
        return _suspect(
            "完井日期 %s 非空但施工状态为「%s」——状态与完井日期矛盾" % (done_txt, status))

    # mode == history【假设4】
    if not depth:
        return "未录井（当日井深为空）"
    d = _as_date(done_txt)
    if d is not None and report_date is not None and d > report_date:
        DATE_FUTURE.append((well, "完井日期", done_txt))
    for w, reason in WELL_EXCLUDE_OVERRIDE:
        if well == w:
            return reason
    return None


def load_exclude_file(path):
    """外部剔除清单：每行一个井号或施工状态关键字。"""
    items = []
    with io.open(path, "r", encoding="utf-8-sig") as f:
        for line in f:
            s = line.strip()
            if s and not s.startswith("#"):
                items.append(s)
    return items


def filter_rows(source, mode, exclude_items=None, extra_wells=None,
                report_date=None):
    kept, dropped = [], []
    for row in source.raw_rows:
        reason = classify(source, row, mode, report_date)
        well = source.cell(row, "井号")
        status = source.cell(row, "施工状态")
        if reason is None and exclude_items:
            if well in exclude_items or status in exclude_items:
                reason = "外部剔除清单命中"
        if reason is None and extra_wells and well in extra_wells:
            reason = "命令行 --exclude-well 指定"
        if reason is None:
            kept.append(row)
        else:
            dropped.append((row, reason))
    return kept, dropped


# ============================================================================
# 七、报表甲：地质研究院生产日报（原表剔除后全字段保留）
# ============================================================================

def build_production(source, kept, path, report_date, title_date_style=None):
    """原表头、原表值、原格式照搬，仅剔除不合格井并换标题。"""
    wb = xlwt.Workbook(encoding="utf-8")
    ws = wb.add_sheet("日报")

    ncol = source.ncols
    ts = title_style(source)
    ds = date_style(source)

    # 标题行
    ws.merge(0, 0, 0, max(ncol - 1, 1))
    ws.write(0, 0, OUT_TITLE_PROD, ts)
    ws.row(0).height_mismatch = True
    ws.row(0).height = 30 * 20

    # 日期行
    ws.merge(1, 1, 0, max(ncol - 1, 1))
    ws.write(1, 0, "日期:%s" % report_date, ds)
    ws.row(1).height_mismatch = True
    ws.row(1).height = 16 * 20

    # 表头行：沿用源文件表头单元格样式
    for c, name in enumerate(source.header):
        ws.write(2, c, name, source_cell_style(source, HEADER_ROW, c))
    ws.row(2).height_mismatch = True
    ws.row(2).height = 22 * 20

    # 数据行：逐格沿用源单元格样式
    for i, row in enumerate(kept):
        r_out = DATA_START_ROW + i
        r_src = row["src_row"]
        for c in range(ncol):
            ws.write(r_out, c, row["vals"][c],
                     source_cell_style(source, r_src, c))

    # 列宽沿用源文件
    if source.has_format:
        sh = source.sheet
        for c in range(ncol):
            ci = sh.colinfo_map.get(c)
            if ci is not None:
                # xlrd 宽度单位是 1/256 字符宽，xlwt 也是同样的 1/256
                ws.col(c).width = int(ci.width)

    ws.set_panes_frozen(True)
    ws.set_horz_split_pos(DATA_START_ROW)
    ws.set_vert_split_pos(3)

    wb.save(path)
    return len(kept)


# ============================================================================
# 八、报表乙：地质研究院综合日报（按业务科室/系列 汇总井数与进尺）
# ============================================================================

def build_summary(source, kept, path, report_date, series_cols=None):
    """按「录井分公司」×「录井系列」汇总井数、进尺，并按探井/开发井、自营/合作分列。"""
    series_cols = series_cols or SERIES_ORDER

    # 按科室聚合
    agg = OrderedDict()
    overall = defaultdict(lambda: defaultdict(float))
    all_series_seen = []

    def bucket_for(unit):
        if unit not in agg:
            agg[unit] = {
                "count": 0, "depth": 0.0, "explore": 0, "develop": 0,
                "own": 0, "coop": 0, "series": defaultdict(int),
                "teams": set(),
            }
        return agg[unit]

    total = {
        "count": 0, "depth": 0.0, "explore": 0, "develop": 0,
        "own": 0, "coop": 0, "series": defaultdict(int), "teams": set(),
    }

    for row in kept:
        unit = source.cell(row, "录井分公司") or "(未填)"
        b = bucket_for(unit)
        wtype = source.cell(row, "井别")
        big = WELL_TYPE_MAP.get(wtype)
        owner = OWNERSHIP_MAP.get(source.cell(row, "DWTYPE"), "")
        depth = num_of(source.cell(row, "当日井深")) or 0.0
        team = source.cell(row, "录井队号")

        for target in (b, total):
            target["count"] += 1
            target["depth"] += depth
            if big == "探井":
                target["explore"] += 1
            elif big == "开发井":
                target["develop"] += 1
            if owner == "自营":
                target["own"] += 1
            elif owner == "合作":
                target["coop"] += 1
            if team:
                target["teams"].add(team)
            for s in split_series(source.cell(row, "录井系列")):
                target["series"][s] += 1
                if s not in all_series_seen:
                    all_series_seen.append(s)

    # 未在预设列表里的系列并入「其他」
    def series_value(d, s):
        if s == OTHER_SERIES:
            return sum(v for k, v in d.items() if k not in series_cols)
        return d.get(s, 0)

    if any(s not in series_cols for s in all_series_seen):
        cols = series_cols + [OTHER_SERIES]
    else:
        cols = series_cols

    wb = xlwt.Workbook(encoding="utf-8")
    ws = wb.add_sheet("汇总")

    ncol_total = 8 + len(cols)
    ts = title_style(source)
    ws.merge(0, 0, 0, ncol_total - 1)
    ws.write(0, 0, OUT_TITLE_SUMMARY, ts)
    ws.row(0).height_mismatch = True
    ws.row(0).height = 30 * 20

    ws.merge(1, 1, 0, ncol_total - 1)
    ws.write(1, 0, "日期:%s" % report_date, date_style(source))
    ws.row(1).height_mismatch = True
    ws.row(1).height = 16 * 20

    # ---- 表头：两行 ----
    # 注意：xlwt 不允许向「已合并区域的内部单元」再写值（会抛
    # "Attempt to overwrite cell"），所以：
    #   - 只有横跨两行的分组才能用纵向 merge(2,3,...)，且只在顶格写一次；
    #   - 凡该列第二行还要写子表头的分组，只能在同一行内横向 merge(2,2,...)。
    ws.merge(2, 3, 0, 0)
    ws.write(2, 0, "业务科室", ST_HDR_GROUP)
    ws.merge(2, 2, 1, 2)                       # 横向合并：第二行还要写子表头
    ws.write(2, 1, "合计", ST_HDR_GROUP)
    ws.merge(2, 3, 3, 3)
    ws.write(2, 3, "探井(口)", ST_HDR_GROUP)
    ws.merge(2, 3, 4, 4)
    ws.write(2, 4, "开发井(口)", ST_HDR_GROUP)
    ws.merge(2, 3, 5, 5)
    ws.write(2, 5, "自营(口)", ST_HDR_GROUP)
    ws.merge(2, 3, 6, 6)
    ws.write(2, 6, "合作(口)", ST_HDR_GROUP)
    ws.merge(2, 3, 7, 7)
    ws.write(2, 7, "动用队伍(支)", ST_HDR_GROUP)
    ws.merge(2, 2, 8, ncol_total - 1)          # 横向合并
    ws.write(2, 8, "录井系列（口）", ST_HDR_GROUP)

    # 第二行子表头（仅写在未参与纵向合并的列上）
    ws.write(3, 1, "井数(口)", ST_HDR_SUB)
    ws.write(3, 2, "累计进尺(m)", ST_HDR_SUB)
    for j, s in enumerate(cols):
        ws.write(3, 8 + j, s, ST_HDR_SUB)

    ws.row(2).height_mismatch = True
    ws.row(2).height = 22 * 20
    ws.row(3).height_mismatch = True
    ws.row(3).height = 22 * 20

    # ---- 数据行 ----
    r = 4
    ordered_units = sorted(agg.items(), key=lambda kv: -kv[1]["count"])
    for unit, d in ordered_units + [("合计", total)]:
        is_total = (unit == "合计")
        st_l = ST_TOTAL_L if is_total else ST_BODY_L
        st_n = ST_TOTAL if is_total else ST_BODY
        ws.write(r, 0, unit, st_l)
        ws.write(r, 1, d["count"], st_n)
        ws.write(r, 2, fmt_num(d["depth"]), st_n)
        ws.write(r, 3, d["explore"], st_n)
        ws.write(r, 4, d["develop"], st_n)
        ws.write(r, 5, d["own"], st_n)
        ws.write(r, 6, d["coop"], st_n)
        ws.write(r, 7, len(d["teams"]), st_n)
        for j, s in enumerate(cols):
            ws.write(r, 8 + j, series_value(d["series"], s), st_n)
        r += 1

    # ---- 批注 ----
    notes = [
        "口径说明：",
        "1. 井数按【有效井】统计，已剔除未录井、已完井的井（详见处理报告）。",
        "2. 进尺口径＝源表「当日井深(m)」按井求和；源表无独立进尺字段，亦无昨日井深，故无法算当日增量进尺。",
        "3. 录井系列为复合字段（如「综合+地质导向+液面监测」），已按分隔符拆分分项计数，故各系列之和 ≥ 井数。",
        "4. 探井含：%s；开发井含：%s。源文件井别共 14 种，未列出的井别不计入该两列但仍计入井数。"
        % ("、".join(sorted(EXPLORE_TYPES)), "、".join(sorted(DEVELOP_TYPES))),
        "5. 动用队伍按「录井队号」去重计数；源表无队伍总数与未动用数，本表未填。"
        "本日 %d 口井未填报队号，故「动用队伍」为下界。"
        "各科行列相加可能大于合计行：同一支队伍跨科室服务时，合计行按队号全局去重。"
        % sum(1 for row in kept if not source.cell(row, "录井队号")),
    ]
    r += 1
    for n in notes:
        ws.merge(r, r, 0, ncol_total - 1)
        ws.write(r, 0, n, ST_NOTE)
        ws.row(r).height_mismatch = True
        ws.row(r).height = 16 * 20
        r += 1

    for c, w in enumerate([16, 10, 14, 10, 11, 10, 10, 12] + [11] * len(cols)):
        ws.col(c).width = w * 256

    ws.set_panes_frozen(True)
    ws.set_horz_split_pos(4)
    ws.set_vert_split_pos(1)

    wb.save(path)
    return len(ordered_units) + 1  # 行数（含合计）


# ============================================================================
# 九、报表丙：地质研究院生产市场动态表（按服务油田×设备类型）
# ============================================================================

def build_market(source, kept, path, report_date, oilfield_list=None, roster=None):
    """按「地区(服务油田)」×「录井系列(设备类型)」统计动用队伍、井数、进尺。"""
    def new_bucket():
        return {"own_teams": set(), "co_teams": set(),
                "own_wells": 0, "co_wells": 0,
                "own_depth": 0.0, "co_depth": 0.0}

    grid = OrderedDict()   # (油田, 系列) -> dict
    total = defaultdict(new_bucket)

    # 去重口径：同一口井在本表里会出现在多个「设备类型」行上，
    # 井数与进尺若按行累加会被放大。这里另按井号去重保存一份，
    # 最后与「按设备类型累加」并列输出，避免读者误把 173 当成实有井数。
    wells_seen = OrderedDict()     # 井号 -> (油田, 系列列表, 是否自营, 井深)
    depth_dict = {}

    def cellof(key):
        if key not in grid:
            grid[key] = new_bucket()
        return grid[key]

    for row in kept:
        field = source.cell(row, "地区") or "(未填)"
        series_list = split_series(source.cell(row, "录井系列")) or ["(未填)"]
        owner = OWNERSHIP_MAP.get(source.cell(row, "DWTYPE"), "")
        depth = num_of(source.cell(row, "当日井深"), where=source.cell(row, "井号"))
        depth = depth if depth is not None else 0.0
        team = source.cell(row, "录井队号")
        well = source.cell(row, "井号")
        is_own = (owner == "自营")
        if well not in wells_seen:
            wells_seen[well] = True
            depth_dict[well] = (depth, is_own)
        for s in series_list:
            d = cellof((field, s))
            t = total[s]
            is_own = (owner == "自营")
            if is_own:
                d["own_wells"] += 1
                d["own_depth"] += depth
                t["own_wells"] += 1
                t["own_depth"] += depth
                if team:
                    d["own_teams"].add(team)
                    t["own_teams"].add(team)
            else:
                d["co_wells"] += 1
                d["co_depth"] += depth
                t["co_wells"] += 1
                t["co_depth"] += depth
                if team:
                    d["co_teams"].add(team)
                    t["co_teams"].add(team)

    fields = oilfield_list if oilfield_list else sorted(set(k[0] for k in grid), key=str)

    wb = xlwt.Workbook(encoding="utf-8")
    ws = wb.add_sheet("队伍动用情况")

    ncol = 9
    ts = title_style(source)
    ws.merge(0, 0, 0, ncol - 1)
    ws.write(0, 0, OUT_TITLE_MARKET, ts)
    ws.row(0).height_mismatch = True
    ws.row(0).height = 30 * 20

    ws.merge(1, 1, 0, ncol - 1)
    ws.write(1, 0, "填报时间：%s" % report_date, date_style(source))
    ws.row(1).height_mismatch = True
    ws.row(1).height = 16 * 20

    # 表头两行。同 build_summary 的约束：带子表头的分组只做行内横向合并，
    # 只有独占两行的列才纵向合并。
    ws.merge(2, 3, 0, 0)
    ws.write(2, 0, "服务油田", ST_HDR_GROUP)
    ws.merge(2, 3, 1, 1)
    ws.write(2, 1, "设备类型", ST_HDR_GROUP)
    ws.merge(2, 2, 2, 4)                       # 横向合并
    ws.write(2, 2, "自营队伍", ST_HDR_GROUP)
    ws.merge(2, 2, 5, 7)                       # 横向合并
    ws.write(2, 5, "合作队伍", ST_HDR_GROUP)
    ws.merge(2, 3, 8, 8)
    ws.write(2, 8, "合计进尺(m)", ST_HDR_GROUP)

    subs = ["动用队伍(支)", "井数(口)", "累计进尺(m)"]
    for base in (2, 5):
        for j, s in enumerate(subs):
            ws.write(3, base + j, s, ST_HDR_SUB)

    ws.row(2).height_mismatch = True
    ws.row(2).height = 22 * 20
    ws.row(3).height_mismatch = True
    ws.row(3).height = 22 * 20

    # 数据行：油田纵向合并
    r = 4
    for field in fields:
        series_in = [s for (f, s) in grid if f == field] or ["(无井)"]
        start = r
        for s in series_in:
            d = grid.get((field, s))
            if d is None:
                d = {"own_teams": set(), "co_teams": set(), "own_wells": 0,
                     "co_wells": 0, "own_depth": 0.0, "co_depth": 0.0}
            ws.write(r, 1, s, ST_BODY)
            ws.write(r, 2, len(d["own_teams"]), ST_BODY)
            ws.write(r, 3, d["own_wells"], ST_BODY)
            ws.write(r, 4, fmt_num(d["own_depth"]), ST_BODY)
            ws.write(r, 5, len(d["co_teams"]), ST_BODY)
            ws.write(r, 6, d["co_wells"], ST_BODY)
            ws.write(r, 7, fmt_num(d["co_depth"]), ST_BODY)
            ws.write(r, 8, fmt_num(d["own_depth"] + d["co_depth"]), ST_BODY)
            r += 1
        if r - 1 > start:
            ws.merge(start, r - 1, 0, 0)
        ws.write(start, 0, field, ST_BODY_L)

    # 合计行
    g = {"own_teams": set(), "co_teams": set(), "own_wells": 0, "co_wells": 0,
         "own_depth": 0.0, "co_depth": 0.0}
    for s, t in total.items():
        g["own_teams"] |= t["own_teams"]
        g["co_teams"] |= t["co_teams"]
        g["own_wells"] += t["own_wells"]
        g["co_wells"] += t["co_wells"]
        g["own_depth"] += t["own_depth"]
        g["co_depth"] += t["co_depth"]
    ws.write(r, 0, "合计", ST_TOTAL_L)
    ws.write(r, 1, "", ST_TOTAL)
    ws.write(r, 2, len(g["own_teams"]), ST_TOTAL)
    ws.write(r, 3, g["own_wells"], ST_TOTAL)
    ws.write(r, 4, fmt_num(g["own_depth"]), ST_TOTAL)
    ws.write(r, 5, len(g["co_teams"]), ST_TOTAL)
    ws.write(r, 6, g["co_wells"], ST_TOTAL)
    ws.write(r, 7, fmt_num(g["co_depth"]), ST_TOTAL)
    ws.write(r, 8, fmt_num(g["own_depth"] + g["co_depth"]), ST_TOTAL)

    # 去重实有：同一口井在上表里会出现于多个「设备类型」行，
    # 井数与进尺按行累加会被放大。这里按井号去重另出一行的真实值，
    # 两个数目并列呈现，读者不会把 173 误当成实有井数。
    u_own = sum(1 for v in depth_dict.values() if v[1])
    u_all = len(depth_dict)
    u_own_d = sum(v[0] for v in depth_dict.values() if v[1])
    u_co_d = sum(v[0] for v in depth_dict.values() if not v[1])
    r += 1
    ws.write(r, 0, "实有（按井去重）", ST_TOTAL_L)
    ws.write(r, 1, "全类型合并", ST_TOTAL)
    ws.write(r, 2, len(g["own_teams"]), ST_TOTAL)
    ws.write(r, 3, u_own, ST_TOTAL)
    ws.write(r, 4, fmt_num(u_own_d), ST_TOTAL)
    ws.write(r, 5, len(g["co_teams"]), ST_TOTAL)
    ws.write(r, 6, u_all - u_own, ST_TOTAL)
    ws.write(r, 7, fmt_num(u_co_d), ST_TOTAL)
    ws.write(r, 8, fmt_num(u_own_d + u_co_d), ST_TOTAL)
    total_row = r

    n_multi = sum(1 for row in kept
                  if len(split_series(source.cell(row, "录井系列"))) > 1)
    no_team = sum(1 for row in kept if not source.cell(row, "录井队号"))

    # 批注
    r += 1
    notes = [
        "口径说明：",
        "1. 自营/合作按源表 DWTYPE 字段划分；服务油田取源表「地区」，设备类型取「录井系列」。",
        "2. 动用队伍按「录井队号」去重；源表无队伍总数、未动用数、年累完成天，本表未填、不推算。",
        "3. 录井系列为复合字段，本日 %d 口井中有 %d 口同时填了多个系列，"
        "一口井会分别计入每个设备类型行。因此上方「合计」行的井数与进尺是**按类型累加**值；"
        "全院实有井数 %d 口、实有进尺 %s m，见紧随其后的「实有（按井去重）」行。"
        % (len(kept), n_multi, u_all, fmt_num(u_own_d + u_co_d)),
        "4. 本日 %d 口井未填报录井队号：这些井计入井数与进尺，但不产生任何队伍，"
        "故各行列出的「动用队伍」是下界，不是实际动用数。" % no_team,
        "5. 进尺口径＝源表「当日井深(m)」求和，为该井累计井深，非当日增量进尺"
        "（源表无昨日井深，无法计算增量）。",
    ]
    for n in notes:
        ws.merge(r, r, 0, ncol - 1)
        ws.write(r, 0, n, ST_NOTE)
        ws.row(r).height_mismatch = True
        ws.row(r).height = 16 * 20
        r += 1

    for c, w in enumerate([18, 14, 14, 12, 14, 14, 12, 14, 14]):
        ws.col(c).width = w * 256

    ws.set_panes_frozen(True)
    ws.set_horz_split_pos(4)
    ws.set_vert_split_pos(2)

    wb.save(path)
    return r - 1, len(fields)


# ============================================================================
# 十、处理报告（条数校验）
# ============================================================================

def write_report(source, kept, dropped, report_date, out_paths, mode, path, date_offset):
    lines = []
    A = lines.append
    A("# 日报汇总处理报告")
    A("")
    A("- 生成时间：%s" % datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    A("- 源文件：`%s`" % source.path)
    A("- 源文件数据行数：**%d**" % source.nrows)
    A("- 数据日期：**%s**（成品日期 = 数据日期 %+d 天 = **%s**）"
      % (source.data_date, date_offset, report_date))
    A("- 筛选模式：**%s**" % mode)
    A("")
    A("## 一、条数校验")
    A("")
    A("| 项目 | 条数 |")
    A("|---|---|")
    A("| 源文件数据行 | %d |" % source.nrows)
    A("| 剔除 | %d |" % len(dropped))
    A("| 保留 | %d |" % len(kept))
    A("| 校验 | %s |" % ("通过 ✅  %d + %d = %d"
                        % (len(dropped), len(kept), source.nrows)
                        if len(dropped) + len(kept) == source.nrows else "**不通过 ❌**"))
    A("")
    A("## 二、剔除明细（%d 条）" % len(dropped))
    A("")
    if dropped:
        A("| 源行号 | 井号 | 地区 | 施工状态 | 剔除原因 |")
        A("|---|---|---|---|---|")
        for row, reason in dropped:
            A("| %d | %s | %s | %s | %s |" % (
                row["src_row"] + 1,
                source.cell(row, "井号"),
                source.cell(row, "地区"),
                source.cell(row, "施工状态"),
                reason))
    else:
        A("无。")
    A("")
    A("## 三、疑似状态矛盾井复核清单（%d 条，保留入表待人工确认）" % len(SUSPECT_WELLS))
    A("")
    if SUSPECT_WELLS:
        A("剔除口径：完井日期非空 且 施工状态为 完井作业/修井。")
        A("以下井「完井日期」与「施工状态」不匹配，按疑点保留，请逐口人工复核：")
        A("")
        A("| 源行号 | 井号 | 施工状态 | 完井日期 | 当日井深 | 疑点 |")
        A("|---|---|---|---|---|---|")
        for s in SUSPECT_WELLS:
            A("| %s | %s | %s | %s | %s | %s |" % (
                s.get("src_row", "—"), s["well"], s["status"] or "（空）",
                s["done"] or "（空）", s["depth"] or "（空）", s["note"]))
    else:
        A("无。")
    A("")
    A("## 四、产出文件")
    A("")
    A("| 文件 | 大小(字节) |")
    A("|---|---|")
    for k, p in out_paths.items():
        A("| `%s` | %d |" % (os.path.basename(p), os.path.getsize(p)))
    A("")
    A("## 五、本批数据的口径提示")
    A("")
    owners = defaultdict(int)
    for row in kept:
        owners[OWNERSHIP_MAP.get(source.cell(row, "DWTYPE"), "(未知)")] += 1
    own = sum(1 for row in kept if source.cell(row, "DWTYPE") == "自营")
    co = sum(1 for row in kept if source.cell(row, "DWTYPE") == "合作")
    A("1. 保留 %d 口中：自营 %d 口、合作 %d 口%s。" % (
        len(kept), own, co,
        "" if own + co == len(kept)
        else "，另有 %d 口 DWTYPE 未填或为其它值（见下方告警）"
             % (len(kept) - own - co)))
    A("2. 涉及业务科室 %d 个、地区 %d 个。"
      % (len(set(source.cell(r, "录井分公司") for r in kept)),
         len(set(source.cell(r, "地区") for r in kept))))
    A("3. 源表所有单元格均以**文本**存储（含 `5600.0000` 这类数值），成品已按原样保留其字面值。")

    # ---- 口径告警：宁可列出也不静默 ----
    A("")
    A("## 六、数据口径告警")
    A("")
    warns = []
    n_no_team = sum(1 for row in kept if not source.cell(row, "录井队号"))
    if n_no_team:
        warns.append("**%d 口井未填报录井队号**（占保留井 %.1f%%）：这些井正常计入井数与进尺，"
                     "但不计入动用队伍，故两张汇总表的「动用队伍」均为下界。"
                     % (n_no_team, n_no_team * 100.0 / max(len(kept), 1)))
    n_multi = sum(1 for row in kept
                  if len(split_series(source.cell(row, "录井系列"))) > 1)
    if n_multi:
        warns.append("**%d 口井填报了多个录井系列**：动态表按设备类型拆分后会被重复计入，"
                     "「合计」行的井数与进尺大于实有值；实有值见该表「实有（按井去重）」行。"
                     % n_multi)
    if NUM_FAILS:
        shows = "、".join("%s=%r" % (w, v) for w, v in NUM_FAILS[:8])
        warns.append("**%d 个井深值无法解析为数字，已按 0 计入**：%s。请回头核对源表。"
                     % (len(NUM_FAILS), shows))
    if DATE_FUTURE:
        shows = "、".join("%s(%s %s)" % (w, f, v) for w, f, v in DATE_FUTURE[:8])
        warns.append("**%d 口井的日期晚于报告日 %s，未剔除**：%s。疑为填报笔误。"
                     % (len(DATE_FUTURE), report_date, shows))
    if source.col_warn:
        warns.append("**列定位提示**：" + "；".join(source.col_warn))
    unk = sorted(set(source.cell(row, "井别") for row in kept)
                 - set(WELL_TYPE_MAP))
    if unk:
        warns.append("**未归入探井/开发井的井别**：%s（仍计入井数）。请扩充 WELL_TYPE_MAP。"
                     % "、".join(unk))
    unkown = sorted(set(source.cell(row, "DWTYPE") for row in kept)
                    - set(OWNERSHIP_MAP))
    if unkown:
        warns.append("**DWTYPE 取值不在（自营/合作）之内**：%s（仍计入井数）。请确认填报。"
                     % "、".join(repr(x) for x in unkown))
    if not warns:
        A("本批数据未触发任何口径告警。")
    else:
        for i, w in enumerate(warns, 1):
            A("%d. %s" % (i, w))

    with io.open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    return path


# ============================================================================
# 十一、自检
# ============================================================================

def selfcheck():
    """用内置样例验证核心逻辑，不触碰磁盘上的业务文件。"""
    ok = True

    def chk(name, cond):
        nonlocal ok
        print("  [%s] %s" % ("OK " if cond else "FAIL", name))
        if not cond:
            ok = False

    print("== 自检 ==")

    chk("拆分复合录井系列", split_series("综合+地质导向+液面监测") ==
        ["综合", "地质导向", "液面监测"])
    chk("系列别名归一 综合录井→综合",
        split_series("综合录井") == ["综合"])
    chk("系列别名归一 池体积检测→池体积监测",
        split_series("气测+常规、池体积检测") == ["气测", "常规", "池体积监测"])
    chk("井别归并 预探井→探井", WELL_TYPE_MAP.get("预探井") == "探井")
    chk("井别归并 采油井→开发井", WELL_TYPE_MAP.get("采油井") == "开发井")
    chk("日期解析", str(parse_date("日期:2026-09-11")) == "2026-09-11")
    chk("数值格式化整数不带小数点", fmt_num(36011.0) == "36011")
    chk("空值转 None", num_of("") is None)
    chk("文本原样保留", num_of("5600.0000") == 5600.0)

    # 井数守恒：构造伪 Source 验证 filter_rows 不丢行
    class _Fake(object):
        def __init__(self, rows):
            self.raw_rows = rows
            self.col = dict(COL)

        def cell(self, row, name):
            return row["vals"][COL[name]]

    def mk(depth, done, well, status=""):
        vals = [""] * 26
        vals[COL["当日井深"]] = depth
        vals[COL["完井日期"]] = done
        vals[COL["井号"]] = well
        vals[COL["施工状态"]] = status
        return {"src_row": 0, "vals": vals}

    del SUSPECT_WELLS[:]
    src = _Fake([mk("100", "", "A"), mk("", "", "B"),
                 mk("200", "2026-01-01", "C", "完井作业"),
                 mk("300", "", "D"),
                 mk("400", "2026-01-01", "E", "三开固井 候凝"),
                 mk("500", "", "F", "完井作业")])
    kept, dropped = filter_rows(src, "semantic")
    chk("semantic 模式：剔无进尺+状态口径已完井，保留 4 条", len(kept) == 4)
    chk("semantic 模式：条数守恒 2+4=6", len(kept) + len(dropped) == 6)
    names_dropped = sorted(w["vals"][COL["井号"]] for w, _ in dropped)
    chk("semantic 模式：剔除的是 B(未录井) 和 C(完井作业+日期)",
        names_dropped == ["B", "C"])
    suspect_names = sorted(s["well"] for s in SUSPECT_WELLS)
    chk("semantic 模式：疑点井 = E(候凝却填日期) + F(完井作业却无日期)",
        suspect_names == ["E", "F"])
    chk("status_is_done：子串命中", status_is_done("起钻 下套管 固井 完井作业"))
    chk("status_is_done：普通状态不命中", not status_is_done("四开"))

    kept2, dropped2 = filter_rows(src, "history")
    chk("history 模式：仅剔除无进尺，保留 5 条", len(kept2) == 5)

    kept3, dropped3 = filter_rows(src, "none")
    chk("none 模式：全部保留 6 条", len(kept3) == 6)

    # 样式工具可构造
    chk("构造标题样式不报错", title_style(None) is not None)
    chk("构造表体样式不报错", body_style() is not None)

    print("== 自检结束：%s ==" % ("全部通过" if ok else "存在失败项"))
    return 0 if ok else 1


# ============================================================================
# 十二、主流程
# ============================================================================

def safe_target(outdir, name, overwrite, backup_root):
    """目标文件已存在时先备份，避免覆盖历史件。"""
    p = os.path.join(outdir, name)
    if os.path.exists(p):
        if not overwrite:
            p = os.path.join(outdir, name.replace(".xls", "")) + "-新稿.xls"
        else:
            os.makedirs(backup_root, exist_ok=True)
            shutil.copy2(p, os.path.join(backup_root, name))
    return p


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="由《日报.xls》生成三张院级汇报表（生产日报/综合日报/生产市场动态表）")
    ap.add_argument("--src", help="日报源 .xls 路径")
    ap.add_argument("--outdir", help="输出目录，默认同源文件目录")
    ap.add_argument("--report-date", help="成品日期 YYYY-MM-DD，优先级最高")
    ap.add_argument("--date-offset", type=int, default=OFFSET_DAYS,
                    help="成品日期 = 数据日期 + N 天（历史样例为 1，默认 %d）" % OFFSET_DAYS)
    ap.add_argument("--mode", choices=["history", "semantic", "none"], default="history",
                    help="剔除口径：history=复刻历史(默认) / semantic=严格语义 / none=不剔除")
    ap.add_argument("--exclude-file", help="外部剔除清单（每行一个井号或施工状态）")
    ap.add_argument("--exclude-well", action="append", default=[],
                    help="额外剔除井号，可重复")
    ap.add_argument("--oilfield-list", help="固定服务油田清单文件（每行一个），用于输出固定骨架")
    ap.add_argument("--overwrite", action="store_true", help="允许覆盖同名历史文件（自动备份）")
    ap.add_argument("--selfcheck", action="store_true", help="跑内置自检后退出")
    args = ap.parse_args(argv)

    if args.selfcheck:
        return selfcheck()

    if not args.src:
        ap.error("必须提供 --src（或用 --selfcheck 跑自检）")

    src_path = os.path.abspath(args.src)
    outdir = os.path.abspath(args.outdir or os.path.dirname(src_path))
    if not os.path.isdir(outdir):
        os.makedirs(outdir)

    log("=" * 70)
    log("日报汇总：%s" % os.path.basename(src_path))
    log("=" * 70)

    try:
        source = Source(src_path)
    except Exception as e:
        log("读取源文件失败：%r" % e)
        return 2

    # ---- 源文件概览 ----
    log("")
    log("[1] 源文件概览")
    log("    工作表    : %s" % (source.book.sheet_names()[SHEET_INDEX]))
    log("    尺寸      : %d 行 x %d 列（含标题/日期/表头）" %
        (source.sheet.nrows, source.ncols))
    log("    表头(26列): %s" % " | ".join(source.header))
    log("    数据行    : %d" % source.nrows)
    log("    数据日期  : %s" % source.data_date)
    if source.raw_rows:
        sample = source.raw_rows[0]
        cells = " | ".join(
            "%s=%s" % (source.header[i][:6], (sample["vals"][i][:14] or "空"))
            for i in range(min(6, source.ncols)))
        log("    示例数据行: %s" % cells)

    # ---- 成品日期 ----
    if args.report_date:
        d = parse_date(args.report_date)
        if d is None:
            log("无效的 --report-date：%s" % args.report_date)
            return 2
        report_date = d
    else:
        if source.data_date is None:
            report_date = datetime.date.today()
            log("    ! 未能从源文件解析数据日期，使用今天 %s" % report_date)
        else:
            report_date = source.data_date + datetime.timedelta(days=args.date_offset)
    date_str = report_date.strftime("%Y-%m-%d")
    log("    成品日期  : %s（数据日期 %+d 天）" % (date_str, args.date_offset))

    # ---- 筛选 ----
    log("")
    log("[2] 井号筛选（模式=%s）" % args.mode)
    exclude_items = None
    if args.exclude_file:
        try:
            exclude_items = load_exclude_file(args.exclude_file)
            log("    已加载外部剔除清单 %d 条" % len(exclude_items))
        except Exception as e:
            log("    外部剔除清单读取失败：%r" % e)
            return 2

    del NUM_FAILS[:]
    del DATE_FUTURE[:]
    kept, dropped = filter_rows(source, args.mode, exclude_items,
                                args.exclude_well, report_date)

    for w in source.col_warn:
        log("    ! 列定位：%s" % w)

    log("    源文件数据行 : %d" % source.nrows)
    log("    剔除         : %d" % len(dropped))
    for row, reason in dropped:
        log("        - %-12s %-10s %s" % (
            source.cell(row, "井号"), source.cell(row, "施工状态")[:10], reason))
    log("    保留         : %d" % len(kept))
    if len(kept) + len(dropped) != source.nrows:
        log("    !! 条数校验不通过：%d + %d != %d" %
            (len(dropped), len(kept), source.nrows))
        return 3
    log("    条数校验     : 通过（%d + %d = %d）" % (len(dropped), len(kept), source.nrows))
    if SUSPECT_WELLS:
        log("    疑点井       : %d 口（保留入表，详见处理报告复核清单）" % len(SUSPECT_WELLS))
        for s in SUSPECT_WELLS:
            log("        ? %-12s %-10s %s" % (s["well"], s["status"][:10], s["note"]))

    # 井号重复会让所有计数成倍虚高，而上面的条数校验发现不了
    well_counts = defaultdict(int)
    for row in source.raw_rows:
        well_counts[source.cell(row, "井号") or "(无井号)"] += 1
    dupw = sorted((w, c) for w, c in well_counts.items() if c > 1)
    if dupw:
        log("    !! 源表存在重复井号 %d 个，这些井会被重复计数：" % len(dupw))
        for w, c in dupw[:10]:
            log("         %-16s 出现 %d 次" % (w, c))
    else:
        log("    井号唯一性  : %d 口井无重复" % len(well_counts))

    # ---- 读取可选清单 ----
    oilfield_list = None
    if args.oilfield_list:
        try:
            oilfield_list = load_exclude_file(args.oilfield_list)
        except Exception as e:
            log("    服务油田清单读取失败：%r" % e)
            return 2

    # ---- 输出 ----
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_root = os.path.join(outdir, "_backup_%s" % stamp)

    log("")
    log("[3] 生成输出")
    out_paths = OrderedDict()
    try:
        p = safe_target(outdir, FILE_TPL["production"] % date_str,
                        args.overwrite, backup_root)
        n = build_production(source, kept, p, date_str)
        out_paths["production"] = p
        log("    生产日报      : %s （数据行 %d）" % (os.path.basename(p), n))

        p = safe_target(outdir, FILE_TPL["summary"] % date_str,
                        args.overwrite, backup_root)
        build_summary(source, kept, p, date_str)
        out_paths["summary"] = p
        log("    综合日报      : %s" % os.path.basename(p))

        p = safe_target(outdir, FILE_TPL["market"] % date_str,
                        args.overwrite, backup_root)
        build_market(source, kept, p, date_str, oilfield_list)
        out_paths["market"] = p
        log("    生产市场动态表: %s" % os.path.basename(p))
    except Exception as e:
        log("生成失败：%r" % e)
        return 4

    # ---- 处理报告 ----
    rep = os.path.join(outdir, "日报汇总处理报告-%s.md" % date_str)
    write_report(source, kept, dropped, date_str, out_paths,
                 args.mode, rep, args.date_offset)
    log("")
    log("[4] 处理报告：%s" % os.path.basename(rep))
    log("")
    log("完成。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
